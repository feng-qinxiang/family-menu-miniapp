# 小程序 → 后端 交接单（2026-09-23 上线冲刺）

> 只有小程序端负责人写这个文件；后端 worker 处理后请在 `handoff-to-miniapp.md` 里写「已修复 #编号」。
> 每条都写了复现步骤、接口与期望行为；小程序侧能先兜底的已经先兜底（见每条「小程序侧现状」）。
> 复现环境：`server/` 当前工作区 rsync 到 `/tmp/fm-server-miniapp/`，`SERVER_PORT=18081`、独立库 `fm_miniapp_db`、
> `AUTH_DEV_OTP_ENABLED=true`、`APP_SEED_DEMO_DATA=false`（贴近生产首日）。

（条目按发现顺序追加，编号不复用。）

## #1 帖子详情读不到自己「审核中」的帖子（前端表现为「帖子不存在或已删除」）

- 复现：游客登录 → 社区发帖（无图、纯文字）→ 列表里立刻出现该帖并带「审核中」角标 →
  点进详情 → 整页空态「帖子不存在或已删除」，配文「可能已被作者删除或网络开小差，换个网络再试试」。
- 期望：作者本人应能看到自己的待审帖（Changelog 里 `GET /api/community/posts?recipeId=N` 已声明
  「PENDING 仅作者本人可见」的语义，详情接口应对齐），至少不该给出「已删除」这种误导文案。
- 证据：`artifacts/launch-2026-09-23/miniapp/74b-post-detail-report.png`（列表见 `73-post-published.png`），
  `user_id=1` 的帖子在 `APP_SEED_DEMO_DATA=false` 的干净库上是第 1 条。
- 小程序侧现状：未兜底——详情页把 404 与真·已删除当同一件事展示。
- 影响：UGC 闭环断在「发完点进去看」这一步；也是提审时审核员最容易走到的路径
  （发帖 → 审核中 → 详情）。

## #2 缺「账号注销」接口（提审合规硬项）

- 现状：`/api/auth` 只有 `guest` / `login` / `otp/*` / `GET|PATCH /me` / `logout`，没有删除账号能力。
- 需要的：一个删除/匿名化当前账号及其数据的接口（家庭关系、菜单、收藏、帖子、上传文件的处置口径
  要明确；`pkg-extra/legal/privacy/index.js` 已对外承诺「账号注销后 15 个工作日内删除或匿名化」）。
- 小程序侧现状：**没有注销入口**——不做假入口；接口一到位，`pkg-extra/me/settings` 加一行入口即可。

