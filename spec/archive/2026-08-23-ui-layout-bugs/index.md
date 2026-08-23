# Index: ui-layout-bugs

Requirement source: 用户消息，2026-08-22

## Requirements
- R-1: "分析一下我的ui和布局和其他的各种bug" | source: 用户消息 2026-08-22
- R-2: "我是小白，你看看怎么帮我完善" | source: 用户消息 2026-08-22

## Assets
- A-1: pages/home（hasHomeData 已写未挂、applyFilters、mh-load-error、系统导航【新】标题） | use: extend
- A-2: utils/env.js `resolveConfig` + app.js `apiBaseUrl` | use: extend
- A-3: utils/api.js `request`/`rawRequest`（失败默认 toast；无 timeout） | use: extend
- A-4: pages/me + profile-edit + notifications + cook-log（页在、入口断） | use: extend
- A-5: pages/cook-mode `onFinish` | use: extend
- A-6: recipe-edit / recipe-detail / family/join / settings / login / community HOT_TOPICS / import 拍照 tab | use: extend
- A-7: Vant / TDesign / WeUI / ColorUI 整库 | use: rejected: 换肤打暖奶油 + 主包体积
- A-8: 全站 raw 字号 / 主包瘦身 / 死页删除 / 后端三洞 | use: rejected: 小白本轮不可见或跨栈

## Exemplars
- E-1: 首页错误态 → 已有 mh-load-error 静态碗（禁止退回无限 spin）
- E-2: 「我的」入口行 → 已有 mag-trow / mag-srow
- E-3: 加菜去重 → home `addToToday` 已有守卫
