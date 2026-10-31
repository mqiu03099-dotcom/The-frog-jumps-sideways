# 上线手册（后端 + 落地页 web/）

> 记录《奶蛙横跳》的三套环境、D1 结构和上线步骤。改环境或发布流程时同步更新这里。

## 一、三套环境

| 环境 | 小游戏 envVersion | API 域名 | Cloudflare Worker | D1 库 |
| --- | --- | --- | --- | --- |
| 本地 | develop | http://127.0.0.1:8788 | `wrangler dev`（web/ 目录） | `web/.wrangler/state`（本地文件） |
| 测试 | trial | https://milkyfrog-jump-dev.toolsbox.vip | the-frog-jumps-sideways-web-staging | milk-frog-jump-staging |
| 线上 | release | https://milkfrog.vip | milkfrog-web | milk-frog-jump |

域名映射写在 `js/config/api.js` 的 `API_BASE_URL_BY_ENV_VERSION`，改完必须重新上传体验版/重新发版才生效。

当前状态（2026-10-31）：测试环境保持原样并验证通过；线上 `milkfrog-web` 已部署到「零时使用」账号，新库已建表，临时地址为 https://milkfrog-web.icy-water-bfcd.workers.dev 。`milkfrog.vip` 待 Cloudflare Zone 激活后绑定；旧 `milkyfrog-jump.toolsbox.vip` 在新域名可访问前暂时保留。

## 二、接口与读行数

| 方法 路径 | 用途 | 鉴权 | 写库 |
| --- | --- | --- | --- |
| `POST /api/login` | `code` 换 7 天 token | 不需要 | 不写库（首次交分才建 players 行） |
| `POST /api/score` | 上报本局分数，只在破纪录时更新 | 需要 | 破纪录才写 1 行 |
| `GET /api/leaderboard` | 前 6 名 + 自己的名次 | 可选 | 不写 |

- `players_rank (best_score DESC, best_at ASC, openid ASC, nickname)` 同时覆盖榜单排序和名次统计；前 3 列顺序不能改，末尾的 
ickname` 让 6 条榜单只读索引、不回表。
- 名次不扫全表：`score_stats` 用单行 JSON 存「分数 → 人数」直方图，查询只读这 1 行；每次破纪录也只写这 1 行，不按分桶逐行写。
- 登录 token 是 HMAC 签名，不建会话表；客户端缓存 7 天，过期 401 自动重登一次。
- 昵称是 openid 的 SHA-256 前 8 位（`奶蛙xxxxxxxx`），不展示 openid 原文。
- 榜单固定 6 条，和游戏面板行数一致；不要在客户端传 `limit`。
- 客户端本地存最高分，本局不超过本地最高分就不发上报请求；服务端仍只在破纪录时写库。`POST /api/score` 破纪录时用 `RETURNING` 直接带回新分，不再回查（省 1 行读）；只有没写成功（分数没变高）才回查一次。
- 已经在前 6 名时直接用榜单项当「我」，不再跑名次查询；只有 7 名以后才读直方图。
- 客户端榜单结果缓存 60 秒，反复开关面板不重复请求；破纪录上报成功后缓存立即失效，名次仍然是新的。

## 三、首次建库

```powershell
cd D:\giteeContent\deep-sea-dash-of-the-milk-frog\web

# 线上库
npx wrangler d1 execute milk-frog-jump --remote --file=db/schema.sql

# 测试库
npx wrangler d1 execute milk-frog-jump-staging --remote --file=db/schema.sql
```

`schema.sql` 可重复执行（`IF NOT EXISTS`），末尾没有清表语句。

已执行过的增量迁移（两个库都已跑过，新库直接跑 `schema.sql` 即可）：

```powershell
npx wrangler d1 execute milk-frog-jump-staging --remote --file=db/migrations/2026-10-31-covering-rank-index.sql
npx wrangler d1 execute milk-frog-jump --remote --file=db/migrations/2026-10-31-covering-rank-index.sql
```

名次改为同分并列同名次（分数桶 1 分一桶），必须先迁移再发布 worker：

```powershell
npx wrangler d1 execute milk-frog-jump-staging --remote --file=db/migrations/2026-10-31-score-bucket-width1.sql
npx wrangler d1 execute milk-frog-jump --remote --file=db/migrations/2026-10-31-score-bucket-width1.sql
```

直方图改为单行 JSON（重建触发器并删除 `score_buckets`），同样必须先迁移再发布 worker：

```powershell
npx wrangler d1 execute milk-frog-jump-staging --remote --file=db/migrations/2026-10-31-json-histogram.sql
npx wrangler d1 execute milk-frog-jump --remote --file=db/migrations/2026-10-31-json-histogram.sql
```

## 四、密钥

两个环境各设置一次，值来自微信公众平台；**不要把密钥写进代码或提交到 Git**。

```powershell
npx wrangler secret put WECHAT_APP_ID
npx wrangler secret put WECHAT_APP_SECRET
npx wrangler secret put TOKEN_SECRET

npx wrangler secret put WECHAT_APP_ID --env staging
npx wrangler secret put WECHAT_APP_SECRET --env staging
npx wrangler secret put TOKEN_SECRET --env staging
```

两个环境的 `TOKEN_SECRET` 要不同；跨环境 token 会被拒绝，客户端会自动重登。

## 五、部署

> 本项目**没有接 Cloudflare Workers Builds / GitHub 自动构建**：`git push` 只更新代码仓库，不会发布线上。只有在本机手动执行下面的命令才会更新 Worker；如果后台以后被接上构建连接，先断开再 push。

```powershell
cd D:\giteeContent\deep-sea-dash-of-the-milk-frog\web

# 测试环境（只影响 milkyfrog-jump-dev）
npx wrangler deploy --env staging

# 线上（不带 --env）
npx wrangler deploy
```

部署后验证：

```powershell
curl.exe -s https://milkfrog.vip/api/leaderboard
curl.exe -s https://milkyfrog-jump-dev.toolsbox.vip/api/leaderboard
```

应返回 `{"list":[],"me":null}`；返回 `{"error":"接口不存在"}` 说明还是旧代码。

## 六、微信后台

开发管理 → 开发设置 → 服务器域名 → request 合法域名，需要加：

- `https://milkfrog.vip`
- `https://milkyfrog-jump-dev.toolsbox.vip`

域名每月修改次数有限，加之前确认两个都要用。开发者工具本地调试不受影响（`project.config.json` 已关闭 urlCheck）。

## 七、本地调试

```powershell
cd D:\giteeContent\deep-sea-dash-of-the-milk-frog\web
npx wrangler dev
```

本地 workerd 暂不支持 `wrangler.toml` 里的 `compatibility_date = "2026-10-31"`，起服务时临时降一天，不要改配置文件：

```powershell
npx wrangler dev --compatibility-date 2026-10-30
```

本地首次建表：

```powershell
npx wrangler d1 execute milk-frog-jump --local --file=db/schema.sql
```

`web/.dev.vars` 只放本地假值，已被 `.gitignore` 和 `.assetsignore` 排除。

## 八、上线顺序

1. 先跑 `db/schema.sql`（新库）或增量迁移
2. 再 `npx wrangler deploy` / `--env staging`
3. 微信后台加 request 合法域名
4. 开发者工具上传体验版验证 trial 环境
5. 审核通过后发布正式版
