---
change: miniapp-full-test
archived_at: 2026-08-25
divergences: 2
evidence: attached
deferred: 1
override: none
---

# Retrospect: miniapp-full-test

## Divergence review
- DEC-2 原「只修阻断」：用户 R-4/R-5/R-6 点名显示乱后，修订 What 授权假价/英文/坏图标/标题顶栏；代码按修订 What 改，不是按旧 DEC-2
- DEC-5 原「不测 showcase」：R-4 要求全页都看，showcase 已打开并改显示乱
- 抽查对齐：开通页 99/19.9；无用户可见 FAMILY MENU/Step N/Greens；详情无垃圾桶圆钮/方框减号；cook-mode onFinish 只跳 cook-log；邀请码 8 位；tab `withTabSelect`

## Evidence
- 官方 MCP 打开 app.json 注册页并点主按钮；hand-walk.jsonl + hand-shots/
- 登录整行勾选；用户协议 → legal/terms
- GET /api/payment/orders → 0 已支付（VIP/结账只打开）
- 酸辣土豆丝 potato-shreds；清炒时蔬 stir-fry-veg；香菇滑鸡 mushroom-chicken
- node test/dish-logic.test.js → EXIT=0 / 25
- node test/recipe-steps.test.js → EXIT=0 / 7
- verify r7 conclusion: pass；open 0
- not run: ast-grep 未安装；真支付 / Maven — Not in this change

## Unfinished / deferred
游客进首页未在收口轮重跑（How：测厨房前不用游客覆盖会话）

## Auto-decision calibration
DEC-2、DEC-5 在门后被用户点名推翻（显示乱 / 要看 showcase）。其余 escalated/auto held。
