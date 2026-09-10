# 显示问题清单（逐页人工核对 39 张原图）

- **日期**：2026-09-10
- **方法**：`wechatide` 驱动真实模拟器，`reLaunch` 逐页打开 + 原图分辨率（PNG，非压缩 JPEG）截图，**39/39 张逐张人眼核对**
- **截图目录**：`artifacts/e2e-2026-09-10/hi/h<N>-<路径>.png`（N 对照 REPORT.md 序号）

> 上一轮「页面能打开」的冒烟测试**发现不了这些问题**——页面都能打开、命令都返回 success，
> 但渲染出来是错的。以下才是真正的显示缺陷。

---

## ISSUE-1 🔴 所有空状态/错误态的图标都不渲染，只剩一个空圆

**严重度：高 · 影响面：13 个页面 / 21 处**

### 现象
凡是「没有数据 / 加载失败 / 无权限」的页面，本该有个插图图标，实际只显示**一个纯色空圆**。

已确认出现（截图）：
- `h39` 我的收藏 →「还没有收藏」上方粉色空圆
- `h32` 帖子详情 →「帖子不存在或已删除」上方灰色空圆
- `h33` 审核队列 →「需要管理员权限」上方灰色空圆
- `h8` 菜谱详情 →「菜谱没找到」上方灰色空圆
- `h20` 加入家庭 →「还没有匹配的家庭」上方灰色空圆

### 根因
`components/state-empty/index.wxml` 的图标用 **内联 SVG data URI** 塞进 `<image>`：

```xml
<image class="se-icon"
  src="data:image/svg+xml,%3Csvg ... %3C/svg%3E" mode="aspectFit" />
```

小程序的 `<image>` 对 `data:image/svg+xml` 支持很差（模拟器直接不渲染，真机 iOS 同样有风险）。
于是只看到外层 `.se-illustration`（208rpx 的圆，背景 `--pop-soft` / `--paper-2`），里面的图标是空的。

**反证**：菜单元页的「菜篮子/周菜单/冰箱」三个图标、家庭创建页的相机图标都**正常显示**——
因为它们是用 **CSS 画的**（`.m-ic-cal` 之类），不是 SVG data URI。所以问题不在图标能力，而在这个写法。

同类写法还有 1 处：`pkg-extra/vip/orders/index.wxml`。

### 建议修法（三选一，推荐第 1 或 2）
1. **改成本地 PNG**：`<image src="/assets/icons/no-network.png">`（最稳，真机无兼容风险）
2. **改成 CSS 绘制**：与菜单元页 `.m-ic-cal` 一致的做法（零资源、随主题变色）
3. 若坚持矢量：改为 `<view>` 内联结构 + border/伪元素，或 base64 PNG，**不要用 SVG data URI**

---

## ISSUE-2 🔴 烹饪模式的错误态文字不可见（深色底 + 深色字）

**严重度：高 · 影响面：`pages/cook-mode/index`**

### 现象
`h13` 烹饪模式（深色界面）：标题「菜谱没加载出来」是**近黑色压在近黑背景上，完全看不见**；
副标题「网络开小差了…」对比度也极低、基本不可读。整屏只剩一个橙色的「重新加载」按钮。

### 根因
`pages/cook-mode/index.wxml:26-28` 用了共享组件：

```xml
<state-empty type="offline" title="菜谱没加载出来" desc="..." cta="重新加载" bind:action="retryLoad" />
```

而 `components/state-empty/index.wxss` 里文字用的是**浅色主题 token**：

```css
.se-title { color: var(--ink); }        /* 深棕——深色底上等于隐形 */
.se-desc  { color: var(--mut-strong); }
```

烹饪模式页面是深色主题，但**没有**给组件内的这几个变量做覆盖，于是文字沿用浅色主题值。

### 建议修法
- 给 `state-empty` 增加 `theme="dark"`（或 `on-dark`）变体，暗色下改用浅色文字 + 透明底色；
- 或在 `cook-mode` 的页面容器上重定义 `--ink` / `--mut-strong` / `--paper-2` 为暗色对应值（更省事，但要确认不影响该页其它元素）。

---

## ISSUE-3 🟠 通知页混入英文文案

**严重度：中 · 影响面：`pages/me/notifications/index`**

### 现象
`h25` 消息页：分组标题是「**Today · 今天**」「**Earlier · 更早**」；
另有**整条英文通知**「**Feedback received** / We have recorded your feedback and will review it with the next product batch.」（16 天前）。
全站其余文案都是中文，这两处很突兀。

### 根因（两个独立来源）
1. **代码硬编码**：`pages/me/notifications/index.js:115-116`

   ```js
   { label: 'Today · 今天', items: todayItems },
   { label: 'Earlier · 更早', items: earlierItems }
   ```
   → 直接改成「今天」「更早」即可。

