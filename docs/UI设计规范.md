# 家庭点菜小程序 · UI 设计规范

> 版本：v1.0 ｜ 日期：2026-08-06 ｜ 适用范围：`miniapp/` 全部页面与组件
> 配套文档：[UI 优化计划书](./UI优化计划书.md)（执行状态与验收标准）、[DESIGN.md](../DESIGN.md)（产品决策）

---

## 一、设计语言

**精致美食杂志 + 大胆撞色**（warm 定稿，标杆 `artifacts/home-final-warm.html`）：

- 奶油纸底 `#fbf8f3`、深墨文字 `#2c241b`、番茄红点睛 `#e8472a`（全站占比约 4%）、金 `#b08949`、墨绿 `#2f4a3a`
- 深色大图 Hero + 暖光叠层 + 底部渐变；镂空白描边标题（`title-stroke`，Android 用 text-shadow 兜底）
- 卡片白底大圆角（`--r-card: 42rpx`）+ 双层暖阴影（`--sh-card`）
- 头像一律「文字 + 品牌色」，禁止用菜图/占位图当头像
- 底部导航固定 4 tab：今日 / 菜谱 / 冰箱 / 我的；二级页用 `nav-bar` 返回

## 二、颜色 Token（app.wxss 权威定义）

| Token | 浅色值 | 深色值 | 用途 |
|-------|--------|--------|------|
| `--paper` | #fbf8f3 | #1b1713 | 页面底色 |
| `--paper-2` | #f0ebe2 | #26201a | 次级底色/输入底 |
| `--ink` | #2c241b | #efe8dc | 主文字 |
| `--ink-deep` | #3a2e23 | #e0d5c4 | 深墨文字/暗卡底 |
| `--mut` | #7a6e5d | #b5a896 | 次要文字（≥AA 4.5:1） |
| `--mut-2` | #b3a795 | #8a7f6e | 弱提示（仅装饰） |
| `--mut-strong` | #6b5f50 | #6b5f50 | 强调次要文字 |
| `--pop` | #e8472a | #ff6a4d | 主色/CTA/点睛 |
| `--pop-soft` | #fdece6 | #3a2218 | 主色浅底 |
| `--gold` / `--gold-deep` | #f4d9a8 / #b08949 | #8a6a3a / #c9a35c | eyebrow/徽章 |
| `--pine` | #2f4a3a | #4e6b58 | 墨绿点缀 |
| `--surface` | #ffffff | #241e18 | 卡片/输入框底 |
| `--line` / `--line-deep` | #e8e0d0 / #d5c9b8 | #3a3228 / #4a4034 | 分隔线/描边 |
| `--skeleton` | #efe4d7 | #2c251e | 骨架屏 |
| `--cook-bg` | #1a1410 | #0f0c0a | 烹饪模式沉浸底 |

- 深色模式由 `theme.json`（`darkmode: true` + `themeLocation`）自动注入，页面无需感知主题
- **铁律**：页面 WXSS 禁止新增十六进制色值；必须用 token。特殊场景（遮罩 mask、root-portal 变量副本）允许并在注释中说明

## 三、字号标尺

| Token | 值 | 用途 |
|-------|-----|------|
| `--fs-hero-xl` | 112rpx | 照片 hero 主标题 |
| `--fs-hero-lg` | 88rpx | 次 hero 标题 |
| `--fs-hero-sm` | 66rpx | 小 hero/合规页标题 |
| `--fs-h1` | 50rpx | 页面主标题（.page-title/.shead-title） |
| `--fs-h2` | 36rpx | 区块标题 |
| `--fs-lg` | 32rpx | 卡片名/强调正文/图标字符 |
| `--fs-body` | 28rpx | 正文基准 |
| `--fs-btn` | 29rpx | 按钮文字 |
| `--fs-sub` | 25rpx | 次要说明 |
| `--fs-cap` | 23rpx | 辅助/标签 |
| `--fs-mini` | 21rpx | 角标/统计 |
| `--fs-tiny` | 19rpx | 极弱提示（尽量不用） |

- 禁止使用标尺外的字号（历史遗留的 22/24/26rpx 只允许出现在全局类 `.tag/.section-desc/.chip` 中）
- hero 标题三档按页面类型选择，不按心情

## 四、规格基线

| 项 | 值 |
|----|-----|
| 照片 hero 高度 | `--hero-h: 862rpx`（小 hero `--hero-h-sm: 620rpx`） |
| 返回键 | 统一 `nav-bar` 组件或 88rpx 圆形浮钮 |
| 按钮 | 最小高度 88rpx，圆角 `--r-card`，字号 `--fs-btn` |
| 触达目标 | 可点元素 ≥ 88rpx；图片角标类删除钮 ≥ 56rpx |
| 弹窗 | 底部弹层用 `state-sheet`（自带滚动锁），确认弹窗用 `state-dialog` |
| 空态 | 一律 `state-empty`（type: pop/gold/gray/search/offline） |

