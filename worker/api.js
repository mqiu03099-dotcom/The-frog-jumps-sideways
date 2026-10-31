// 小游戏接口：/api/login /api/score /api/leaderboard
const TOKEN_TTL_SECONDS = 7 * 24 * 60 * 60;
// 榜单固定只出前 6 名，和客户端面板的行数一致
const LIST_LIMIT = 6;
// 列表和个人名次必须共用同一套排序，否则同分时名次会和行号不一致
const RANK_ORDER = "best_score DESC, best_at ASC, openid ASC";

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
    },
  });

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

  // 有就正常登录，没有就注册；昵称用哈希值，不额外请求微信用户信息
  const nickname = await createNickname(session.openid);

  await env.DB.prepare(
    `INSERT INTO players (openid, nickname, best_at) VALUES (?, ?, ?)
     ON CONFLICT(openid) DO NOTHING`,
  )
    .bind(session.openid, nickname, Math.floor(Date.now() / 1000))
    .run();

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
  await env.DB.prepare(
    `INSERT INTO players (openid, best_score, best_at) VALUES (?, ?, ?)
     ON CONFLICT(openid) DO UPDATE SET
       best_score = excluded.best_score,
       best_at = excluded.best_at
     WHERE excluded.best_score > players.best_score`,
  )
    .bind(openid, score, Math.floor(Date.now() / 1000))
    .run();

  const row = await env.DB.prepare(
    "SELECT best_score FROM players WHERE openid = ?",
  )
    .bind(openid)
    .first();

  return json({ bestScore: row ? row.best_score : score });
}

async function readMyRank(request, env) {
  const openid = await readOpenid(request, env);

  if (!openid) {
    return null;
  }

  // 自己的那一行走主键查，只读 1 行
  const me = await env.DB.prepare(
    "SELECT nickname, best_score, best_at FROM players WHERE openid = ?",
  )
    .bind(openid)
    .first();

  if (!me) {
    return null;
  }

  if (me.best_score <= 0) {
    return { rank: null, score: 0, nickname: me.nickname || "" };
  }

  // 名次 = 排在自己前面的人数 + 1，口径必须和 RANK_ORDER 一致：
  // 分数高的在前；同分 best_at 早的在前；再相同按 openid
  // 前面完整的桶由 score_buckets 汇总（几百行以内），桶内只剩少数几行要精确数
  const bucket = Math.floor(me.best_score / 10);
  const row = await env.DB.prepare(
    `SELECT
       (SELECT COALESCE(SUM(cnt), 0) FROM score_buckets WHERE bucket > ?) AS higher_buckets,
       (SELECT COUNT(*) FROM players
         WHERE best_score > ? AND best_score < ?) AS same_bucket,
       (SELECT COUNT(*) FROM players
         WHERE best_score = ? AND (best_at < ? OR (best_at = ? AND openid < ?))) AS tie_ahead`,
  )
    .bind(
      bucket,
      me.best_score,
      (bucket + 1) * 10,
      me.best_score,
      me.best_at,
      me.best_at,
      openid,
    )
    .first();

  return {
    rank: row.higher_buckets + row.same_bucket + row.tie_ahead + 1,
    score: me.best_score,
    nickname: me.nickname || "",
  };
}

async function handleLeaderboard(request, env) {
  // 榜单只读 6 行，直接走 players_rank 索引
  const { results } = await env.DB.prepare(
    `SELECT nickname, best_score FROM players WHERE best_score > 0
     ORDER BY ${RANK_ORDER} LIMIT ?`,
  )
    .bind(LIST_LIMIT)
    .all();

  const list = results.map((row, index) => ({
    rank: index + 1,
    nickname: row.nickname || "匿名奶蛙",
    score: row.best_score,
  }));

  return json({ list, me: await readMyRank(request, env) });
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
