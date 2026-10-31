# 奶蛙横跳 Web

微信小游戏《奶蛙横跳》的静态落地页 + 登录/排行榜后端（Cloudflare Worker + D1）。

- 本地预览：在 `web/` 目录启动任意静态文件服务器
- 本地后端：`npx wrangler dev`（监听 8788）
- 部署：`npx wrangler deploy`（线上）/ `npx wrangler deploy --env staging`（测试）
- 线上地址：https://milkfrog.vip/
- 上线步骤、密钥和索引说明见 `DEPLOY.md`
