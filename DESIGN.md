# 设计说明

## 目标

先做一个能跑的家庭饮食决策产品骨架，再逐步补齐社区、导入和变现。

## 架构

- `miniapp/` 负责展示、选择、导入和个人中心
- `server/` 负责家庭菜单、菜谱、社区内容、导入解析、登录和会话
- 当前第一版已接 MySQL 8 持久化，支持游客登录与微信登录占位
- 今日菜单和购物清单均为服务端状态，不再只依赖小程序本地缓存

## 关键决策

1. 首页固定为“今天做什么”
2. 菜谱来源分为 `owned`、`community`、`imported`
3. 导入配方必须保留来源链接
4. 广告只放信息流和非关键页面
5. VIP 放在高级筛选、去广告、云同步这类高频价值点
6. 登录先做游客会话，微信真实 code2session 后续替换
7. 购物清单由今日菜单自动重建，保留已购买状态
8. 社区举报先进入轻量审核队列，支持标记已处理或忽略，避免社区内容无人管控

## 已知限制

（2026-09-10 校正：下面三条旧描述已不成立，逐条替换为当前真实状态）

- ~~小程序未接微信真实授权弹窗~~ → 微信登录已接 `wx.login` + `code2session`（`WECHAT_APP_ID/SECRET` 未配置时降级游客并提示）
- ~~社区审核是运营端轻量队列，待拆独立管理后台~~ → 已有独立运营后台 `/admin`（RBAC 三角色 + 全量审计 + 批量审核 + xlsx 导出）
- ~~家庭成员是本地手动添加，待换邀请码~~ → 已改为邀请码加入（`/api/family/join` + `join-preview`）
- 仍然存在的限制：后台登录只有手机验证码一条路，短信网关未接入时进不去；测试依赖真实 MySQL，无库环境跑不了
- 架构债（待还）：`MysqlKitchenStore` / `AuthService` 体量偏大，缺 Repository 分层；`ensureTodayMenu` 之类的 get-or-create 会在读接口里建行（有界、可接受，但需知情）

## 变更历史

### 2026-09-22 - /admin 展示改版（宽度、吸顶、列纪律、登录入口）

**变更内容**:

1. **卡片宽度兜底与内容宽度上限**：新增 `--content-max: 1440px`（顶栏与面板一起收口，大屏不再把 9 列表格拉到 1600px、把「作者」列撑到 400px）；宽表的横向兜底从 `@media (max-width:1240px)` 换成 `@container panel (max-width:1140px)`，查询容器挂在 `.panel-root` 上。
2. **表头吸顶分层**：`thead th` 从 `top:0; z-index:1` 改为 `top: var(--topbar-h); z-index:2`，表头贴在顶栏下方而不是钻到它背后（`--topbar-h` 从 60px 校正为 72px 的真实高度）。
3. **列纪律**：`td.num`/`td.nowrap` 补 `nowrap`（日期/时间列折行会把行高从 49px 顶到 61px）；时间列统一 `class="nowrap" title=…`；`td.clamp` 一律带 `title`；`--cell-clamp` 300px→220px；单元格 padding 9px→8px；两行身份单元格 `line-height: 1.35`。
4. **看板**：`.split-2` 改等宽 `1fr 1fr` + `align-items: stretch`；两张趋势图统一 viewBox 尺寸；x 轴标签改为末尾锚定的均匀抽样（`axisStep`/`axisLabelAt`）。
5. **页头**：`pageHead` 去掉与顶栏重复的 `<h2>`，签名从 `(title, desc, actions)` 变成 `(desc, actions)`，13 个调用点同步。
6. **登录页**：引导登录从 `<details>` 折叠区改为与验证码并列的分段切换（`.auth-tabs`/`.auth-tab`/`.auth-pane`）；可用性改由服务端渲染进 `<body data-bootstrap-login>`（`AdminPageController` 会读 `admin.bootstrap-token`/`admin.bootstrap-phone`），前端不再打接口探测。
7. **登录失败的三种情况各自说清**：登录/发码/引导三处请求补 `allow401`（验证码输错不再被当成「登录已失效」清会话）；「获取验证码」返回 503（`SMS_PROVIDER=noop` 且没开 dev 验证码）时自动分流到引导登录，或写明要设的两个环境变量。
8. **用户页不再提供注定失败的操作**：自己的那一行「调整角色」改为禁用（`title` 说明原因），`state.userId` 由 `/api/admin/me` 下发。

