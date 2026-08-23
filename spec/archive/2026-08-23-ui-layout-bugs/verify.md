---
change: ui-layout-bugs
round: 2
date: 2026-08-22
conclusion: pass
issues: { critical: 0, major: 0, minor: 0, open: 0 }
---

# Verify: ui-layout-bugs

## Findings
| ID | Severity | Location | Finding | Status | Rounds |
|----|----------|----------|---------|--------|--------|
| V-1 | major | What 做菜闭环 | 写失败仍跳转会打穿「记录页能看到刚做的」 | fixed(r0) | 0 |
| V-2 | major | What 撒谎入口 | 藏拍照识别无证据；忘记密码页为假号故仍藏 | fixed(r0) | 0 |
| V-3 | minor | What 请求 timeout | 10s 会误杀慢请求 | wontfix | 0 |
| V-4 | major | What 加入家庭 redirectTo | 改返回栈是另一契约 | fixed(r0) | 0 |
| V-5 | major | What hasHomeData 软失败 | 已装失败态从整页摘空变为可点旧内容 | wontfix | 0 |
| V-6 | minor | What 查看全部记录 | 已养成进菜谱库的路径被改走 cook-log | wontfix | 0 |
| V-7 | major | settings 微信绑定 | 写死「未绑定」 | fixed(r2) | 1-2 |
| V-8 | major | home loadAll 竞态 | 成功路径不校验 seq | fixed(r2) | 1-2 |
| V-9 | major | refreshLight | catch 返回 null 吞错 | fixed(r2) | 1-2 |
| V-10 | major | recipe-steps.js | JSON.parse 空 catch | fixed(r2) | 1-2 |
| V-11 | minor | recipe-card / section-head | 关 virtualHost、箭头 ›；预存 ui-layout-refresh 改动 | wontfix | 1-2 |
| V-12 | minor | cook-mode 双 toast | 写失败 api+页面双闪 | fixed(r2) | 1-2 |

## Evidence (round 1)
- 独立 verifier Overall fail；V-7..V-12 开放
- node test/dish-logic.test.js → EXIT=0
- node test/recipe-steps.test.js → EXIT=0
- not run: ast-grep not installed

## Evidence (round 2 · scoped)
- 独立范围复核 Overall pass
- node test/dish-logic.test.js → EXIT=0 / 25 断言通过
- node test/recipe-steps.test.js → EXIT=0 / 7 断言通过
- V-7 默认「未知」+ 无微信字段可回填（AuthUser 仅 phoneBound）
- V-8 watchdog 递增 seq，成功/失败均校验
- V-9 菜单与资料分段，失败只 warn
- V-10 parse 失败 console.warn
- V-11 wontfix-preexisting
- V-12 cook-mode addCookHistory silent:true
- New findings: none

## Dimensions (round 2)
Completeness: pass
Correctness: pass
Coherence: pass
Reuse: pass
Overall: pass
