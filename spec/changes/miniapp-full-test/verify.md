---
change: miniapp-full-test
round: 7
date: 2026-08-25
conclusion: pass
issues: { critical: 0, major: 0, minor: 0, open: 0 }
---

# Verify: miniapp-full-test

## Findings
| ID | Severity | Location | Finding | Status | Rounds |
|----|----------|----------|---------|--------|--------|
| V-1 | major | How 9088 失败态 | 厨房挂掉被写成可收工，有数据路径能不测 | fixed(r0) | 0 |
| V-2 | major | What 拆成子集 | 只开不点 + 两个子集条，静默砍掉其余页主按钮 | fixed(r0) | 0 |
| V-3 | minor | What 支付取消手续 | 「面板出现就取消」无打开即出面板的证据 | fixed(r0) | 0 |
| V-4 | major | What 错页标准 | 按文案=去处改 navigate 会打掉已上线路由 | fixed(r0) | 0 |
| V-5 | major | What 游客+厨房 | 游客 token 覆盖后把门闩空态当没反应去修 | fixed(r0) | 0 |
| V-6 | minor | Risk 回滚按页 | 共享文件改完不回测其他注册页 | fixed(r0) | 0 |
| V-7 | major | me/index 编辑资料·消息 | 相对 HEAD 新增「编辑资料」「消息」及 goProfileEdit/goNotifications | wontfix: user-override 保留入口并点通，不为对齐 HEAD 撤回 | 1 |
| V-8 | major | me 查看全部记录 | HEAD 为 goRecipes，工作区为 goCookLog；按文案改已有路由 | wontfix: user-override 文案「全部记录」应对 cook-log，保留 goCookLog | 1 |
| V-9 | minor | me 统计行 tap-scale | 去掉本月做菜/家庭成员/最近上桌行 tap-scale | wontfix: user-override 去掉假热区（上一档 ui-click-display） | 1 |
| V-10 | major | cook-mode / data.sql | source: user（R-3 全部开始修复）糖醋排骨等种子菜有名无步骤，做菜模式 0 步 | fixed(r2) | 2 |
| V-11 | major | custom-tab-bar / tab 页 | source: user（R-3 全部开始修复）底栏 switchTab 后仍高亮「今日」 | fixed(r2) | 2 |
| V-12 | major | miniapp/app.json:78 | What「只改阻断 / verify: diff 无换肤」未满足，工作区仍含关暗色模式 | fixed(r4) | 2→3→4 |
| V-13 | major | cook-mode/index.js:307 | 完成烹饪新增 POST /api/cook-history；What/V-10 只要求种子步骤，未授权这条新写入 | fixed(r4) | 2→3→4 |
| V-14 | major | recipe-detail / 照片 hero | source: user（R-5 好多的页面显示不行）照片头只有 360rpx，大标题顶进状态栏 | fixed(r3) 实现方工作检查；本轮独立核查未点名此项 | 3 |
| V-15 | major | vip/upgrade/index.wxml:36 | 开通页改价与文案（HEAD ¥68/¥9.9 → ¥99/¥19.9）不是白屏/崩/错路由/死点击，属未授权换皮 | fixed(r6) | 3→4→5→6 |
| V-16 | minor | miniapp/utils/recipe-steps.js:1 | 相对 HEAD 新增共享 util，apply 摘要未给出 A-N 缺口引用 | fixed(r4) | 3→4 |
| V-17 | major | miniapp/pages/auth/login/index.wxml:15 | 本轮工作区几乎全是文案/图标换肤，不是 What 允许的阻断；「测 showcase」本属排除区却改了 showcase | fixed(r6) | 5→6 |

## Evidence (round 0 · propose critique)
- 必要性：N1 部分采纳；N2/N3 采纳 · 回归兼容：RC1/RC2/RC3 采纳

## Evidence (round 1)
- 独立核查 Overall fail：V-7/V-8/V-9 open；9088=200；我的 rAF 已删

## Evidence (round 2)
- 独立核查 Overall fail：V-12/V-13 open；种子步骤/withTabSelect 记下；9088=200；dish-logic 25 / recipe-steps 7