**变更理由**: 在本地 9088 实例上按 1280/1440/1920 三档逐页量过，确认五处实测缺陷：1280 窗口下内容治理表溢出卡片 219px（旧兜底量的是视口宽度而不是内容区宽度，视口 1280 时内容区只有 992px）；吸顶表头被顶栏盖住；今日菜单的日期列折行导致行高 61px；看板柱状图末尾两个日期标签贴在同一个 x 上；每个列表页标题出现两次。

**影响范围**: `admin.css` / `admin.js` / `index.html` 三个前端文件 + `AdminPageController`（只多做一件事：把「引导登录是否可用」渲染进页面）+ 新增 `AdminUiAssetsTests`。**不动任何接口契约、数据结构与鉴权，不引入任何前端依赖与构建工具**（保持零构建）。

**验证**: `AdminUiAssetsTests` 8 条绿（`mvn -q -Dtest=AdminUiAssetsTests test`），另跑 `AdminRbacTests` 5 条、`AdminBootstrapLoginTests` 9 条、`AdminBootstrapDisabledTests` 3 条，全绿；无头 Chrome 在 1280/1440/1920 三档逐页跑完 14 个列表页与登录页——整页横向滚动 0px、数据行行高 45–50px、每页标题只出现一次、`td.clamp` 都带 `title`、看板两张趋势图等高且相邻 x 轴标签间距 68–114px（下限 8px）、登录页引导入口在 401（已配置）下可见并可来回切换；逐页截图与量化结果存 `artifacts/admin-refresh-2026-09-22/`。

登录这块另做了一轮**全量点击巡检**（272 步：13 个列表页的筛选/搜索/日期区间/排序/翻页/批量勾选 + 每类行内按钮 + 每个弹窗的取消与确认两条路径 + 11 个导出域各一次 + 登录三条路径 + 服务端吊销会话后的刷新），修完只剩 3 条 4xx，且三条都是**故意输错**的负路径（错验证码、错引导令牌、人工删会话后刷新），0 个未捕获异常、0 个 console error；`sweep-errors-all.json` 与完整运行日志存 `artifacts/admin-sweep-2026-09-22/`，修前那几份清单留在同目录 `pre-fix/`（其中 `sweep-errors-expired.json` 是限流把引导入口关掉的原始证据：A1-5/A1-6 两条 429）。新增的那条静态断言做过反向验证：把 `disabled` 分支去掉，`ownRowCannotOfferTheRoleActionTheServerRefuses` 当场失败。

**决策依据**: 兜底用容器查询而不是媒体查询——决定"放不放得下"的是内容区宽度（视口 − 侧栏 − 外边距），视口阈值必须把侧栏宽度算进去，这正是旧阈值漏掉的地方；查询容器挂 `.panel-root` 而非 `.main`，因为卡片宽 = `.panel-root` 内容宽，大屏下 `.main` 更宽会误判。**已知取舍**：容器查询量的是容器宽度而非每张表的宽度，所以内容区窄于 1140px（视口 1280）时所有列表页的卡片都会成为滚动容器、表头不再吸顶，包括本来塞得下的表；要精确到单表只能运行时量宽度，CSS 表达不了，此处按"1280 下不给整页留横向滚动条"取舍。页内标题删除而非改名，因为 13 处与 NAV label 逐字相同，删掉不丢信息。

**登录入口为什么从"前端探测"改成"服务端渲染"**：探测（空令牌打 `POST /api/admin/auth/bootstrap`，404 才隐藏）有两个代价，实测都能复现——该端点限流 5 次/分钟，且 `RateLimitFilter` 的计数在 `allow()` 里先自增再比较、不看响应码，于是同一分钟刷新登录页 6 次，第 6 次连真正的引导登录也吃 429「操作过于频繁」，把短信网关未接入时唯一进得去的入口关掉了；空令牌又必然 401，控制台里常挂一条看起来像故障的报错。服务端本来就知道 `ADMIN_BOOTSTRAP_TOKEN` 配没配，渲染进页面即可，一次请求都不花。**本地登录的正确姿势**（这轮排查中反复用到，写在这里免得下次再翻）：`ADMIN_OPENIDS=guest_default` 把平台账号提为管理员（`ADMIN_OPENIDS` 只升权、启动时执行一次；不设它库里一个管理员都没有，验证码登录会 403「没找到该手机号+管理员的账号」，引导登录也会 403 并提示去设 `ADMIN_OPENIDS`），然后 `AUTH_DEV_OTP_ENABLED=true` 用手机号 `13800138000` + 固定验证码 `246810` 登录，或设 `ADMIN_BOOTSTRAP_TOKEN` + `ADMIN_BOOTSTRAP_PHONE=13800138000` 走「引导令牌」。`admin.bootstrap-token` 与 `admin.bootstrap-phone` **两个都配**才算可用（只配一个时端点按 404 处理，视同没有这个后门）。

