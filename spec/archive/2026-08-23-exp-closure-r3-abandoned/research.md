# Research: exp-closure-r3

方法：四只读子代理并行审计（前端架构 / UI 设计系统 / 交互 UX / 产品与后端），已对照 spec/archive 两轮 proposal 剔除已修项；承重结论由主代理逐条亲验（见 Constraints 标注）。

## Practices
- 行业基线：微信小程序发布主包上限 2048KB（实测 2368KB 超限，上传必拒）；darkmode 需 app.json `@` 引用 + wxss `prefers-color-scheme`/darkmode class 双轨才生效；UGC 小程序上架需内容安全检测（msgSecCheck）与审核链路；账号注销为审核硬性要求
- 库内既有模式直接复用：页面 loadError 态（08-16）、addItemSubmitting 防重（home）、state-dialog 二次确认（menu）、storage 白名单思路（无，需新建但一行级）
- 本轮零新依赖：图片压缩用一次性脚本（跑完即删），不引 UI 库

## Constraints
- 主包实测 2368KB：assets/dishes 16 图 996KB（最大 beef-broccoli 95K），packOptions.ignore 为空，无 subPackages | 发布阻塞（亲验：du -sk）
- darkmode:true 为惰性开关：app.json:48-57 window/tabBar 全硬编码浅色、零 `@` 引用；全库 0 处 prefers-color-scheme；微信不把 theme.json 注入为 CSS 变量，19 处 var(--theme*) 恒走浅色 fallback | 亲验；订正 UI 线报告「深色下 --paper 变 #1c1c1c」的机制误判——深色从未渲染，真实问题是指令撒谎而非深色破样
- profile-edit / wechat-auth 全库零入口（亲验 grep）：用户无处改昵称头像，家庭成员全员显示「我/家庭成员」
- cook-mode onFinish（index.js:307-317）仅 navigateTo cook-log，不调 addCookHistory（亲验）：做菜闭环断链
- api 双声道：rawRequest 非 silent 失败默认 toast 服务端文案，页面 catch 再 toast 泛化文案，一次失败连闪两条；仅 getCommunityReports（api.js:194）opt-in silent
- wx.request 无 timeout（仅 home 自建 8s watchdog）；baseURL 逻辑三处并存（api.js/upload.js/env.js），env.js release 指向占位假域名 familymenu.com → release 包静默打向不存在的服务
- 冷启动双份 guest 认证：app.onLaunch guestLogin 后 home loadAll 又无条件 ensureGuestSession 再发一次（api.js:420-424 不检查已有 token）
- 死码：launch/splash、launch/onboarding（未注册死目录）；verify-otp、wechat-auth、profile-edit、notifications、community/audit、me/favorites（注册但零入口）；register/reset-password 为 login-phone 的重复/无意义变体（reset-password 页手机号硬编码「138 8888 6666」只读，auth/reset-password/index.js:7）；behaviors/tab-select.js 与 components/empty-state 零引用
- 字号 token 率 36.1%（raw 534 / var 302），较 08-16 基线（537/291）一周仅 +1pp，停滞；app.wxss 自身 9 处 raw font-size（.shead-title 50rpx 等）；state-dialog/state-empty/ad-banner/section-head/recipe-card 组件内部基本未 token 化；--sp-* 六档 0 引用、--r-xl/--r-lg 0 引用；横向 gutter 至少 4 种值（28/30/46/46rpx）；弹窗圆角 40rpx 靠复制魔法数保持一致（--r-xl:42rpx 定义了却 0 引用）
- 后端三洞（本轮不修、独立 change，均已亲验/定位）：family_id=1 越权 SQL 5 处（MysqlKitchenStore.java:163/542/637/683 + TodayService.java:58，跨家庭可读 id=1 家庭私有菜谱）；UGC 直插 audit_status='APPROVED' 绕过审核（MysqlKitchenStore.java:325）且未接 msgSecCheck；游客→正式账号无数据合并（AuthService.ensureGuestAccount）+ 无 header 直连落 SEED_GUEST 单一账号（POST /api/family/join 无 token 会把种子游客塞进任意家庭）；另有 /api/vip/activate 0 元直开 VIP、新家庭强制播种假 cook-history 污染口味画像
- 适老反噬点：me/settings 清除缓存/退出登录 clearStorageSync 全清（settings/index.js:199-210,248-256），大字模式 font_scale 一并归零；recipe-edit/import 长表单无脏数据守卫，物理返回直接丢全部输入
- 零散行为缺陷：recipe-edit 步骤图上传后提交丢弃（index.js:294 payload 只 map 文本）；home onShow 不刷家庭资料（家人加入/改名长期 stale，index.js:138-151/432）；recipe-detail addToToday 无去重无守卫（:191）；join 成功 navigateTo 应 redirectTo（:144）、扫码正则取到 "https"（:81）；shopping addPantryEntry + community submitReport 缺 submitting 守卫；weekly-menu 重排直接覆盖整周无确认（menu/index.js:291）；食材「冰箱里有」两页两套判定（recipe-detail stockNames.has vs shopping sameIngredient includes）；HOT_TOPICS 假热度「2.4万」（community/index.js:20-26）；shopping/pantry 空态无 CTA
- 页面层样板债（本轮不动）：fontScale 读取块 ×6 页、下拉刷新三连 ×5 页、statusBarHeight 手算 ×27 页（nav-bar 组件本就自算）；shopping onShow 每次 3 请求全量重拉
- 产品缺口（远期路线，见 proposal Not in this change）：投票/三级角色/菜单确认后端缺位、周菜单内存幻影不落库、推荐=纯 rating 排序、全 API 零分页、通知不随家庭事件产生、账号注销缺失（上架合规硬伤）

