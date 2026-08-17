# Proposal: ui-ux-audit

## Why
两路并行审计（交互/UX 22 条 + 设计 token 扫描）发现：全站错误态 UI 因 api 层静默 fallback 全部不可达——断网时用户看到"菜单是空的/0 订单"假象并可能重复下单；支付取消弹英文原始报错；家庭邀请链路（裂变主路径）输出可复制的假邀请码和扫不出的假二维码。这三类直接打掉产品可信度，且修复成本极低。另有十余处一行级操作防护/适老缺陷值得顺手收敛。

## What
- api 层失败改 reject + 全站错误态激活：request() 失败路径直接 reject（成功路径零改动），十个数据页对应 getter 删静默 fallback，各页既有 catch/loadError 分支激活、offline 重试组件可达；getCurrentUser 等依赖"失败=null"守卫的调用显式保留 silent fallback；apply 时核对 api.js 全部 getter 的 .then 后处理链与十页 await 消费点 | refs: R-1 | verify: 开发者工具断网/接口 500 后，home 与 shopping 显示错误态+重试（而非"从第一道菜开始"/"今天不用买"），vip-orders 显示错误态而非"0 笔订单"；重试恢复后回到数据态
- 支付链路修正：errMsg 含 `cancel` 即静默返回不弹错；支付成功 `wx.redirectTo` 到 success 页防返回栈重复下单 | refs: R-1 | verify: 沙箱支付点取消无任何 toast 且停留原页；支付成功后从 success 页点返回直达进入前的页面而非 checkout，且无法再次点击支付
- 家庭邀请链路真实化：删除 `familyId*7919` 伪造码与 invite 页 `836295` 硬编码 + 伪点阵二维码；拉取失败时禁用复制/分享按钮并显示"重试" | refs: R-1 | verify: members/invite 页在接口失败时无任何可复制码/码图，按钮禁用态可重试；成功时展示后端真实码
- 操作防护批次：community 发帖 + pantry/shopping 加项 + community 收藏补 submitting 守卫；family/join 满 6 位才请求 + 请求序号守卫 + 输码中不弹错；recipe-detail 分享路径携带真实 id（onLoad setData recipeId）；post-detail 帖子不存在时显示"已删除/不存在"空态而非静默换第一条；me/settings 通知开关写 storage 并回填 | refs: R-1 | verify: 连点"发布"仅产生 1 帖；join 页输入前 5 位无 toast 无请求；分享卡片打开直达原菜谱；开关切换后杀进程重进保持
- 微体验+适老批次：cook-mode `wx.setKeepScreenOn` + 计时改时间戳差值（切后台回来计时连续）；shopping 勾选乐观更新（本地先翻勾，失败回滚）；缺材一键加购与首页"确认加入菜单"改 `Promise.allSettled` 并汇报"已加 X 失败 Y"；home fontScale 读取移 onShow；大字模式 cap/mini +4rpx（全局 --mut 实测 ≈4.6:1 达标不动，对比度真实违规点在 home 弹窗副本，由下项覆盖）；home 许愿弹窗 token 副本对齐 P1 换肤后全局值（含 --r-card 16rpx、--mut #7a6e5d，消除副本 3.5:1 违规）；许愿/冰箱/购物项删除加确认或撤销 toast 且删除触点 ≥64rpx；home 加菜前查 todayMenu 去重；import 解析加 loading+按钮禁用 | refs: R-1 | verify: 手测清单逐项过 + `node test/dish-logic.test.js` 退出码 0

**Not in this change**: 组件收敛三件套（recipe-card/section-head 推广、字号 537 处散值收敛到 var(--fs-*)）；state-imgview 新建；忌口筛选（需后端 avoid_tags 字段，见 UI优化计划书 C-2）；showcase/launch 页移除（产品决策）；tabBar 结构调整（menu/shopping 入口权衡）。

## How
- 错误态修复打在 api.js 一处而非 32 个页面：失败路径 reject（DEC-1），getPaymentOrders 等带 .then 后处理的 getter 失败时跳过后处理直达页面既有 catch；getCurrentUser 保留 fallback:null（settings/wechat-auth/profile-edit 等 5 个 !user 守卫页语义不变）；核对打点在 api.js getter 定义与十页 await 处（页面代码无 fallback 字样）
- 全部防护仿库内既有模式：submitting 守卫仿 `commentSubmitting`、序号守卫仿 `_wishSeq`、删除确认仿 menu 的 state-dialog；零新依赖（DEC-2/DEC-3）
- shopping 勾选乐观更新钉死约束：失败仅翻回该项 UI + toast，禁止重拉列表式回滚（防连勾竞态弹回邻项）
- 计时连续性用 Date.now 差值：onHide 记 elapsed，onShow 从 elapsed 续跑，替代 setInterval 裸累加

## Risk
- 波及面：api.js 为全站唯一请求出口，reject 化若漏掉某 getter 的后处理/某页无 catch 的 await，会出现未处理 rejection → apply 时逐点核对 getter .then 链与十页 await 消费点；回归靠"断网手测 10 页清单"
- 触发场景：redirectTo 后用户无法从 success 页返回 checkout（行为变化，DEC-5 已升级声明；checkout 为会员支付，复购本就经 vip/upgrade 重进，后端同单幂等见 PaymentService.java:82-83）；大字模式 +4rpx 会改变 cap/mini 两级所有引用处排版密度
- 回滚：api.js/theme.json/checkout 三处均为单文件小 diff，git revert 即可整体退回

<!-- APPROVED: 2026-08-16 22:00 -->