### 2026-09-13 - /admin 运营后台与小程序术语、流程、习惯对齐

**变更内容**:

1. **admin 术语翻译**：菜单状态 READY、导入类型 link/text、审计动作（举报处置/批量×2）补中文映射（MENU_STATUS/IMPORT_TYPE 表）；表头英文 ID 全部业务化（帖子 ID/工单号/…）；用户列表 openid 脱敏（前 8 位…后 4 位，悬停看全量）；owner 角色标签对齐小程序「管理员（创建者）」；空态文案对齐小程序实际页面名（今日餐桌/今天买菜/冰箱）；批量 REMOVED 措辞按对象区分（帖子/举报=下架、评论=驳回）。
2. **审核去盲审**：帖子详情弹窗渲染配图（AdminPostDetail.images 此前已返回但前端丢弃）；举报列表补被举报帖作者列（SQL JOIN user_account author）+「查看帖子」按钮复用详情弹窗——运营可判断恶意举报。
3. **反馈闭环**（决策：小程序补列表）：新增 `GET /api/me/feedbacks`（MyFeedbackItem：types/content/status/reply/时间，封顶 20 条）；小程序「意见反馈」页加「我的反馈」历史区块（处理中/已回复徽标 + 回复正文），提交成功后留在本页刷新列表——此前运营写回复用户永远看不到（黑洞）。
4. **审核状态用户侧传达**：CommunityPost/CommunityCommentItem 增加 auditStatus；自己的帖子在信息流/详情显示「审核中」角标，评论显示尾标；发帖 toast 按 auditStatus 区分文案；作者看自己 REMOVED 帖时详情端点返回明确文案「该分享因违规已被下架」（陌生人仍统一 400 不泄露存在性）。
5. **角色术语统一**：全 app 统一「管理员」（删"做饭人"第二套词，成员页副文案说明权限）；删 canConfirm 死角色 'cook'（服务端只有 owner/admin/member）；首页确认按钮文案「去挑菜 → 加入菜单」→「去挑菜」（对齐实际行为）。菜单权限策略（用户决策）：**全员可操作**，只在 UI 说明，不加锁。
6. **菜单页对齐用户语言**：AdminService.listMenus 聚合餐次摘要（午餐 2 道 · 晚餐 1 道）与做菜进度（待做/烧着呢/已上桌 各 N 道），admin 表格加两列；家庭详情成员行补忌口标签（avoid_tags_json）——解释推荐差异。
7. **devCode 说明**：验证码回显本就由 auth.dev-otp-enabled 管住（默认关），登录页提示加「仅开发环境」。

**变更理由**: 用户反馈 /admin 后台与小程序"不符合管理员和用户的使用习惯"。探查确认三类分歧：状态码/英文直出与小程序用户语言脱节；审核语境缺失（盲审、无反查）与反馈回复黑洞；"做饭人/管理员/创建者"三套词与幽灵角色。

**影响范围**: admin.js（映射表/列头/渲染）、ApiModels（MyFeedbackItem/CommunityReportItem.postAuthor/AdminMenuRow.meals/cookProgress/AdminFamilyMember.avoidTags/CommunityPost+Comment.auditStatus）、MysqlKitchenStore（举报 JOIN/详情文案/auditStatus 列）、AdminService（菜单聚合/忌口/readTagList）、SupportService+Controller（feedbacks 端点）、miniapp（community/post-detail 审核角标与文案、feedback 历史列表、home/members 术语）、EndpointCoverageTests +1 用例 +2 断言。

**决策依据**: 术语映射放 admin.js 前端而非后端改 API——运营展示层与用户 API 解耦，后端契约不动；auditStatus 全量返回而非仅 PENDING——前端逻辑简单，信息不敏感；反馈历史封顶 20 条不分页——低频操作，YAGNI。

### 2026-09-12 - 二期：厨房总控 + 步骤媒体列 + 评分反哺 + 社区图文与分享

**变更内容**:

