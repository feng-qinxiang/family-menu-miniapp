# Index: ui-click-display

Requirement source: 用户消息，2026-08-22

## Requirements
- R-1: "我觉得现在的ui点击很乱" | source: 用户消息 2026-08-22
- R-2: "和ui显示也是一样" | source: 用户消息 2026-08-22
- R-3: "我记得zcode有很多的skills和mcp和规则，你看看能不能同步到cursor" | source: 用户消息 2026-08-22

## Assets
- A-1: pages/home Hero 整卡 `bindtap="goDetail"` + 铃铛/放大镜图标（路由已是购物/菜谱） | use: extend
- A-2: pages/menu `.nav-float` + `.m-hd-add`「点菜」+ `.m-act` 54rpx | use: extend
- A-3: components/nav-bar 右侧 `<slot>` | use: reuse
- A-4: pages/me 无 bindtap 的 `tap-scale`（本月做菜 / 家庭成员 / 最近上桌行） | use: extend
- A-5: pages/community 话题芯片 + 「热门话题」双标题 + loading 与 post-list 并列 | use: extend
- A-6: pages/pantry `loadPantry` 失败不清 `categories`；`state-loading` 无 catchtouchmove | use: extend
- A-7: pages/recipes catch 不清 `displayedRecipes` | use: extend
- A-8: pages/shopping `.mkt-check` 仅圆点可勾；pages/auth/login `.agree .box` 35rpx | use: extend
- A-9: components/recipe-card `addPlacement="float"` | use: extend
- A-10: 用户级 skills 真源 `E:\rjd\skills` + `~\.agents\wire-cursor-skills.ps1` | use: rejected: 已接到 Cursor，不进本仓库
- A-11: Vant/TDesign/WeUI 整库 / 全站抬高 360rpx Hero | use: rejected: 换肤与裁切大包，对「点击乱」不对等

## Exemplars
- E-1: 菜单「点菜」→ nav-bar 右侧 slot（组件已有空 slot；shopping/recipes 顶栏右侧按钮同模式）
- E-2: 失败清列表 → community `loadPosts` catch 已 `posts: []`（冰箱/菜谱仿写）
- E-3: 假热区 → 去 `tap-scale`，不学 showcase 空壳缩放
