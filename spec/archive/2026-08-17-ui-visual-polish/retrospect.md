---
change: ui-visual-polish
archived_at: 2026-08-17
divergences: 1
evidence: attached
deferred: 0
override: none
---

# Retrospect: ui-visual-polish

## Divergence review
- proposal What-2 原写「section-head 仅四 tab+menu/shopping」；验收后用户要求全部搞定，二级页 shead 已全量迁完（recipe-detail/import/weekly/vip/cook-log/upgrade/members/community/preference-profile）——范围扩大有用户授权，非静默漂移。
- 其余 What 项与代码一致：recipe-card 三页、theme light #fbf8f3、规范 16rpx、功能字形 CSS 化。

## Evidence
- node test/dish-logic.test.js → 25 断言通过 EXIT=0
- Grep class="shead / 功能 emoji → 0；section-head json 引用 15 页；recipe-card 3 页
- home/recipes bind:tap + bind:add 在位；themePaper=#fbf8f3

## Unfinished / deferred
all done（真机像素级扫一眼仍建议，非阻塞）

## Auto-decision calibration
- DEC-1 主路径收窄：后被用户「全部搞定」推翻扩到二级页 → 模式：用户说全部时再扩，门禁默认最小仍对
- DEC-3 theme 暖色：held
- 其余 auto：held