## 五、组件用法

| 场景 | 组件 | 说明 |
|------|------|------|
| 二级页顶部 | `nav-bar` | 传 `statusBarHeight`；tab 页传 `show-back="{{false}}"` |
| 底部弹层 | `state-sheet` | `visible/title/bind:close`，插槽放内容，内置滚动锁 |
| 全屏加载 | `state-loading` | `visible/text` |
| 确认弹窗 | `state-dialog` | variant: normal/warn/danger |
| 轻提示 | `state-toast` | type: top/center |
| 空态 | `state-empty` | `type/title/desc/cta/bind:action`，支持插槽 |
| 菜谱卡 | `recipe-card` | variant: card/row；数据兼容 `coverImage/cover/dishImg` |
| 区块标题 | `section-head` | `eyebrow/title/popPart/titleTail/hint/more` |
| 广告位 | `ad-banner` | VIP 自动隐藏 |

## 六、动效规则

| 场景 | 用法 |
|------|------|
| 页面入场 | 根区块挂 `g-fade-up` + `g-d1..g-d8` 阶梯延迟 |
| 点按反馈 | `tap-scale`（按压 0.08s 快压 + 松手弹性回弹，全局已实现） |
| 骨架屏 | `.skeleton` 底 + `.shimmer` 扫光 |
| 数字变化 | 统计数字用 count-up（600ms cubic-out，参考 me 页实现） |
| 弹层 | `state-sheet` 自带 g-fade-up 滑入 |

- 微信小程序无 GSAP；设计稿中的滚动浮现/视差如需落地，用 `IntersectionObserver`（列表渲染完成后创建，onUnload disconnect）

## 七、Do & Don't

**Do**
- 新页面结构：`nav-bar`（二级页）→ hero（照片 hero 用 862rpx）→ 内容 sheet → `safe-bottom`
- 数据页三态齐全：loading（骨架）→ 成功（列表/空态）→ 失败（offline 空态 + 重试）
- 所有列表请求用 `loadError` 字段区分「失败」与「空数据」，失败绝不显示空态文案
- 弹窗打开时 mask 必须 `catchtouchmove` 锁滚动
- 中文文案为主；品牌名 VIP/FAMILY MENU 可保留英文

**Don't**
- 不在页面写死 hex 色值、标尺外字号、`px` 单位
- 不用字形符号（☎⛨✉✈♪★）当功能图标——用 CSS 图标或中文单字（参考 me 页 `mag-ticon`）
- 不用菜图当头像/家庭标识
- 不静默吞失败：至少 toast + 错误态 + 重试入口
- 不在 `data` 里放 Map/Set 等非纯数据对象

## 八、新页面模板

```json
// pages/xxx/index.json
{
  "navigationStyle": "custom",
  "usingComponents": {
    "nav-bar": "/components/nav-bar/index",
    "state-empty": "/components/state-empty/index",
    "state-sheet": "/components/state-sheet/index"
  }
}
```

```xml
<view class="container {{fontScale === 'lg' ? 'font-lg' : ''}}">
  <view class="nav-float"><nav-bar title="" status-bar-height="{{statusBarHeight}}" /></view>
  <view class="hero g-fade-up"><!-- 862rpx 照片 hero --></view>
  <view class="sheet g-fade-up g-d1"><!-- 内容，loading/loadError/空态三态 --></view>
  <view class="safe-bottom"></view>
</view>
```

```js
// pages/xxx/index.js 必备片段
onLoad() {
  let fontScale = 'normal';
  try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) {}
  this.setData({ fontScale });
  this.loadData();
}
loadData() {
  this.setData({ loading: true, loadError: false });
  // ... 成功后 loading: false；失败后 loadError: true（不显示空态）
}
retryLoad() { this.setData({ loading: true, loadError: false }); this.loadData(); }
```

## 九、回归流程

1. 微信开发者工具打开 `miniapp/`，编译无警告
2. 截图基线：`smoke-all/` 目录（43 页全覆盖目标），UI 改动前后逐页对比
3. 自动化冒烟：`probe-mcp.mjs`（MCP 浏览器自动化，需开发者工具联动），覆盖 4 tab 切换、menu/pantry 跳转、忌口编辑、失败重试路径
4. 深浅色：模拟器切换系统主题，重点检查 5 主页面 + recipe-detail + cook-mode
5. 大字模式：设置 → 字体大小 → 大，抽查 6 主页面无溢出