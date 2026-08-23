---
change: ui-click-display
archived_at: 2026-08-23
divergences: 2
evidence: attached
deferred: 0
override: none
---

# Retrospect: ui-click-display

## Divergence review
- How 写 `weapp-dev` npm 包；归档前用户已改用官方 `wechat-devtools` 并删 `weapp-dev`（`spec/knowledge.md` 已订正）
- What「点菜必进加菜」：`goAddRecipe` 实际 `switchTab` 菜谱库，不是 `recipe-edit`（`miniapp/pages/menu/index.js`）
- 其余抽查对齐：问候语无 `goDetail`；菜图/菜名仍进详情；图标为购物车/书；「点菜」在 nav-bar slot；`.m-act` 80rpx；购物整行勾选；登录框 64rpx；菜谱 `addPlacement="corner"`；社区 `loading && !posts.length`；冰箱/菜谱失败清列表；`state-loading` `catchtouchmove`

## Evidence
- node test/dish-logic.test.js → EXIT=0 / 25
- node test/recipe-steps.test.js → EXIT=0 / 7
- 官方 MCP：问候语留首页；菜名进详情；购物车→买菜；书→菜谱；本月做菜不跳；点菜→菜谱库；新建菜谱→编辑；话题芯片不跳；登录勾选+协议进法律页；有帖时无「正在加载」
- not run: ast-grep not installed

## Unfinished / deferred
all done

## Auto-decision calibration
DEC-6（接 weapp-dev npm）后来被用户推翻为官方 `wechatide mcp`。其余 escalated（只修已确认热区、图标不改路由、先归档并行 change）all held。