1. **步骤媒体列（B1）**：`recipe_step` 新增 `image_url`/`video_url` 列（迁移脚本 `server/sql/migrate-step-media.sql` 含 JSON-in-text 存量回填）。
   服务端 `ApiModels.RecipeStep{text,image,video}` 用 `@JsonCreator(DELEGATING)` 兼容三种入参——纯文本（种子/旧测试）、历史前端编码的 JSON 字符串、新结构化对象——saveSteps/loadSteps/AdminService 菜谱详情全部改结构化。
   前端 `utils/recipe-steps.js` 编解码 hack 删除，recipe-edit / recipe-detail / cook-mode 直接读写对象。
2. **评分反哺（B2）**：`addCookHistory` 带分写入后 `recipe.rating = AVG(cook_history.score)`——家里做的真实评分影响首页推荐排序、菜谱库与详情展示，点菜↔做菜形成数据闭环；不带分不动。
3. **首页厨房入口（B3）**：今日菜单暗卡底部改为「买菜」+「开做 ›」双按钮，文案随餐次状态变化（开做 N 道/继续做/已齐·回看）——此前首页唯一动作是"去买菜"，进厨房必须二跳，这是"感知不到做菜功能"的直接原因。
4. **厨房总控（B4）**：新分包页 `pkg-extra/kitchen`。餐次 chips + 上桌进度 + 耗时倒排顺序建议；每菜一张灶台卡（状态/做到第几步/独立倒计时/开做/上桌）；单一 1s tick 驱动多计时器，计时按真实时间差持久化到本地（页面重进自动续跑）；全上桌复用开饭广播；主灶高亮（跑着计时的菜优先）。纯逻辑抽 `utils/kitchen.js` 并配 node 断言（已入 CI）。
   ponytail 边界：计时只存本地——单机单厨没有跨端需求，跨设备会话云端化是明确升级路径。
5. **帖子配图（C1）**：`community_post.images_json`（≤6 张，迁移脚本 `migrate-post-images.sql`）；发帖表单多图选择（复用 `/api/upload`）；信息流首图 + 「N 图」角标；详情九宫格 + `wx.previewImage`；后台帖子详情渲染配图。
6. **图片机审（C2）**：`ContentSecurityService.auditImage` 同步 `imgSecCheck`——只审本站 uploads 文件（白名单文件名防穿越，>1MB 按无法机审），违规 400、无法机审 PENDING；发帖时文本与图片取严，任一图无法机审整帖 PENDING。
7. **分享卡片（C3）**：post-detail `onShareAppMessage`（`?postId=` 直达详情端点，卡片图用帖首图）+ 操作栏分享按钮。
8. **话题后端化（C4）**：`GET /api/community/topics`（近 200 条公开帖标签 Java 侧聚合 top 10，鉴权白名单放行）；feed 支持 `?tag=`（`JSON_CONTAINS` 精确匹配，注意与可见性 OR 条件的括号优先级）；前端话题 chips 改服务端数据，点击站内过滤 + 「看全部」解除，不再跳菜谱搜索。

**变更理由**: 用户反馈"点菜基本完善，做菜没感知、社区要继续完善"。做菜链路本身已建成，缺口在入口（首页无厨房动作）与数据闭环（评分不反哺）；社区余下最大缺口是图文能力与分享传播。

**影响范围**: schema.sql + 两个迁移脚本、`ApiModels`（RecipeStep/CommunityPost.images/…）、`MysqlKitchenStore`（步骤 IO/评分反哺/feed tag/topics）、`ContentSecurityService`（auditImage）、`HomeController`（topics/tag/发帖机审）、`AuthService` 无改动；miniapp 新增 kitchen 页 + utils/kitchen.js，删除 utils/recipe-steps.js，home/menu/community/post-detail/recipe-detail/recipe-edit/cook-mode 适配；测试 +5（roundtrip/评分反哺/配图/topics/tag 过滤），miniapp CI 加 kitchen-logic。
**上线注意**: 已有库必须执行 `server/sql/migrate-step-media.sql` 与 `migrate-post-images.sql`（全新库由 schema.sql 直接建出）。

**决策依据**: 步骤媒体走"列化 + DTO 兼容解码"而不是一次性断掉旧格式，存量数据回填后新旧客户端都能跑；图片审核选同步 imgSecCheck（≤1M）而非 media_check_async——后者要回调端点与状态机，量级翻倍而收益在后期；话题聚合放 Java 侧不建索引，量级由 feed LIMIT 护栏兜住。

### 2026-09-12 - 社区收尾（详情端点、作者删除、互动通知）与烹饪体验补全

**变更内容**:

