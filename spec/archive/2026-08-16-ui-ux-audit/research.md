# Research: ui-ux-audit

## Practices
- 未做外部行业 web 调研：本变更决策空间全部在库内（既有组件/守卫模式/设计 token 均存在，修复=复用），且 docs/UI设计规范.md + UI优化计划书.md 已充当实践基线 | 外部实践不改变任何一项修法
- 库内可复用模式：竞态序号守卫（home `_wishSeq`）、防重提交守卫（community `commentSubmitting`）、删除二次确认（menu state-dialog）、离线缓存 stale-while-revalidate（home） | 全部已有生产实现，直接仿写

## Constraints
- api.js `request()` 失败时执行 `config.fallback()` 返回 null/[] 永不抛错（utils/api.js:124-131），且 getDashboard/getTodayMenu/getShoppingList 等全部读接口带 fallback | 违反后果：全站 catch/loadError 分支不可达，错误被伪装成空数据（本次 critical #1 的根因）
- 支付取消检测依赖 `errMsg.indexOf('取消')`（payment/checkout/index.js:121），而微信 errMsg 为英文 `requestPayment:fail cancel` | 违反后果：取消支付弹英文原始报错
- 邀请链路后端有真实邀请码下发（family/members），但前端在拉取失败时伪造 `familyId*7919` 占位码（members/index.js:99-101）、invite 页硬编码 `836295` + 伪随机点阵假二维码（invite/index.js:5-47） | 违反后果：家人拿假码/假码图永远加不进家庭
- root-portal 弹窗不继承 page 变量，home 许愿弹窗因此本地声明 token 副本（home/index.wxss:732-760）——但副本仍是旧色板旧圆角（--r-card 28rpx vs 全局 16rpx，--mut #8a8a85 vs #7a6e5d） | 违反后果：弹窗与全站换肤脱钩
- 订正（面板 r0）：theme.json 的 themeMut 与 wxss 渲染脱节——`--themeMut` CSS 变量在全 miniapp 无定义处、app.json window/tabBar 亦无 `@themeMut` 引用（全为字面色），`--mut` 实际恒渲染 app.wxss:12 fallback `#7a6e5d`（#fbf8f3 底 ≈4.6:1，达标线边缘）；真实的 3.5:1 违规点只有 home 许愿弹窗副本 `#8a8a85`（落在副本自己的 --c-surface #ffffff 上）；--fs-cap 23rpx≈11.5px 偏小属实 | 违反后果：改 theme.json 零视觉生效（原诊断把死配置当渲染值）
- cook-mode 无 `wx.setKeepScreenOn`、计时靠 setInterval 累加（onHide 暂停后不恢复） | 违反后果：做菜锁屏/切后台计时静默失真
- 交付通道：测试为 `node test/dish-logic.test.js`（零依赖 assert，退出码判定）；无 CI | "通过"必须以该命令退出码 0 为准，UI 项靠微信开发者工具手测清单
- 计划书 v2.0 残项核实：字号散值现存 raw font-size 537 处 vs var(--fs-*) 291 处（阶梯采纳率约 35%）；recipe-card 仅 1 页用、section-head 仅 1 页用；empty-state 旧组件 0 引用（已并入 state-empty）；state-imgview 不存在 | 这些是设计债而非行为缺陷，收敛工程量大

## Open [TBD]
（空——全部进入 Decided）

## Decided
- [DEC-1] api 层失败路径改直接 reject（激活各页既有 catch/loadError 分支），fallback 降级为显式 opt-in：十个数据页对应 getter 删静默 fallback；仅 getCurrentUser 等依赖"失败=null"守卫的非关键调用保留 silent fallback | source [TBD-1] | auto + 面板 r0 修正（原"resolve 标记对象"方案页面仍需逐页加判断、且静默失效模式与被修的病同构；带 .then 后处理的 getter 会把标记当非法数据吞掉——见 verify.md V-1/V-2/V-3） | reject 使 getPaymentOrders 等后处理链在失败时天然跳过、直达页面 catch | 可逆：还原 api.js 单文件
- [DEC-2] 邀请链路最小修复：移除假码假二维码，拉取失败禁用复制/分享并给重试；不引入真 QR 库 | source [TBD-2] | auto | 新依赖 YAGNI，口令邀请已可用 | 可逆：恢复原逻辑
- [DEC-3] 本轮范围 = critical+major 行为缺陷 + 一行级 minor；组件收敛三件套（recipe-card/section-head 推广、字号 537 处收敛）、state-imgview 新建、忌口筛选（需后端字段）全部出范围 | source [TBD-3] | auto | 设计债无行为危害，混入会把本轮从快修拖成重构
- [DEC-4] showcase/launch 不移除 | source [TBD-4] | auto | showcase 是用户 2026-08 刚建的概念页，移属产品决策非缺陷修复 | 可逆：随时可删
- [DEC-5] 支付成功页 navigateTo 改 redirectTo | source [TBD-5] | escalated | 防返回栈回到 checkout 重复下单；属用户可见行为变化（返回键不再回结算页） | if wrong: 返回习惯改变，改回一行即可
- [DEC-6] 对比度不打 theme.json（死配置）：全局 --mut fallback ≈4.6:1 达标不动；真实违规点 home 弹窗副本随 5.5 副本对齐消除；大字模式 cap/mini 各 +4rpx 保留 | source [TBD-6] | auto + 面板 r0 修正（原方案改 theme.json 零生效，见 verify.md V-5） | 适老是家庭版核心场景 | 可逆：单文件值还原
