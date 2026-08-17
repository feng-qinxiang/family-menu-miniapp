# Proposal: ui-visual-polish

## Why
行为层 critical（错误态/支付/邀请）已在 ui-ux-audit 收口。当前用户再问「UI 怎么优化」时，真正拖累观感与维护的是：同一菜谱卡在 home·recipes·favorites 三套实现、浅色 theme 偏冷白与暖奶油规范打架、me 等页英文 eyebrow 与功能字形图标违反 warm 铁律。不收敛则改卡样式必漏页，深浅色继续失真。

## What
- 菜谱卡统一到 recipe-card：扩展组件以兼容 home 横滑大卡/行卡（label、加菜）与 recipes 网格卡（source badge、selected/picked）；迁移前列 home/recipes 现有 data 字段与 bind 对照表，组件侧别名兼容；home 的 mh-rcard/mh-row、recipes 的 rx-card 改为组件调用，**仅在加菜/详情/选中三路径手测通过后**删除页面重复 WXSS；favorites 保持现用法作视觉锚点 | refs: R-1 | verify: 三页卡片均来自 components/recipe-card；Grep `class="mh-rcard|class="rx-card` 为 0；home 加菜、recipes 点选/加菜、进详情与改前一致
- 区块标题：section-head 推广到**四 tab + menu/shopping**（home/recipes/pantry/me 已部分、补 menu/shopping 及这些页内剩余手写 shead）；其余二级页（vip/import/community…）本轮不扫，避免无故障场景的 14 页仪式迁移 | refs: R-1 | verify: home/recipes/menu/pantry/shopping 业务 shead 块改用 section-head；「更多」/标题点击目标与改前相同（逐页 smoke）；me 英文 eyebrow 中文化并入本项
- 弹层滚动锁（最小护栏）：凡业务手写 mask 且无 catchtouchmove 的弹层，**只补** catchtouchmove（或 noop），不默认迁 state-sheet；state-loading 不推广 | refs: R-1 | verify: Grep 含 mask/backdrop 的业务弹层均有 catchtouchmove 或使用已带锁的 state-sheet/state-dialog；打开弹层后背景不可滚动
- 浅色 theme 暖色回正 + 规范订正：theme.json light 的 paper/paper2/ink/mut/line 与 app.wxss fallback（#fbf8f3 / #7a6e5d 系）对齐；docs/UI设计规范.md 将 --r-card 订正为 16rpx，删除过时 42rpx 卡片圆角描述；改后对仍硬编码 #fff 的局部做浅色截图对照，色差块改 token 或记入已知差异 | refs: R-1 | verify: light.themePaper 与 app fallback 一致；规范 md 无「42rpx」作卡片圆角；浅色模式主 tab 底为暖奶油
- 文案与铁律快修：me section-head 英文 eyebrow 中文化；join/help-faq/vip-upgrade/preference-profile 可见英文 eyebrow 中文化；功能触点字形（me 绑手机 ☏、VIP 入口 ★、收藏按钮心形）改 CSS 或中文单字；评分装饰星可保留 | refs: R-1 | verify: Grep 无 Recently Cooked|Kitchen Tools|Got an invite code|Need a hand；me 绑手机入口无 ☏；`node test/dish-logic.test.js` EXIT=0

**Not in this change**: 全库 510 处字号机械 token 化；section-head 扫完全部二级页；大字模式扩全站；state-sheet 默认替换手写弹层；state-loading 强制替换骨架；state-imgview；GSAP/视差；share-card 页；showcase 删除；tab 重构；server/忌口；行为层 api/支付/邀请（ui-ux-audit 已完成）。

## How
- recipe-card：先写字段/事件对照表 → 扩 props/别名 → 先接 home 或 recipes 一侧验证 → 再接另一侧 → 三路径手测过后再删旧 WXSS（面板 N2/RC-1）
- section-head：只动主路径页；替换时只换标记不改跳转 handler；me 中文化与替换同 commit（面板 N1/RC-2）
- 弹层：优先一行 catchtouchmove，禁止借机重构为 state-sheet（面板 N3）
- theme 只改 light 键值；规范 md 只订正与代码冲突句；零新依赖；不改 app.json tabBar

## Risk
- 波及面：home/recipes 卡片事件绑错伤主路径——对照表 + 手测门禁未过不删旧样式
- 触发场景：theme 暖化后硬编码 #fff 局部可能断层（RC-3）——截图对照；section-head 间距可能 2–4rpx 差，以组件为准
- 回滚：theme.json 单文件；迁移按页 revert；规范 md 独立

<!-- APPROVED: 2026-08-17 13:05 -->