1. **C 端帖子详情端点**：新增 `GET /api/community/posts/{id}`（公开可读，鉴权白名单沿用 `GET /api/community/posts/` 前缀规则）。可见性与信息流同规则——APPROVED 公开、PENDING 仅作者本人、REMOVED 一律按不存在（400）。帖子详情页改为直连该端点，不再拉全量信息流再 `find`，分享直达成立。`CommunityPost` / `CommunityCommentItem` 新增 `mine` 字段（三处查询 SQL 各加一列 `CASE WHEN author_user_id = ?`）。
2. **作者删除**：`DELETE /api/community/posts/{id}`（作者本人，软删为 REMOVED，与运营下架同语义）、`DELETE /api/community/posts/{id}/comments/{commentId}`（评论者本人，软删 `deleted=1`，APPROVED 评论同步 `GREATEST(comment_count-1,0)` 回收计数）。详情页作者块与评论行各加「删除」入口（`mine` 才渲染），删帖后返回列表页靠 onShow 自动刷新。
3. **互动通知**：`NotificationService.notifyUser`（单用户版，跨家庭场景；family_id 无家庭时哨兵 0）。他人点赞（仅在"新增点赞"这一跳）与公开评论（仅 APPROVED——PENDING 评论作者还看不见，不能提前打扰）时给帖主写 kind=com 站内信，通知页"去社区"按钮直达。
4. **信息流护栏**：`communityPosts` 查询加 `LIMIT 100`（此前无上限）；分页留给真有量级时再加。
5. **烹饪模式补全**（cook-mode）：食材清单可逐项点选勾账（纯本地状态，暗底下划线+变淡反馈）；步骤进度本地续做——`wx.storage` 按 recipeId 记录当前步，中途退出再进自动恢复并 toast 提示，完成时清除。

**变更理由**: 用户反馈"点菜基本完善，但做菜和社区要补"。盘点后做菜链路（开做→分步→计时→评分→记录）此前已建成，本次补烹饪过程中的两个真实断点（备菜勾账、中断续做）；社区发帖/浏览/互动闭环已在，但详情页拉全量列表、作者无法删自己的内容、被赞被评无感知，属于上线前应还的账。

**影响范围**: `HomeController`（+3 端点 + 通知接线）、`MysqlKitchenStore`（详情/删除/`mine`/LIMIT）、`NotificationService`（notifyUser）、`miniapp`（api.js +3 接口、post-detail 改造、cook-mode 食材勾选与进度续做）、`EndpointCoverageTests`（+3 用例）。

**决策依据**: 删除走与运营处置相同的软删语义（REMOVED / deleted=1），行保留可审计；评论通知只对 APPROVED 发，避免作者收到看不见的评论提醒；烹饪进度用本地存储而非后端会话——单机单人的烹饪过程没有跨端需求，不值得加表。

### 2026-09-11 - 遗留项清零（点赞落地、死页清理、套餐单一数据源、后台菜谱详情）

**变更内容**:

1. **社区点赞落地**：新增 `community_post_like` 表（`UNIQUE(post_id,user_id)`）+ `POST /api/community/posts/{id}/like`（切换语义）。
   `CommunityPost` 新增 `liked` 字段，三处查询（信息流 / 我的收藏 / 帖子详情）改为 `LEFT JOIN community_post_like` 带出。
   点赞与收藏语义分离：点赞表达喜欢并参与 `ORDER BY like_count DESC` 排序，收藏用于「我的收藏」列表。
   取消点赞用 `GREATEST(like_count - 1, 0)` 兜底 —— 历史 `like_count` 是演示种子里的展示数，可能大于真实点赞行数。
2. **死页清理**：删除 `pages/auth/verify-otp`、`pages/auth/wechat-auth`。二者是 `login-phone`（自带验证码输入 + 短信校验）与 `login`（自带 `wx.login` 一键登录）的冗余副本，
   全站无任何入口，属开关关闭后遗留的死代码（与 2026-09-10 删 `register`/`reset-password` 同一类问题）。
3. **套餐单一数据源**：新增 `miniapp/utils/plans.js`，套餐名与价格统一从 `GET /api/payment/plans` 取（后端 `PlanCatalog` 权威），
   `vip/index`、`vip/upgrade`、`payment/checkout` 三处硬编码的价格常量全部移除。
   此前同一份年卡被写成「家庭同步年卡 / 家庭年卡 / 家庭云同步年卡」三种名字，改价还要改三处前端，属典型漂移。
   年卡「折合每月」「省 N%」改为由后端价格算出，不再写死营销数字。会员页「家里这几口」的头像改用真实家庭成员（原为写死的「张/妈/爸 +2」）。
