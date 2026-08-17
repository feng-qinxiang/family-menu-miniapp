# Index: ui-ux-audit

Requirement source: 用户消息（/spec:workflow 任务陈述），2026-08-16

## Requirements
- R-1: "你看看我的整个设计还有啥需要改进的，还有ui，交互啥的" | source: 用户消息 2026-08-16（审计授权 + 改进交付的广义行为委托；具体行为项由审计证据支撑，见 proposal What 各项）

## Assets
- A-1: miniapp/utils/api.js request 封装（含 fallback 机制、401 单飞重登） | use: extend
- A-2: components/state-toast / state-empty / state-dialog / state-sheet / state-loading（全站反馈组件族） | use: reuse
- A-3: components/nav-bar（32 页统一返回） | use: reuse
- A-4: pages/home/index.js `_wishSeq` 竞态序号守卫 | use: pattern
- A-5: pages/community/index.js `submitComment` 的 commentSubmitting 防重守卫 | use: pattern
- A-6: pages/menu/index.js 撤菜/记历史的 state-dialog 二次确认 | use: pattern
- A-7: miniapp/theme.json 深浅色 token（P1 换肤产物） | use: extend
- A-8: docs/UI优化计划书.md v2.0（2026-08-05 审计） | use: rejected（部分）: 其 A/B/C/D 清单中大半已被 2026-08-05 后的 P1/P2/收尾提交完成，仅残项有效
- A-9: pages/showcase + awwwards-demo.html（概念演示） | use: rejected: 概念稿不并入正式修复范围

## Exemplars
（无新页面/新模块，全部为既有页面修复，不设 E-N）
