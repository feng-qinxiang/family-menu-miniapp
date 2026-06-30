# 暖化改造规范（家庭版设计册 v-warm）

目标：把每个原版 `<name>.html` 移植为 `<name>-warm.html`，统一成"家庭温度 + 今日菜单为核心"的暖化风格。
**铁律：绝不修改任何原版文件。只新建 `-warm.html`。绝不凭空重写——先 `cp 原版 → -warm`，再做最小定向修改。**

## 一、绝对禁止（AI 味来源，违反即作废）
- ❌ 任何 emoji（🍽️🎡✨🔥 等）→ 一律用描边 SVG 或纯文本
- ❌ 任何 `linear-gradient` 做的小圆头像/按钮 → 用扁平纯色
- ❌ 糖果色/马卡龙色（#9be0ab 薄荷、#ffd54a 亮黄、紫粉等）
- ❌ 新引入任何不在下方调色板里的颜色

## 二、锁死的调色板（只能用这些）
```
--paper:#fbf8f3; --paper-2:#f0ebe2;
--ink:#2c241b; --ink-deep:#3a2e23;
--mut:#9a8e7d; --mut-2:#b3a795; --mut-strong:#7a6e5d;
--gold:#f4d9a8; --gold-deep:#b08949;
--pop:#e8472a;          /* 番茄红，唯一撞色 */
--pop-soft:#fdece6;
--pine:#2f4a3a;         /* 墨绿锚点 */
--sage:#7e9a6b; --sage-on-dark:#bcd0a6;  /* "够/足"状态色，由墨绿提亮，非糖果薄荷 */
--serif:"Georgia","Times New Roman",serif;  /* eyebrow 专用 */
```
- 绿色只在"食材够/足量"等正向状态用 `--sage`（浅底 `rgba(126,154,107,.22)`）；深色卡上用 `--sage-on-dark`
- 强调数字/金边用 `--gold`/`--gold-deep`，不用亮黄

## 三、必做的三项改造
### 1. 英文 eyebrow → 中文（杂志斜体保留）
eyebrow 仍用 `font-family:var(--serif); font-style:italic`（贵气来源），但**文字改中文**：
- "Recipe Library" → "家里能点的菜" ；"Ready to Order" → "今天点啥"
- "Tonight's Pick" → "今天这一桌" ；"Today's Menu" → "今天这一桌"
- "Family Favorites" → "家的味道" ；"Quick Tonight" → "今晚再来两道"
- 其它页同理：把英文小标题译成口语化中文，**保留 serif 斜体样式**
- hero 的超大英文水印（hero-bignum / 镂空标题）可保留中文字或单字（如"全""菜"），不用英文

### 2. 底部 tab 栏 → 统一四 tab（今日/菜谱/冰箱/我的）
**所有带 tabbar 的页面，tab 栏整段替换为以下 verbatim（把当前页对应的 tab 加 `on` 类）：**
```html
<div class="tabbar">
  <div class="tab"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.5L12 4l8 6.5"/><path d="M6 9.5V20h12V9.5"/></svg>今日</div>
  <div class="tab"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 4h11a2 2 0 012 2v14l-7-3-6 3V4z"/></svg>菜谱</div>
  <div class="tab"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3" width="14" height="18" rx="2.5"/><path d="M5 11h14"/><path d="M9 6.5v1.5M9 14v1.5"/></svg>冰箱</div>
  <div class="tab"><svg width="23" height="23" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.6"/><path d="M5 20c0-3.6 3.1-6 7-6s7 2.4 7 6"/></svg>我的</div>
</div>
```
- 首页/今日餐桌类 → 第1个 tab 加 `on`
- 菜谱/菜谱详情/新建菜谱/导入/搜索 → 第2个 tab 加 `on`
- 冰箱库存/买菜清单/本周菜单 → 第3个 tab 加 `on`
- 我的/设置/收藏/订单/成员 → 第4个 tab 加 `on`
- 登录注册/支付/弹窗/闪屏等无 tab 的页面 → 不动 tab（本来就没有）

### 3. 加家庭温度（措辞，不改结构）
在文案层面把"用户/我"改成家庭口吻，凡是合适的地方点出**谁点的/谁做的/全家**：
- "今晚想吃点啥" → "今晚这一家子吃点啥"
- 菜卡副信息可点出"妈妈点的""奶奶爱吃""爸爸做过 6 次"
- 不强行加，原本就有家人信息的地方强化即可

## 四、不动的东西（保持原样）
- `.phone` `.status` `.notch` `.scroll` 外壳尺寸与样式
- 真实菜图路径 `img/xxx.jpg`（已有 16 张，沿用，别造新文件名）
- 所有手绘 SVG 图标（描边风格）—— 这正是要保留的好东西
- 卡片圆角、阴影、间距体系

## 五、状态栏 verbatim（深色页用白色 fill，浅色页用 #2c241b fill）
浅底页面状态栏用深色：把 `fill="#fff"`/`stroke="#fff"` 改 `#2c241b`。深底 hero 页面保留白色。

## 六、自检（交付前）
1. 全文搜一遍有没有 emoji / `linear-gradient(` 做头像 / `#9be0ab`/`#ffd54a` → 有就删
2. tab 栏是不是"今日/菜谱/冰箱/我的"四个、且当前页高亮
3. eyebrow 是不是中文 + serif 斜体
4. 颜色有没有越出调色板
5. 原版文件没被改动

参考金样板：`home-final-warm.html`（已定稿）、`recipes-warm.html`（金样板）。