4. **后台菜谱详情**：新增 `GET /api/admin/recipes/{id}`（`RECIPE_MODERATE` 权限）返回完整食材与步骤，
   菜谱治理页操作列补「查看详情」只读弹窗 —— 此前运营只能看到列表摘要，想核对内容得去小程序里翻，是真实的功能缺口。
   顺带给 `openModal` 增加 `wide` / `singleAction` 两个选项（宽弹窗 + 单按钮），供只读详情复用。
5. **上线配置收口**：运营者信息（隐私政策/用户协议）抽到 `miniapp/utils/legal-config.js` 单一来源，改一处即可；
   `utils/env.js` 增加占位域名哨兵 —— 体验版/正式版仍指向 `example.com` 时在控制台打醒目 error（此前是静默全站接口失败，排查成本高）；
   `utils/upload.js` 补 `X-Device-Id` 头，与 `api.js` 请求头一致。

**影响范围**: server（`schema.sql`、`ApiModels`、`MysqlKitchenStore`、`HomeController`、`AdminModels`、`AdminService`、`AdminController`、admin 静态页 admin.js/admin.css、AdminModulesTests、CoreFlowTests）、
miniapp（utils/api.js、utils/upload.js、utils/env.js、utils/plans.js 新增、utils/legal-config.js 新增、app.json、community、post-detail、vip、vip/upgrade、payment/checkout、legal/privacy、auth 页面删除）、DESIGN。

**验证**: 后端 76 项测试全绿（新增「点赞切换且计数同步」「后台菜谱详情 + 非管理员 403」2 项）；
接口冒烟：点赞 liked/likeCount 双向切换正确、信息流 `liked` 字段按用户返回、后台详情返回食材步骤且游客 403；
浏览器实拍菜谱治理页「查看详情」弹窗正常；`node miniapp/test/static-check.js` 通过（274 文件）。

**决策依据**: 用户要求「把遗留的问题全部解决」。上一轮收尾时明确留下的三项（点赞只读、两个登录死页、上线配置占位）+ 评审中记录的套餐三处硬编码、后台缺菜谱详情一并处理。

### 2026-09-10 - 一致性与职责边界修正（针对"好多不合理的"评审）

**变更内容**:

1. **演示数据归位**：新增/统一 `APP_SEED_DEMO_DATA` 开关（`application-prod.yml` 固定 false）。演示数据原本无条件挂在三条登录路径上，且 `GET /api/notifications` 自己还会插 3 条英文演示通知 —— 真实用户第一屏会出现"别人的"菜单/做菜记录/通知。现在只在开发环境显式开启时播种，读接口保持纯读。
2. **认证层职责收口**：`AuthService.resolveToken()` 改为纯读（原先每个带 token 的请求都可能建家庭、改 `current_family_id`、续期会话，且无事务）；会话固定 30 天不再滑动续期。
3. **移除"共享游客账号"**：删除 `SEED_GUEST_OPENID` 回落路径与 `guestCache`。游客会话一律按设备指纹哈希建号，`POST /api/auth/guest` 缺设备标识直接 400；`POST /api/auth/login` 缺 code 不再静默降级为游客；`@CurrentUser` 去掉 `orGuest` 兜底（20 处调用点改为普通 `@CurrentUser`）。默认昵称由开发者人名改为中性值「家人」。
4. **前端死代码清理**：删除 `pages/auth/register`、`pages/auth/reset-password`（app.json 已注册但后端从来没有注册/改密接口，开关关闭后入口不可达）。
5. **首页推荐稳定化**：`shuffle()` 随机排序改为「库存匹配率 > 评分 > id」的稳定序，`_heroOffset` 只在用户点「换一个」或切菜系时变化 —— 随机推荐与"首页固定为今天做什么"的决策冲突，且 `matchedRatio` 已算好却没用上。补齐 `showWishModal/wishInput/fontScale/slotDoneCount` 的 data 声明，`confirmMenu` 不再伪造事件对象调 `pickForWish`。
6. **TabBar 单一数据源**：新增 `miniapp/utils/tabs.js`，静态自检新增"app.json tabBar 与 tabs.js 一致 + tab 页已在 pages 声明"校验，并补上分包页面四件套检查。
7. **文案中文化**：通知相对时间（just now / min ago）、反馈回执、上传与全局异常提示、认证错误提示全部改中文（有测试断言同步更新）。