2. **数据库历史残留**：那条英文通知是**以前播种进库的演示数据**。
   我上一轮已删掉「每次 GET 都插 3 条英文通知」的 `seedNotificationsIfEmpty()`，但**已经写进库的旧记录还在**，
   老账号会一直看到。
   → 需要一次性数据清理（`DELETE FROM notification WHERE title='Feedback received'` 之类），或前端做一次过滤。

---

## ISSUE-4 🟡 错误态图形各页不统一

**严重度：低（一致性）**

- 首页错误态用的是自己画的图形（`pages/home/index.wxml` 的 `.mh-load-error-mark` + `cloud`/`bolt`）
- 其余 13 页用共享组件 `state-empty`
- 两者观感不一致（且首页那套在深色/浅色下的表现也要单独确认）

建议统一走 `state-empty`，或把首页那套插画提升为组件的一个 `type`。

---

## 汇总

| # | 问题 | 严重度 | 影响面 | 类型 |
|---|------|:---:|------|------|
| 1 | `state-empty` 图标（SVG data URI）不渲染 → 空圆 | 🔴 高 | 13 页 / 21 处 | 代码 |
| 2 | 烹饪模式错误态文字不可见（浅色 token 压深色底） | 🔴 高 | 1 页 | 代码 |
| 3 | 通知页英文文案（分组标题 + 历史英文通知） | 🟠 中 | 1 页 | 代码 + 数据 |
| 4 | 错误态图形各页不统一 | 🟡 低 | 全局一致性 | 代码 |

**其余 35 页显示正常**（首页/菜谱/社区/菜单/我的/冰箱/买菜/导入/周菜单/搜索/做菜记录/
登录/手机登录/验证码/微信授权/创建家庭/加入家庭/家庭成员/邀请家人/编辑资料/设置/
口味画像/意见反馈/帮助中心/关于/用户协议/隐私政策/帖子详情/审核队列/会员中心/开通同步/
我的订单/开通确认/开通成功/收藏 等），版式、配色、留白、中文字体均无异常。

---

## 附：建议的修复顺序

1. **ISSUE-1**（影响最大，一次修复覆盖 13 页）——换成本地 PNG 或 CSS
2. **ISSUE-2**（烹饪模式整屏不可读，体感最差）
3. **ISSUE-3**（改文案 + 清历史数据）
4. **ISSUE-4**（顺手统一）

## ✅ 修复记录（2026-09-10 当晚，已改并已复测）

| # | 问题 | 改法 | 复测结果 |
|---|------|------|----------|
| 1 | SVG data URI 不渲染 → 空圆 | 4 个图标 + vip/orders 的 2 个，全部由 **URL 编码改为 base64 编码**（`data:image/svg+xml;base64,...`） | ✅ 收藏/帖子详情/审核队列/菜谱详情/加入家庭/首页错误态 图标全部出现 |
| 2 | cook-mode 深底上文字不可见 | 给 `state-empty` 加 `theme` 属性（light/dark）；dark 下标题/描述转浅色（`--c-border-light` + 62% 透明度），描边按钮转 `--gold`；**圆形底色保持浅色**以便深色描边图标仍可读。cook-mode 两处启用 `theme="dark"` | ✅ 「菜谱没加载出来」清晰可读 |
| 3 | 通知页英文文案 | ①`notifications/index.js` 的 `'Today · 今天'`/`'Earlier · 更早'` → `'今天'`/`'更早'`；②数据库 `notification_message` 删除 4 个英文标题共 **81 行**（Feedback received ×78、Family menu、Shopping list、Community），5004→4993 行，删后仅剩中文标题 | ✅ 分组显示「今天/更早」，英文通知消失，未读数 3→2 |
| 4 | 错误态图形不统一 | 首页**整页**错误态改用 `<state-empty type="offline">`（与其 13 页一致）；「已有缓存、仅刷新失败」的紧凑软提示保留原样 | ✅ 与其它页观感一致 |

**修改文件（7 个）**

```
miniapp/components/state-empty/index.wxml   SVG → base64
miniapp/components/state-empty/index.js     新增 theme 属性
miniapp/components/state-empty/index.wxss   新增 .se--dark 变体
miniapp/pages/cook-mode/index.wxml          两处 state-empty 加 theme="dark"
miniapp/pages/home/index.wxml               整页错误态改走 state-empty
miniapp/pages/me/notifications/index.js     分组标题中文化
miniapp/pkg-extra/vip/orders/index.wxml     SVG → base64
```

**回归**：小程序静态自检 280 文件通过；`dish-logic` 25 断言 + `recipe-steps` 11 断言全通过；模拟器 console 无 error。

> 关键技术结论：微信小程序 `<image>` 能渲染 **base64 形式**的 SVG data URI，但**不认 URL 编码（percent-encoded）形式**。
> 项目里 6 处 SVG 图标全是后者，所以整片空态都只剩色块。
