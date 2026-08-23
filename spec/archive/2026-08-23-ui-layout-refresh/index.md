# Index: ui-layout-refresh

Requirement source: 用户消息 + 首页截图，2026-08-17

## Requirements
- R-1: "看看好看的ui组件库，改改UI，和布局" | source: 用户消息 2026-08-17
- R-2: 首页截图展示：错误态为转圈+文案+红按钮；餐次 chip 灰/黑选中；许愿池卡片；区块「家里常做的菜」右侧「全部」旁箭头像叉号；下方大片空白 | source: 用户粘贴截图 2026-08-17

## Assets
- A-1: miniapp/app.wxss token + .shead/.chip/.btn 全局样式 | use: extend
- A-2: components/section-head（seeall 双线箭头当前像 ×） | use: extend
- A-3: components/state-empty（type offline 等） | use: reuse
- A-4: pages/home 错误态 mh-load-error、fp-slot、fp-wish、mh-sheet | use: extend
- A-5: custom-tab-bar（保留，不换库 tab） | use: reuse
- A-6: Vant Weapp / TDesign / WeUI / ColorUI | use: rejected: 整库换肤打杂志暖色 + 主包体积 + 与 custom-tab-bar 冲突；可选日后 cherry-pick 反馈组件
- A-7: 设计参考 下厨房 m 站 / Linear 密度 / Stripe 间距纪律 | use: pattern（纯布局/状态，不引依赖）

## Exemplars
- E-1: 错误/空态视觉 → state-empty offline 结构 + 杂志插画感（替代 spinner-only）
- E-2: 区块标题 → section-head（修箭头后为全站权威）
- E-3: chip 选中 → 可保留 ink 深选中，弱化未选描边；餐次与菜系共用 .chip 节奏