**影响范围**: server（AuthService / SupportService / CurrentUser / AuthInterceptor / UploadController / GlobalExceptionHandler / application.yml / application-prod.yml）、miniapp（auth 页面删除、home、custom-tab-bar、utils/tabs.js、test/static-check.js）、README、DESIGN。

**验证**: 后端 74 项测试全绿（新增 `DemoSeedDisabledTests` 2 项，锁住"关掉开关就不播种"）；`node miniapp/test/static-check.js` 通过，并已用反例验证能捕捉 tabBar 漂移。

**决策依据**: 用户反馈"管理后端和小程序前端好多不合理的"。评审发现工程质量本身不差（RBAC/审计/限流/排序白名单/Token 哈希都在），问题集中在职责分层（读路径写库、上帝类）与产品一致性（死页面、随机推荐、文档漂移）。

### 2026-08-06 - UI 优化五阶段交付（计划书 v2.0）

**变更内容**:
1. P0 设计纪律收敛：色值 token 化（页面硬编码 57→豁免级）、字号标尺 12 级（新增 --fs-lg/--fs-btn/hero 三档）、照片 hero 统一 862rpx、返回键统一 88rpx、空态收敛到 state-empty（删除 empty-state 组件）
2. P1 组件与导航：TabBar 改 warm 定稿四 tab「今日/菜谱/冰箱/我的」，menu 降级二级页、pantry 升级 tab 页；闲置 SVG 清零；recipe-card 组件封面兼容多字段
   （2026-09-10 校正：社区页随后也进了 TabBar，当前实际为五 tab「今日/菜谱/社区/冰箱/我的」，
   定义以 `miniapp/utils/tabs.js` 为准，app.json 一致性由静态自检保证。）
3. P2 设计稿缺口：全站英文 eyebrow 中文化（品牌名保留）、home hero 镂空描边标题+暖光层、家庭成员忌口筛选闭环（后端 avoid_tags_json + 成员编辑 + recipes 自动过滤）、state-sheet/state-loading 组件、tap-scale 弹性回弹、me 数字滚动
4. P3 体验健壮性：失败/空态全站解耦（5 页错误态+重试）、community 加载态、弹窗滚动锁、--mut 对比度收敛 AA、大字模式开关（6 主页面）
5. P4 深色模式（theme.json darkmode + token 主题化）、UI 设计规范文档

**影响范围**: miniapp 全部页面/组件、custom-tab-bar、theme.json、server（FamilyService/FamilyController/ApiModels/schema.sql）

**决策依据**: 用户确认导航按 warm 定稿；忌口按「成员配置 + recipes 自动过滤」MVP；pay-wechat/state-imgview 走原生兜底。

### 2026-05-13 - 产品化闭环与去模板化

**变更内容**:
1. 购物清单补齐进度、待买/已买分组、快捷补充和空状态引导
2. 我的页面改为家庭厨房工作台，集中展示菜单、成员、做菜记录和关键入口
3. VIP 页从模板式价格页改为权益场景说明、版本对比和演示开通说明
4. 菜谱创建/编辑页增加录入质量提示、常用标签、食材/步骤有效计数和保存预览
5. 离线 fallback 补齐购物项添加/删除，后端未启动时仍能演示完整闭环
6. 社区和我的页面移除 WXML 下标表达式，改为 JS 侧预处理首字，降低小程序表达式兼容风险

**变更理由**: 针对“程序不完整、AI 味重”的反馈，把页面从静态展示改成家庭做饭真实流程：选菜 → 菜单 → 买菜 → 做菜记录 → 家庭协作。

**影响范围**: shopping/me/vip/recipe-edit/community 页面，api.js 和 mock.js。
（2026-09-10 校正：`utils/mock.js` 此后已随离线降级方案重构删除，当前无此文件。）

**决策依据**: 参考主流菜谱/meal planner 产品的信息架构，优先补菜单、grocery list、pantry、profile workflow 的产品闭环，而不是继续堆推荐话术。

### 2026-05-13 - UI 视觉全面美化

**变更内容**:
1. 全局色彩系统（CSS 变量：主色 #ff6b35 暖橙 + 背景 #faf6f0 暖奶油色，统一圆角/阴影/间距）
2. 动效体系（页面 fadeIn、按钮 scale 反馈、卡片 active 缩放、chip 过渡、骨架屏 shimmer）
3. 三级卡片层次（card-elevated / card / card-flat）
4. 自定义 TabBar 美化（CSS 线性图标替代 emoji、毛玻璃背景、选中指示条动画）
5. 首页 Hero 渐变区域 + 菜谱卡片菜系色条（川菜红/粤菜金/家常绿等）
6. 空状态组件（emoji 图标 + 引导文案）
7. 表单统一 focus 态（主色边框 + 微阴影）
8. 购物清单已购项淡出效果、社区帖子作者头像占位圆
9. 周菜单日期左侧色条、偏好条渐变、VIP 页装饰圆
10. 导入页 Hero + 解析结果卡片升级

