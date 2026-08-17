# Index: ui-visual-polish

Requirement source: 用户消息（/spec-workflow 任务陈述），2026-08-17

## Requirements
- R-1: "分析一下我的UI该怎么优化" | source: 用户消息 2026-08-17（UI 优化分析 + 可执行改进委托；具体行为项由本轮代码扫描证据支撑，见 proposal What）

## Assets
- A-1: miniapp/app.wxss 全局 token（色/字号/圆角/阴影）+ page.font-lg 大字模式 | use: extend
- A-2: components/recipe-card（card/row 双变体，仅 favorites 引用） | use: extend
- A-3: components/section-head（eyebrow/title/popPart/more，仅 me 引用） | use: extend
- A-4: components/state-empty / state-toast / state-dialog / state-sheet / state-loading / nav-bar | use: reuse
- A-5: docs/UI设计规范.md + docs/UI优化计划书.md v2.0（规范与历史残项基线） | use: extend（规范订正）/ rejected（计划书过时项：行为债已由 ui-ux-audit 消化）
- A-6: miniapp/theme.json light/dark token 注入 | use: extend（与 app.wxss fallback / 规范对齐）
- A-7: pages/home 手写 mh-rcard/mh-row、pages/recipes 手写 rx-card、14 页手写 .shead | use: pattern（迁移源，迁移后删除重复样式）
- A-8: pages/showcase + artifacts/*-warm.html（概念/设计稿） | use: rejected: 概念页不并入正式修复；设计稿只作对照不整页复刻
- A-9: spec/changes/ui-ux-audit（已 verify pass：错误态/支付/邀请/操作防护） | use: rejected: 行为债本轮不再重复；仅承接其 DEC-3 出范围的设计债

## Exemplars
- E-1: 菜谱卡统一 → pages/me/favorites 已接 recipe-card 的用法为模板
- E-2: 区块标题统一 → pages/me 已接 section-head 的用法为模板
- E-3: 弹层滚动锁 → components/state-sheet + home wish-backdrop 的 catchtouchmove 写法为模板