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
