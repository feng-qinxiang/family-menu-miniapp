# Knowledge

Durable facts for future changes. One line each.

- api.js `request()` 失败默认 reject；数据页 getter 勿再挂静默 fallback；getCurrentUser 等保留 silent null | evidence: ui-ux-audit DEC-1 | 2026-08-16
- 支付取消匹配 `errMsg` 含 `cancel`（英文）；成功页用 redirectTo 防返回栈重复下单 | evidence: ui-ux-audit | 2026-08-16
- 家庭邀请禁止前端伪造码/伪二维码；失败禁用复制分享 | evidence: ui-ux-audit | 2026-08-16
- recipe-card：variant card|row；density home|grid|default；事件 tap/add/fav；**已关** virtualHost（模拟器空白） | evidence: ui-layout-bugs 订正 | 2026-08-23
- section-head：eyebrow/title/popPart/titleTail/hint/more；ext-class；**已关** virtualHost；全站区块标题权威组件 | evidence: ui-layout-bugs 订正 | 2026-08-23
- 首页错误分层：仅 `loadError && !hasHomeData` 全屏；有数据刷新失败走软顶条 | evidence: ui-layout-bugs / ui-layout-refresh | 2026-08-23
- 微信小程序 MCP：只用官方 `wechat-devtools`（`wechatide mcp`）；已删 `@yfme/weapp-dev-mcp` | evidence: 用户确认官方已授权 / ui-click-display DEC-6 订正 | 2026-08-23
- 菜单「点菜」在 nav-bar 右侧 slot；`goAddRecipe` 是 switchTab 菜谱库，不是 recipe-edit | evidence: ui-click-display retrospect | 2026-08-23
- 登录 `.agree` 整行勾选、框 64rpx；购物 `.mkt-item` 整行 toggle、「移除」catchtap | evidence: ui-click-display | 2026-08-23
- 社区仅 `loading && !posts.length` 出加载文案；「热门话题」只留 `.th-title` | evidence: ui-click-display | 2026-08-23
- 二级页顶栏加按钮学 nav-bar 右侧 slot；失败清列表学 community `loadPosts` catch | evidence: index.md (ui-click-display) E-1/E-2 | 2026-08-23
- theme.json light 暖奶油（paper #fbf8f3 / mut #7a6e5d）对齐 app.wxss fallback；--r-card 代码与规范均为 16rpx | evidence: ui-visual-polish DEC-3 | 2026-08-17
- 功能图标禁止 emoji 字形；评分装饰 ★ 可保留；弹层 mask 须 catchtouchmove 或 state-sheet | evidence: ui-visual-polish | 2026-08-17
- 交付验收：`node test/dish-logic.test.js` EXIT=0；无 CI | evidence: both changes | 2026-08-17
- tab 页 `onShow` 必须 `withTabSelect(this, index)`；`custom-tab-bar` 的 `pageLifetimes.show` 在 switchTab 时常不跑 | evidence: miniapp-full-test R-3 | 2026-08-23
- 封面用 `recipeDishImg`：按菜名落到本地图，unsplash 外链不当封面 | evidence: miniapp-full-test R-4 | 2026-08-23
- 顶栏右侧按钮须避开微信胶囊：`getMenuButtonBoundingClientRect` 算 right；nav-bar slot 已垫 capsulePad | evidence: miniapp-full-test R-4 | 2026-08-23
- section-head 的 eyebrow 不要和 title+popPart 重复同一句话 | evidence: miniapp-full-test R-4 | 2026-08-23
- 「我的」查看全部记录走 `goCookLog`；编辑资料/消息是已有入口，全量测试不要为对齐 git HEAD 撤回 | evidence: miniapp-full-test V-7/V-8 user-override | 2026-08-23
- 种子菜 3/6/7/8 已补 `recipe_step`/`recipe_ingredient`；`INSERT IGNORE` 不改旧库，活库要另插 | evidence: miniapp-full-test R-3 | 2026-08-23
- 家庭邀请码后端生成 8 位；join 输入格 / FAQ / 邀请页必须 8 位，6 格永远对不上 | evidence: miniapp-full-test R-4 | 2026-08-23
- 会员价以后端 PlanCatalog 为准：年卡 9900 分 / 月卡 1990 分；前端勿再写死 ¥68/¥9.9 | evidence: miniapp-full-test R-4 | 2026-08-23
- 浅色底 Hero 用 `title-stroke--ink` 或实心字；`title-stroke` 白字只给照片底，否则标题叠成一团 | evidence: miniapp-full-test R-4 | 2026-08-23
- 照片头高度用 `--photo-hero-h`（720rpx）；360rpx 装不下状态栏+返回+大标题 | evidence: miniapp-full-test R-5 | 2026-08-23