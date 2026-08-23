---
change: ui-layout-bugs
archived_at: 2026-08-23
divergences: 0
evidence: attached
deferred: 0
override: none
---

# Retrospect: ui-layout-bugs

## Divergence review
none found — 首页 hasHomeData 已挂、撒谎入口已改口或隐藏、做菜先写记录再跳、apiBaseUrl 走 resolveConfig。

## Evidence
- verify r2 conclusion: pass；V-7..V-12 已 fixed 或 wontfix
- node test/dish-logic.test.js → EXIT=0 / 25
- node test/recipe-steps.test.js → EXIT=0 / 7

## Unfinished / deferred
all done

## Auto-decision calibration
all held（DEC-1 大包不做、DEC-4 锁浅色未被推翻）
