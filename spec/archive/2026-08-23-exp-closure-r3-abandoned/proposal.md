# Proposal: exp-closure-r3

## Why
第三轮全量审计（四子代理并行：架构/设计系统/交互/产品后端）发现：三轮 UI 打磨之后，剩余问题集中在「可信度与闭环」——主包 2368KB 超 2048KB 发布上限（上传必拒）；资料编辑页与消息中心写了但零入口，家庭产品「谁在做、做过什么」撑不起来；一次失败连闪两条 toast 互相掩盖；darkmode 是从不生效的惰性开关；后端另有三处安全/合规洞（越权 SQL、UGC 免审、游客数据合并）需独立轮次。本轮把前端可发布的断点一次收口。

## What
- 反馈与请求链路收口：api getter 默认 silent（showServerError 改显式 opt-in），页面错误态为唯一错误出口；wx.request 全局 timeout 10s；baseURL 收敛 env.js 单出口（api.js/upload.js 引用之），release 未配真实域名 console.warn；ensureGuestSession 有 token 即跳过（去冷启动双份 guest 认证） | refs: R-1 | verify: 断网任一数据页只出一条页面错误态（无 api toast 叠加）；挂起接口 10s 后进错误态而非永久 loading；冷启动 network 面板仅一次 /api/auth/guest
- 交互闭环与入口：me 页头像区加「编辑资料」入口（复用 profile-edit）与「消息中心」入口（复用 notifications）；cook-mode onFinish 先 addCookHistory 再跳 cook-log（失败 toast 后仍跳转）；cook-log 读取传入 recipeId/title 展示 | refs: R-1 | verify: me 可进资料编辑并保存生效；做菜完成→记录页立即出现本条记录
- 主包瘦身至 <2048KB：删 A-5 死码清单（launch/*、verify-otp、register、reset-password、wechat-auth、me/favorites、community/audit、tab-select、empty-state，删前逐个 grep 跳转引用）+ login 页去掉「忘记密码」入口；assets/dishes 16 图压缩至合计 <500KB（一次性脚本）；不达标再拆分包 | refs: R-1 | verify: 微信开发者工具构建主包 <2048KB；全库无死跳转（导航目标全部存在）
- 锁浅色 + 一行级防护/适老批次：darkmode:false；settings 清缓存/退出改白名单保留 font_scale 等适老与登录 storage；recipe-edit/import 脏数据守卫（返回弹「放弃编辑？」）；recipe-edit 步骤图随 payload 保存（后端丢弃则降级隐藏入口）；home onShow 增量刷家庭资料+当前用户；recipe-detail 加菜去重+提交守卫；join 成功 redirectTo、扫码优先取 code= 参数；shopping addPantryEntry + community submitReport 补 submitting 守卫；weekly 重排前 showModal 确认；食材库存匹配抽公共函数统一两页判定；HOT_TOPICS 删假热度数字；shopping/pantry 空态补 CTA | refs: R-1 | verify: 手测清单逐项过 + `node test/dish-logic.test.js` 退出码 0
- 设计系统「立法者守法」：app.wxss 9 处 raw font-size 改 var(--fs-*)（.shead-title/.chip/.tag/.page-title/.section-title/.textarea/.empty-text，13+ 页受益）；state-dialog/state-empty/ad-banner/section-head/recipe-card 组件内部字号圆角 token 化，新增 --r-dialog:40rpx 替换复制的魔法数；删死 token --r-xl/--r-lg/--sp-*；核心页横向 gutter 收敛 --gutter 单值（hero 专属缩进除外） | refs: R-1 | verify: app.wxss 与 5 组件 wxss 内 raw font-size 计数为 0（豁免注释除外）；大字模式下区块标题/弹窗文字随之放大（抽检 home/menu/recipe-detail 三页无折行破版）

**Not in this change**: 后端三洞（family_id=1 越权 SQL、UGC 免审直发+msgSecCheck、游客数据合并+SEED_GUEST 只读化）与 /api/vip/activate 守卫——独立 change `backend-security-trio`（跨前后端需 design）；page-behavior 样板抽取（27 页 200+ 行）与请求缓存/去重/onShow 架构重构；全站 534 处 raw 字号收敛（hotspot 页分批另轮）；产品功能轮：投票/三级角色/菜单确认、事件通知、画像驱动推荐、周菜单落库、分页 envelope、账号注销合规、真实广告位。showcase 去留见 escalated E2（保留则登记规范豁免，另评估移分包）。

## How
- 错误出口唯一化是「反转默认」而非删能力：rawRequest 的 toast 保留为 opt-in 参数，页面级 action（如收藏失败要轻提示的）可显式开启；apply 时点验每个 getter 的消费页已有 catch/loadError（08-16 已激活十页，剩余逐个过）
- 删页纪律：每个删除目标先全库 grep navigateTo/redirectTo/navigator 的 url 字符串，零引用才删；register/reset-password 删除同时清理 login 页跳转入口，防止死链
- 图片压缩用一次性脚本（node sharp 或 Python PIL，跑完即删），质量 75 起步、抽检不满意回调 82；预估删码+压图后 ~1600KB，无需动分包结构（DEC-4）
- 步骤图保存若后端 steps JSON 不回显 image，降级路径为隐藏上传入口（DEC-7），不强行改后端表结构
- 做菜落库失败不阻断跳转：toast「记录保存失败」后仍进记录页，记录页保留既有手动补录路径

## Risk
- 波及面：api.js 为全站唯一请求出口，默认 silent 化后，若某页面自身无 catch 的 await 调用失败将无任何反馈 | 触发场景：非数据类 action（收藏/举报类）在断网时点击 | 缓解：apply 点验全部 getter 消费点，缺 catch 的补页面级 toast；此为 ledger R0-1 检查项
- 删页触发场景：动态拼接 url 的跳转漏 grep（如 `url = '/pages/x' + var`）→ 运行时跳转失败 | 缓解：grep 模板字符串与字符串拼接两类模式，删除清单外页面一律不动；ledger R0-2 检查项
- 图片压缩过度触发场景：hero/卡片大图在高分屏糊 | 缓解：质量 75 起步逐张抽检，不达标回调 82（ledger R0-3）
- 全局类 token 化行为变化：大字模式开始放大区块标题/正文基准（之前不放大），长标题折行风险 | 缓解：home/menu/recipe-detail 三页大字模式抽检
- 回滚：全部为前端文件级小 diff + 删除文件，git revert 单提交整体退回

<!-- APPROVED marker 由 /spec:apply 追加 -->
