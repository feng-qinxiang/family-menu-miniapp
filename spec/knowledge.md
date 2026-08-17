# Knowledge

Durable facts for future changes. One line each.

- api.js `request()` 失败默认 reject；数据页 getter 勿再挂静默 fallback；getCurrentUser 等保留 silent null | evidence: ui-ux-audit DEC-1 | 2026-08-16
- 支付取消匹配 `errMsg` 含 `cancel`（英文）；成功页用 redirectTo 防返回栈重复下单 | evidence: ui-ux-audit | 2026-08-16
- 家庭邀请禁止前端伪造码/伪二维码；失败禁用复制分享 | evidence: ui-ux-audit | 2026-08-16
- recipe-card：variant card|row；density home|grid|default；事件 tap/add/fav；virtualHost | evidence: index ui-visual-polish A-2 | 2026-08-17
- section-head：eyebrow/title/popPart/titleTail/hint/more；ext-class；virtualHost；全站区块标题权威组件 | evidence: index ui-visual-polish A-3 | 2026-08-17
- theme.json light 暖奶油（paper #fbf8f3 / mut #7a6e5d）对齐 app.wxss fallback；--r-card 代码与规范均为 16rpx | evidence: ui-visual-polish DEC-3 | 2026-08-17
- 功能图标禁止 emoji 字形；评分装饰 ★ 可保留；弹层 mask 须 catchtouchmove 或 state-sheet | evidence: ui-visual-polish | 2026-08-17
- 交付验收：`node test/dish-logic.test.js` EXIT=0；无 CI | evidence: both changes | 2026-08-17