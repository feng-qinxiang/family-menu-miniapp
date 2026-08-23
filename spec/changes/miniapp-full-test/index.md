# Index: miniapp-full-test

Requirement source: 用户消息，2026-08-23

## Requirements
- R-1: "那现在开始测试小程序的所有东西吧" | source: 用户消息 2026-08-23
- R-2: "a"（先归档 ui-click-display，再开全量测试方案，过门后用官方 MCP 按页点） | source: 用户消息 2026-08-23
- R-3: "开始吧，全部开始修复" | source: 用户消息 2026-08-23
- R-4: "全部ui都得看，点击，懂吗" | source: 用户消息 2026-08-23
- R-5: "好多的页面显示i不行" | source: 用户消息 2026-08-23（详情页番茄炒蛋截图：标题顶进状态栏）

## Assets
- A-1: 官方 `wechat-devtools` MCP（`automation_runtime_info` / `automation_element_action` / `simulator_screenshot` / `simulator_open_page`） | use: reuse
- A-2: `miniapp/app.json` 已注册页面列表（验收范围的唯一清单） | use: reuse
- A-3: 开发态 API `http://localhost:9088`（`miniapp/utils/env.js`）；后端 `server/` Spring Boot + 本机 MySQL | use: reuse
- A-4: `node test/dish-logic.test.js`、`node test/recipe-steps.test.js` | use: reuse
- A-5: 游客登录 `guestLogin` / 登录页 `onGuest` | use: reuse
- A-6: Maven `./mvnw test` / 真微信支付 | use: rejected: 不能代替小程序手测；真支付不在范围
- A-7: `pages/showcase` | use: reuse: R-4 要求全部 UI 都看、都点
- A-8: `miniapp/utils/recipe-steps.js` | use: extend: 步骤图 JSON 编解码；HEAD 无此文件，本档为做菜模式能读种子步骤而新增

## Exemplars
- E-1: 本轮不新增页面；手测记录学已归档 `ui-click-display` 的 MCP 截图 + verify Evidence 行