**变更理由**: 产品功能已全部闭环，视觉从"开发原型"升级为"可上架品质"。

**影响范围**: app.wxss 全量重写；custom-tab-bar 组件重写；home/shopping/community/import/weekly-menu/pantry/vip/recipes/recipe-detail/recipe-edit/me 全部页面样式升级。

### 2026-05-13 - Phase 4 增强功能

**变更内容**:
1. 周菜单自动生成（基于菜谱库随机排菜，7天×2道，一键重新生成）
2. 个人偏好学习（基于 cook_history 统计菜系/口味频率，可视化偏好条形图）
3. 食材库存管理（pantry_item 表 + CRUD + 保质期）
4. 食材-菜谱匹配（根据库存匹配可做菜谱，显示匹配率和缺少食材）
5. 云同步状态展示（VIP 用户显示同步徽章，数据本身已在服务端）
6. 后端新增 EnhancedController + EnhancedService
7. 我的页面新增周菜单/食材库存入口

**变更理由**: 完成四阶段路线图最后一阶段，产品功能全部闭环。

**影响范围**: 新增 EnhancedController/EnhancedService、pages/weekly-menu、pages/pantry；修改 schema.sql、api.js、me 页面、app.json。

### 2026-05-13 - Phase 3 变现功能

**变更内容**:
1. VIP 开通页（权益展示 + 月度/年度方案 + 模拟开通）
2. 广告位组件 ad-banner（首页信息流 + 社区底部，VIP 用户自动隐藏）
3. 高级筛选 VIP 门控（菜系/耗时/人份多维筛选，非 VIP 显示开通引导）
4. 全局 VIP 状态联动（app.js globalData + localStorage 缓存）
5. 我的页面新增 VIP 入口按钮

**变更理由**: 完成变现基础设施，为后续接入微信支付预留接口。

**影响范围**: 新增 pages/vip、components/ad-banner；修改 home/recipes/community/me 页面。

### 2026-05-13 - 第二批功能补齐

**变更内容**:
1. 菜谱页 onShow 刷新数据（从编辑/创建返回后立即可见新菜谱）
2. 后端种子数据 data.sql（8道示例菜谱含食材和步骤 + 2条社区帖子）
3. 社区发帖功能（POST /api/community/posts + 前端发帖表单）
4. API 层新增 createCommunityPost

**变更理由**: 补齐社区阶段最后一块拼图（用户可发帖），种子数据让首次体验不空。

**影响范围**: server MysqlKitchenStore + HomeController + ApiModels、miniapp community 页 + api.js、新增 data.sql。

### 2026-05-12 - 前端交互闭环补齐

**变更内容**: 
1. 添加 custom tabBar 底部导航（首页/菜谱/社区/购物/我的）
2. 新增菜谱详情页（食材清单+步骤+操作按钮）
3. 新增菜谱创建/编辑页（表单含食材和步骤动态增删）
4. 购物清单补充手动添加和删除功能
5. 我的页面新增做菜记录展示，菜谱详情页新增"记录做菜"入口
6. 菜谱卡片可点击进入详情，菜谱列表页新增"新建"按钮
7. API 层新增 getRecipeDetail/updateRecipe/addCookHistory/getCookHistory/addShoppingItem/deleteShoppingItem

**变更理由**: 后端接口已齐全但小程序前端缺少关键交互页面，补齐后形成完整用户闭环。

**影响范围**: miniapp 全部页面、api.js、新增 custom-tab-bar 组件和 recipe-detail/recipe-edit 两个新页面。

**决策依据**: 优先补齐已有后端接口对应的前端入口，不引入新后端功能。

### 2026-05-12 - 社区互动与举报审核闭环

**变更内容**: 新增社区评论、收藏、举报和举报审核队列，H5 与小程序均可操作。

**变更理由**: 社区功能如果用于后续变现，必须先具备基础互动和内容治理能力。

**影响范围**: `server` 社区接口与数据表、H5 预览页、小程序社区页。

**决策依据**: 先做轻量运营闭环，不提前引入复杂社交、支付或独立后台。