## Evidence (round 3)
- 独立核查 Overall fail：V-12/V-13/V-15/V-16 open；9088=200；dish-logic 25 / recipe-steps 7；官方 MCP 41 path 打开非白屏

## Evidence (round 4)
- 范围复检 Overall fail：V-12/13/16 fixed(r4)；V-15 仍开；recipe-steps 7

## Evidence (round 5)
- 独立核查 Overall fail：V-15/V-17 open；登录勾选与协议链、VIP/结账打开且无新已支付订单已取证

## Evidence (round 6 · independent verifier)
- index.md present; design.md absent
- Read proposal.md ## What → 修订 APPROVED 2026-08-23 19:43：改阻断和显示乱；verify 含 99/19.9、无 FAMILY MENU/Step N/N days/Greens、详情页无垃圾桶圆钮和方框减号
- Read verify.md → 当时 open: V-15, V-17
- `git diff HEAD --stat` → EXIT=0 / 22 files, +66/−115
- `git diff HEAD -- miniapp` → 登录/微信授权/做菜记录/做菜模式/首页/导入/引导/闪屏/购物/showcase/vip 文案与 CSS 图标替换；无 navigate/新 /api/
- Read vip/upgrade/index.wxml:36,48 + PLAN_MAP → 年卡 99 / 月卡 19.9
- Read PlanCatalog.java:24-25 → monthly 1990L / annual 9900L
- Grep miniapp `FAMILY MENU|Family Menu|Step \{|/ 7 days|Greens` → 无用户可见命中（仅 login.wxss 注释）
- `git diff aa33f91^..HEAD -- miniapp/pages/recipe-detail/` → 删除 rd-cbtn/rd-ic-cart、rd-ic-box
- Grep `rd-ic-box|rd-cbtn|rd-ic-cart` → 无命中
- Read login 协议链 → legal/terms、legal/privacy
- Read cook-mode onFinish → 仅 navigateTo cook-log，无 POST cook-history
- `node test/recipe-steps.test.js` → EXIT=0 / 7
- `node test/dish-logic.test.js` → EXIT=0 / 25
- `Invoke-WebRequest http://localhost:9088` → 连接被拒绝（环境未完成）
- GetDynamicTools user-wechat-devtools → namespaceStatus=error
- CallDynamicTool mcp_auth → 30s 无响应
- not run: ast-grep — 未安装；改文件已手工 Grep catch/`||`
- not run: 全量 41 path / 模拟器勾协议 / 打开 VIP 与结账后查已支付订单 / 游客 onGuest — MCP 不可用且 9088 未起；按 How 标环境未完成，不因此整档死锁
- not run: Maven / 真支付 — Not in this change

## Evidence (round 7 · independent verifier)
- index.md present; design.md absent
- `git diff HEAD --stat` 含 miniapp / data.sql / knowledge → EXIT=0 / 28 files
- 开通页年卡 ¥99/年、月卡 ¥19.9/月；PlanCatalog 1990L / 9900L
- Grep 用户可见 `FAMILY MENU|Family Menu|Step |/ 7 days|Greens` → 无命中
- image.js：土豆丝→potato-shreds；清炒时蔬→stir-fry-veg；不再把「土豆」映射成茄子
- GET /api/recipes 200：酸辣土豆丝 potato-shreds.jpg；清炒时蔬 stir-fry-veg.jpg
- 官方 MCP：首页可见这两道封面；登录 `.cn`=家庭点菜；开通页家庭会员 99/19.9；做菜模式「第一步 · 1/4」；做菜记录 `0 / 7 天`
- 购物分组无 Greens；section-head 为「自己加 / 临时加购」
- `node test/dish-logic.test.js` → EXIT=0 / 25
- `node test/recipe-steps.test.js` → EXIT=0 / 7
- 9088=200；未点游客、未支付
- not run: ast-grep 未安装；Maven / 真支付 — Not in this change

## Dimensions (round 7)
Completeness: pass
Correctness: pass
Coherence: pass
Reuse: pass
Overall: pass
