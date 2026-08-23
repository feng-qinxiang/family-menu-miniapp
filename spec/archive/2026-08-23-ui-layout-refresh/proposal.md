# Proposal: ui-layout-refresh

## Why
用户要「看组件库、改 UI 和布局」。调研结论：Vant/TDesign/WeUI 整库会打杂志暖色并吃主包，不如偷下厨房/Linear/Stripe 的**状态与可读性模式**。首页截图证明：失败态主视觉是无限转圈（像加载）、「全部」旁箭头像叉号——这两处直接拉低品质感，且修复落在自有组件内。

## What
- **不引入新 UI 库**（DEC-1）| refs: R-1 | verify: miniapp 无新增 @vant/weapp、tdesign-miniprogram、weui-miniprogram 依赖
- **首页错误态最小修复**（DEC-3 收窄）：只改 `mh-load-error`——去掉无限 spin 主视觉，改为静态几何图示 + 既有标题/说明 + 番茄「重新加载」；**不**本轮接入 state-empty 分叉、不做插画体系 | refs: R-2 | verify: loadError 时无持续旋转主图标；标题/按钮仍在；点重新加载可触发 loadAll
- **loadError 分层展示**（DEC-5 收窄 + RC-1）：**仅当** `loadError && !hasHomeData`（无 hero/菜单/菜谱缓存）时全屏错误并隐藏 slot/wish/sheet；**已有数据后的刷新失败**保留下方结构，错误区顶置或替换 hero 位，避免「软失败把许愿池一并摘掉」 | refs: R-2 | verify: 冷启动失败=全屏错误无餐次；有缓存后再失败仍可见许愿/区块；条件不用 `!loading` 误伤加载中路径（RC-2）
- **section-head 箭头修复**（DEC-4）：只改 `.seeall-arrow` 几何为清晰 chevron（或「全部 ›」字面），保留 `.seeall` + `tapmore` 契约与热区，不拆 hint/箭头双热区（RC-3）| refs: R-2 | verify: 「全部」右侧不再像 ×；home/me 点「全部」仍跳转
- **回归**：`node test/dish-logic.test.js` EXIT=0 | refs: R-1 | verify: EXIT=0

**Not in this change**: 成功路径密度大包（fp/shead 全面收紧、许愿卡色条、chip 未选描边——N1 cut，错误修好后若仍空再开）；Vant/TDesign/WeUI/ColorUI；tab 四入口；全站换肤；state-empty 替换 mh-load-error；server；recipe-card 结构重做。

## How
- home/index.js：增加计算字段或 setData 标记 `hasHomeData`（heroRecipe / visibleRecipes / slotMenu / wishes 任一有值）
- home/index.wxml：错误块保持在 hero 链；全屏藏内容条件为 `loadError && !hasHomeData`；加载中不额外藏 slot/wish
- home/index.wxss：`.mh-load-error*` 去 spin 动画主图标
- section-head/index.wxss：箭头几何；事件/wxml 结构尽量不动
- 零新依赖

## Risk
- hasHomeData 判定过宽/过窄会影响是否全屏错误——以「有可展示列表或 hero」为准，写进 verify
- 箭头全站变：仅视觉；home/me「全部」手测
- 回滚：home 三件套 + section-head wxss

<!-- APPROVED: 2026-08-17 21:50 -->

