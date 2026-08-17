# Tasks: ui-ux-audit

> deps omitted = sequential; single executor, no owner field
> 方案本体见 proposal.md ## What（1–5 对应其五个工作束）

- [x] 1. api 层错误透传 + 全站错误态激活
  - [x] 1.1 utils/api.js：request 失败路径改 reject；十个数据页 getter 删静默 fallback，getCurrentUser 等保留显式 silent；逐点核对 getter 的 .then 后处理链与十页 await 消费点（页面代码无 fallback 字样，打点在 api.js）
  - [x] 1.2 十个读页（home/shopping/menu/pantry/weekly-menu/recipes/cook-log/vip-orders/community/cook-mode）setData 前判标记进 loadError，offline 重试组件可达
- [x] 2. 支付链路修正（payment/checkout）
  - [x] 2.1 取消检测改 `errMsg.indexOf('cancel')`，静默返回不弹错
  - [x] 2.2 成功跳转 navigateTo → redirectTo（DEC-5）
- [x] 3. 家庭邀请链路真实化（family/members + family/invite）
  - [x] 3.1 删伪造码（familyId*7919）与 836295 硬编码；拉取失败禁用复制/分享 + 重试
  - [x] 3.2 删 buildQrCells 伪二维码及对应 wxml/wxss
- [x] 4. 操作防护批次
  - [x] 4.1 submitting 守卫：community 发帖、pantry/shopping 加项、community 收藏
  - [x] 4.2 family/join：满 6 位才请求 + 序号守卫 + 输码中不弹错
  - [x] 4.3 recipe-detail：onLoad setData recipeId，分享路径带真实 id
  - [x] 4.4 post-detail：帖子不存在显示空态，删"静默换第一条"
  - [x] 4.5 me/settings：通知开关写 storage，onLoad 回填
- [x] 5. 微体验+适老批次
  - [x] 5.1 cook-mode：setKeepScreenOn（onUnload 释放）+ 计时改 Date.now 差值续跑
  - [x] 5.2 shopping 勾选乐观更新（本地先翻勾 + 单 PATCH；失败仅翻回该项 UI + toast，禁止重拉列表式回滚）
  - [x] 5.3 并发化：缺材一键加购、首页确认加入菜单改 Promise.allSettled + 汇报表
  - [x] 5.4 适老：home fontScale 移 onShow；大字模式 cap/mini +4rpx（全局 --mut ≈4.6:1 达标不动，theme.json 系死配置不改）
  - [x] 5.5 home 许愿弹窗 token 副本对齐全局（--r-card 16rpx 及 P1 色值）
  - [x] 5.6 删除体验：许愿/冰箱/购物项删除加确认或撤销 toast，触点 ≥64rpx；home 加菜查重；import 解析 loading+禁点
- [x] 6. 回归验收                          deps: 1.2, 2.2, 3.2, 4.5, 5.6
  - [x] 6.1 断网路径代码可达性：十页 loadError/catch 已逐点核对（verify r1/r2）；真机断网手测可选补做
  - [x] 6.2 `node test/dish-logic.test.js` 退出码 0