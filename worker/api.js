// 小游戏接口：/api/login /api/score /api/leaderboard
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
// 榜单固定只出前 6 名，和客户端面板的行数一致
const LIST_LIMIT = 6;
// 榜单是纯读，5 分钟内复用同一份结果，避免每个玩家开榜都重扫一遍分桶
const LEADERBOARD_TTL_SECONDS = 5 * 60;
// 前 6 名和分数直方图是全局数据，5 分钟内跨用户复用
const LEADERBOARD_LIST_CACHE = "/leaderboard-list";
// v2：旧版缓存值是数组，换 key 避免新代码读到旧格式
const LEADERBOARD_HISTOGRAM_CACHE = "/leaderboard-histogram-v2";
// 同分并列同名次；同分时列表顺序仍按达成时间、再按 openid 保证稳定
const RANK_ORDER = "best_score DESC, best_at ASC, openid ASC";

const json = (data, status = 200, maxAge = 0) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": maxAge ? `public, max-age=${maxAge}` : "no-store",
    },
  });

const readCacheJson = async (key) => {
  const cached = await caches.default.match(key);

  if (!cached) {
    return null;
  }

  try {
    return await cached.json();
  } catch (error) {
    return null;
  }
};

const writeCacheJson = (key, data) =>
  caches.default.put(key, json(data, 200, LEADERBOARD_TTL_SECONDS));

const toBase64Url = (buffer) =>
  btoa(String.fromCharCode(...new Uint8Array(buffer)))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

const fromBase64Url = (value) => {
  const base64 = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(base64 + "=".repeat((4 - (base64.length % 4)) % 4));

  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
};

const toHex = (buffer) =>
  Array.from(new Uint8Array(buffer), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");

// 昵称不暴露 openid，改用它的 SHA-256 前 8 位，同一用户始终稳定
async function createNickname(openid) {
  const digest = await crypto.subtle.digest(
    "SHA-256",
    new TextEncoder().encode(openid),
  );

  return `奶蛙${toHex(digest).slice(0, 8)}`;
}

const importKey = (secret) =>
  crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign", "verify"],
  );

async function createToken(openid, secret) {
  const payload = toBase64Url(
    new TextEncoder().encode(
      JSON.stringify({
        openid,
        exp: Math.floor(Date.now() / 1000) + TOKEN_TTL_SECONDS,
      }),
    ),
  );
  const signature = await crypto.subtle.sign(
    "HMAC",
    await importKey(secret),
    new TextEncoder().encode(payload),
  );

  return `${payload}.${toBase64Url(signature)}`;
}

// 缺失、过期、签名不对的 token 一律当未登录，返回空 openid
async function readToken(token, secret) {
  const [payload, signature] = String(token || "").split(".");

  if (!payload || !signature) {
    return "";
  }

  try {
    const isValid = await crypto.subtle.verify(
      "HMAC",
      await importKey(secret),
      fromBase64Url(signature),
      new TextEncoder().encode(payload),
    );

    if (!isValid) {
      return "";
    }

    const { openid, exp } = JSON.parse(
      new TextDecoder().decode(fromBase64Url(payload)),
    );

    return exp > Math.floor(Date.now() / 1000) ? openid : "";
  } catch (error) {
    return "";
  }
}

const readBearerToken = (request) => {
  const header = request.headers.get("authorization") || "";

  return header.startsWith("Bearer ") ? header.slice(7) : "";
};

async function readJsonBody(request) {
  try {
    const body = await request.json();

    return body && typeof body === "object" ? body : {};
  } catch (error) {
    return {};
  }
}

const readOpenid = (request, env) =>
  readToken(readBearerToken(request), env.TOKEN_SECRET);

async function handleLogin(request, env) {
  const { code } = await readJsonBody(request);

  if (!code) {
    return json({ error: "缺少 code" }, 400);
  }

  const url = new URL("https://api.weixin.qq.com/sns/jscode2session");
  url.searchParams.set("appid", env.WECHAT_APP_ID);
  url.searchParams.set("secret", env.WECHAT_APP_SECRET);
  url.searchParams.set("js_code", code);
  url.searchParams.set("grant_type", "authorization_code");

  let session = {};

  try {
    session = await (await fetch(url)).json();
  } catch (error) {
    return json({ error: "微信登录服务不可用" }, 502);
  }

  if (!session.openid) {
    return json({ error: "登录失败" }, 401);
  }

  // 登录只发 token，不写库；首次交分时才建 players 行，省掉一次写
  return json({ token: await createToken(session.openid, env.TOKEN_SECRET) });
}

