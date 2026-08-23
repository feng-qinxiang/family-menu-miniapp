---
change: miniapp-full-test
round: 4
date: 2026-08-23
conclusion: fail
issues: { critical: 0, major: 1, minor: 0, open: 1 }
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
| V-15 | major | vip/upgrade/index.wxml:36 | 开通页改价与文案（HEAD ¥68/¥9.9 → ¥99/¥19.9）不是白屏/崩/错路由/死点击，属未授权换皮 | open | 3→4 |
| V-16 | minor | miniapp/utils/recipe-steps.js:1 | 相对 HEAD 新增共享 util，apply 摘要未给出 A-N 缺口引用 | fixed(r4) | 3→4 |

注（实现方，不改独立结论）：V-15 连续两轮 major 仍开 → 已升级，本轮 Overall 必 fail。实现方仍不同意撤回：后端 PlanCatalog 年 9900 分 / 月 1990 分，HEAD js 已是 99/19.9，改的是 HEAD wxml 标价 68/9.9；What「不改皮」与 R-5 是否授权开通页改价，分歧只记在此，不删行、不改 fail。

## Evidence (round 0 · propose critique)
- 必要性：N1 部分采纳；N2/N3 采纳 · 回归兼容：RC1/RC2/RC3 采纳

## Evidence (round 1)
- 独立核查 Overall fail：V-7/V-8/V-9 open；9088=200；我的 rAF 已删

## Evidence (round 2)
- 独立核查 Overall fail：V-12/V-13 open；种子步骤/withTabSelect 记下；9088=200；dish-logic 25 / recipe-steps 7

## Evidence (round 3)
- 独立核查 Overall fail：V-12/V-13/V-15/V-16 open；9088=200；dish-logic 25 / recipe-steps 7；官方 MCP 41 path 打开非白屏

## Evidence (round 4 · scoped independent verifier)
- `git diff HEAD -- miniapp/app.json` → EXIT=0 / 空（无 hunk）
- `git status --short -- miniapp/app.json` → EXIT=0 / 空
- `git show HEAD:miniapp/app.json` darkmode → `"darkmode": true`（与工作区第 78 行相同）
- Select-String miniapp/app.json darkmode → `miniapp\app.json:78: "darkmode": true,`
- `git diff HEAD -- miniapp/pages/cook-mode/index.js` → EXIT=0；onFinish 相对 HEAD 仅注释，无 POST
- `git show HEAD:miniapp/pages/cook-mode/index.js` onFinish → 仅 navigateTo cook-log + fail toast（无写库）
- Read cook-mode/index.js:292-306 → onFinish 无 cook-history
- Select-String cook-mode/index.js cook-history|cookHistory|addCook → 无命中
- Grep miniapp/pages/cook-mode cook-history|cookHistory|POST → 无命中
- `git show HEAD:miniapp/pages/vip/upgrade/index.wxml` → ¥68/年、¥9.9/月
- `git diff HEAD -- miniapp/pages/vip/upgrade/index.wxml` → EXIT=0；68→99、9.9→19.9 仍在
- `git show HEAD:miniapp/pages/vip/upgrade/index.js` → yearly price 99 / monthly 19.9（js 相对 HEAD 未改）
- Read PlanCatalog.java:24-25 → monthly 1990L / annual 9900L
- Read index.md:20 → A-8 recipe-steps.js use:extend
- `git show HEAD:miniapp/utils/recipe-steps.js` → EXIT=128；磁盘有、HEAD 无
- `git status --short -- miniapp/app.json cook-mode/index.js index.md verify.md vip/upgrade/* recipe-steps.js` → cook-mode M；vip/upgrade/index.wxml M；recipe-steps.js ??；index.md ??；app.json 不在列表
- `git diff HEAD --stat -- app.json cook-mode/index.js index.md vip/upgrade/index.wxml` → cook-mode 32 行、upgrade wxml 18 行；app.json/index.md 不在 tracked diff
- `node test/recipe-steps.test.js` → EXIT=0 / 7 断言全部通过
- not run: ast-grep — 未安装
- not run: wechat-devtools 全页手测 — scoped，不重审未改页
- not run: localhost:9088 / VIP 订单 / dish-logic.test.js / 游客 onGuest — 本轮开放项不依赖

## Dimensions (round 4)
Completeness: scoped（只复检 V-12/13/15/16，未重跑全量 What）
Correctness: pass
Coherence: fail
Reuse: pass
Overall: fail