## Open [TBD]
（空——全部进入 Decided）

## Decided
- [DEC-1] 本轮 frontend-only：后端三洞（family_id=1 越权 / UGC 免审+msgSecCheck / 游客数据合并+SEED_GUEST）+ vip activate 守卫拆为独立 change `backend-security-trio`（跨前后端、需 design 轮） | auto，可逆：用户可当场推翻并入 | 面板 r0 维持：混入会把收口轮拖成跨栈重构
- [DEC-2] 深色模式锁浅色：darkmode:false（一行），theme.json 文件保留供未来真深色轮；不修通链路（修通需 app.json @ref + app.wxss media query + --mut-strong/兼容层/扩展 token 逐个配深色值 + 55 wxss 逐页验收，且「暖白杂志」强光风格深色版需重新调色不是变量翻转） | escalated E1（产品语义：撤回深色承诺） | if wrong: 改回一行
- [DEC-3] showcase 去留交用户（8 月刚建的概念页，129 处 px 自成体系占主包体积）| escalated E2 | 建议：删，或保留但登记规范豁免+评估移分包
- [DEC-4] 瘦身优先做减法：删死码（A-5 清单）+ 图片压缩（目标 dishes <500KB）→ 预估降到 ~1600KB < 2048；不达标才拆分包（auth/legal/payment/community 低频页） | auto：结构改动最小化
- [DEC-5] api 层错误反馈反转默认：getter 默认 silent，showServerError 改显式 opt-in；页面错误态为唯一出口（08-16 方向的自然延伸） | auto | 可逆：单文件默认值
- [DEC-6] wx.request 全局 timeout 10s；baseURL 收敛 env.js 单出口，release 未配置真实域名时 console.warn 不静默打向假域名 | auto | 可逆
- [DEC-7] recipe-edit 步骤图：payload 带回 image 字段（后端 steps 为 JSON 可存）；apply 时验证后端不丢弃，若丢弃则降级为隐藏上传入口 | auto | 面板 r0 补充的降级路径
- [DEC-8] HOT_TOPICS 删假热度数字保留话题词；notifications/profile-edit 补 me 页入口而非删（页面已实现）| auto
- [DEC-9] 一行级防护/适老批次采纳交互线 minor 全集（13 项，见 proposal What-4）| auto
- [DEC-10] 设计系统只做「立法者守法」：app.wxss 9 处 raw + 5 共享组件内部 token 化 + --r-dialog:40rpx + 死 token（--r-xl/--r-lg/--sp-*）清理 + gutter 收敛 --gutter 单值；全站 534 处 raw 字号收敛明确出范围（分批另轮，hotspot：showcase 40/home 33/community 26）| auto
- [DEC-11] page-behavior 样板抽取（27 页 statusBarHeight 等 200+ 行）、请求缓存/去重、onShow 增量刷新架构——全部出范围，留独立重构轮 | auto：回归面 27 页，与收口混做风险不对等
- [DEC-12] register/reset-password/verify-otp 删除而非修补：无密码体系下 reset-password 无意义、register 与 login-phone 完全重复 | auto | 可逆：git 恢复