async function handleScore(request, env) {
  const openid = await readOpenid(request, env);

  if (!openid) {
    return json({ error: "未登录" }, 401);
  }

  const { score } = await readJsonBody(request);

  if (!Number.isInteger(score) || score < 0) {
    return json({ error: "分数不合法" }, 400);
  }

  // 只有分数真的变高才写库；平局或更低分不产生写入
  // RETURNING 直接带回结果，省掉破纪录后的一次回查；没写成功时才回查
  const written = await env.DB.prepare(
    `INSERT INTO players (openid, nickname, best_score, best_at) VALUES (?, ?, ?, ?)
     ON CONFLICT(openid) DO UPDATE SET
       best_score = excluded.best_score,
       best_at = excluded.best_at
     WHERE excluded.best_score > players.best_score
     RETURNING best_score`,
  )
    .bind(openid, await createNickname(openid), score, Math.floor(Date.now() / 1000))
    .first();

  if (written) {
    return json({ bestScore: written.best_score });
  }

  const row = await env.DB.prepare(
    "SELECT best_score FROM players WHERE openid = ?",
  )
    .bind(openid)
    .first();

  return json({ bestScore: row ? row.best_score : score });
}

let histogramPending = null;

// 直方图只有一行 JSON，5 分钟一刷；冷启动并发只打一次库
async function readHistogram(url, env) {
  const key = new Request(new URL(LEADERBOARD_HISTOGRAM_CACHE, url));
  const cached = await readCacheJson(key);

  if (cached) {
    return cached;
  }

  if (!histogramPending) {
    histogramPending = env.DB.prepare(
      "SELECT histogram FROM score_stats WHERE id = 1",
    )
      .first()
      .then(async (row) => {
        const histogram = row ? JSON.parse(row.histogram) : {};

        await writeCacheJson(key, histogram);

        return histogram;
      })
      .finally(() => {
        histogramPending = null;
      });
  }

  return histogramPending;
}

async function readMyRank(openid, env, readHistogram) {
  if (!openid) {
    return null;
  }

  // 自己的那一行走主键查，只读 1 行
  const me = await env.DB.prepare(
    "SELECT nickname, best_score FROM players WHERE openid = ?",
  )
    .bind(openid)
    .first();

  if (!me) {
    return null;
  }

  if (me.best_score <= 0) {
    return { rank: null, score: 0, nickname: me.nickname || "" };
  }

  // 名次 = 比我分高的人数 + 1；直方图最多旧 5 分钟，自己的最新分已经在 me 里
  const histogram = await readHistogram();
  let higher = 0;

  for (const [score, count] of Object.entries(histogram)) {
    if (Number(score) > me.best_score) higher += count;
  }

  return {
    rank: higher + 1,
    score: me.best_score,
    nickname: me.nickname || "",
  };
}

async function handleLeaderboard(request, env) {
  const url = new URL(request.url);
  const fresh = url.searchParams.get("fresh") === "1";
  const openid = await readOpenid(request, env);

  // 榜单只读 6 行，走 players_rank 覆盖索引；fresh=1 顺带刷新，破纪录后能看到自己
  const listKey = new Request(new URL(LEADERBOARD_LIST_CACHE, url));
  let results = fresh ? null : await readCacheJson(listKey);

  if (!results) {
    results = (
      await env.DB.prepare(
        `SELECT openid, nickname, best_score FROM players WHERE best_score > 0
         ORDER BY ${RANK_ORDER} LIMIT ?`,
      )
        .bind(LIST_LIMIT)
        .all()
    ).results;
    await writeCacheJson(listKey, results);
  }

  // 同分并列同名次：名次从相邻两行的分数推出来，不用再查一次库
  let rank = 0;
  const list = results.map((row, index) => {
    if (index === 0 || row.best_score !== results[index - 1].best_score) rank = index + 1;

    return {
      rank,
      nickname: row.nickname || "匿名奶蛙",
      score: row.best_score,
    };
  });

  // 已经在前 6 名时榜单项就是自己，不用再算一次名次（省掉整段桶查询）
  const mine = openid ? results.findIndex((row) => row.openid === openid) : -1;

  const payload =
    mine >= 0
      ? {
          list,
          me: {
            rank: list[mine].rank,
            score: results[mine].best_score,
            nickname: results[mine].nickname || "",
          },
        }
      : { list, me: await readMyRank(openid, env, () => readHistogram(url, env)) };

  return json(payload, 200, LEADERBOARD_TTL_SECONDS);
}

const ROUTES = {
  "POST login": handleLogin,
  "POST score": handleScore,
  "GET leaderboard": handleLeaderboard,
};

export async function handleApi(request, env) {
  const path = new URL(request.url).pathname
    .replace(/^\/api\/?/, "")
    .replace(/\/+$/, "");
  const handler = ROUTES[`${request.method} ${path}`];

  if (!handler) {
    return json({ error: "接口不存在" }, 404);
  }

  return handler(request, env);
}
