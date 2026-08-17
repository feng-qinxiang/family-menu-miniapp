---
change: ui-ux-audit
round: 2
date: 2026-08-16
conclusion: pass
issues: { critical: 0, major: 1, minor: 2, open: 0 }
---

# Verify: ui-ux-audit

> round 0 = /spec:propose 批评面板（必要性 + 回归兼容）；round 1 = apply 收尾独立终验；round 2 = 对 r1 三条 finding 修复的定向复核

## Findings
| ID | Severity | Location | Finding | Status | Rounds |
|----|----------|----------|---------|--------|--------|
| V-1 | major | proposal How-1 / DEC-1 | "resolve 标记对象、页面零改动"名不副实（10 页仍需逐页加判断），且静默失效模式与被修的静默 fallback 同构 | fixed(r0)：DEC-1 改为失败直接 reject，激活既有 catch | r0 |
| V-2 | major | api.js getPaymentOrders 等带 .then 后处理的 getter | 标记对象会被规范化吞掉，错误态仍不可达；防护网命令 `grep .fallback(` 在页面层零命中 | fixed(r0)：reject 方案下 .then 后处理链失败时天然跳过；核对打点改在 api.js getter 与十页 await 处 | r0 |
| V-3 | major | getCurrentUser + settings/wechat-auth/profile-edit/home/me/audit 五页 | 失败语义 null→truthy 穿透全部 `if (!user)` 守卫 | fixed(r0)：getCurrentUser 显式保留 silent fallback:null | r0 |
| V-4 | major | theme.json vs app.wxss:12 | --themeMut 是死配置，改 theme.json 零视觉生效；真实违规仅 home 弹窗副本 3.5:1 | fixed(r0)：DEC-6 改打 home 副本对齐（What-5），theme.json 不动 | r0 |
| V-5 | minor | What-5 shopping 乐观更新 | "失败回滚"未钉实现约束，快照/重拉式回滚会弹回邻项 | fixed(r0)：How 钉死约束（r1 复核发现残留竞态，见 V-8，已彻底修复） | r0→r2 |
| V-6 | minor | DEC-5 支付 redirectTo | 质疑触发场景无证据、"付完补买"被阻断 | wontfix: 反驳成立——后端同单幂等（PaymentService.java:82-83）不覆盖前端每次新建订单；checkout 为会员支付无"补买"场景 | r0 |
| V-7 | major | api.js:131/141 + menu/me {{loadError}} | reject 化新增英文模板 `request failed: 0` 经 loadError 直出，断网时 menu/me 显示英文技术串 | fixed(r1)：两处改中文 '网络请求失败，请稍后重试'，status 保留在 error.status；全库仅剩 console.warn 日志行 | r1→r2 |
| V-8 | minor | shopping/index.js toggleItem catch | 乐观回滚用请求时快照全量覆盖：A pending 期间翻 B，A 失败会把 B 一并弹回 | fixed(r1)：改按 itemId 对当前 this.data 定向回退，且仅当该项仍处于本次乐观翻勾态（purchased === next）才翻回 | r1→r2 |
| V-9 | minor | recipe-detail onLoad | 连续两次 setData 且重复携带 statusBarHeight | fixed(r1)：合并为一次 setData | r1→r2 |

## Evidence (round 1)
独立 spec-verifier（fresh context，仅读 spec 工件 + git diff）：Completeness pass / Correctness partial / Coherence pass / Reuse pass → Overall fail（仅因 V-7）
node test/dish-logic.test.js → "25 断言全部通过" 退出码 0
node --check 17 个改动 js → 全部 OK
19 个被拆 fallback getter 的 25 处调用点逐一核对 → 均有 catch/.catch/try 或 loadError 流程，无未处理 rejection
git diff --name-only 排除 miniapp/ → 0 命中（server//components/tabBar/showcase 零触碰）
not run: 断网/500 手测 10 页 + 沙箱支付手测 — 本环境无微信开发者工具；代码路径已人工追踪确认可达

## Evidence (round 2)
同验证员定向复核 V-7/V-8/V-9：三处均确认 fixed，无新增回归 → Overall pass
node --check api.js / shopping / recipe-detail → OK
node test/dish-logic.test.js → 25 断言通过，EXIT=0
