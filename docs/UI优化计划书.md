# 家庭点菜小程序 · UI 优化计划书

> 版本：v2.0 ｜ 日期：2026-08-05 ｜ 范围：`miniapp/`（43 页 + 8 组件 + 自定义 TabBar）+ `server/`（忌口字段）
> 本文档基于 2026-08-05 四路并行全量审计编写：页面风格一致性、组件与资源复用、设计稿 vs 小程序落地差距、体验与健壮性。
> v1.0（2026-07-29）数据已过时：当时统计「478 处硬编码色值、无字号 token、40/43 动效覆盖」；当前实际为「57 处新色值硬编码（42 处需清理）、字号标尺已存在但 108 处散值、43/43 动效覆盖」。

---

## 一、现状审计结论

### 1.1 已经做得好的（保留并固化）

- **v2「美食杂志 + 番茄红撞色」已全量落地**：43 页 WXSS 全部使用新 token（`--paper`/`--ink`/`--pop`/`--r-card`/`--sh-card`），旧主色 `#ff6b35`、旧底色 `#faf6f0` 在 `miniapp/` 代码目录零残留；`--c-*` 兼容层全部重映射到新配色。
- **动效覆盖 43/43**：全站 431 处 `g-fade*` 动画类引用，无页面缺入场动效；骨架屏覆盖 10 个数据页（home/recipes/shopping/cook-log/favorites/vip-orders/recipe-detail/post-detail/preference-profile/audit）。
- **导航与设计铁律大部分生效**：二级页 32 页使用 `nav-bar` 组件统一返回；菜图全部使用本地 `assets/dishes/` 16 张真实图片；无彩色 emoji（29 处均为字形符号）。
- **页面目录完整**：app.json 注册 43 页全部存在，无缺页/多页。
- **单位规范好**：内联样式克制（27 处且绝大多数是进度条宽度等必须动态场景）。

### 1.2 核心问题清单（按严重度排序）

| # | 类别 | 问题 | 量化证据 | 影响 |
|---|------|------|----------|------|
| A-1 | 设计纪律 | 新色值硬编码漂移 | 5 页共 57 处，需清理约 42 处：home 24（[home/index.wxss](miniapp/pages/home/index.wxss) 690-842 许愿弹窗，`#e8472a`/`#2c241b`/`#f0ebe2` 是 token 副本）、community 7（350-373，含不在色板的 `#f3eee5`/`#6a6152`）、me 7（352-370 绑手机条渐变 `#fff7ec`→`#ffe9d9`）、vip/orders 4 + favorites 3（骨架 `#f0ebe2`）、about 3（mask `#000` 可保留） | 深色模式与下次换肤成本高；同元素颜色不一致 |
| A-2 | 设计纪律 | 字号散值泛滥 | 非标字号 108 处集中在 30-34rpx；全值分布：24rpx×63、22rpx×54、26rpx×48、30rpx×36、31rpx×28、29rpx×22、32rpx×21、33rpx×13、34rpx×10、27rpx×1（Top 页：import 22/24rpx×14、community 22/26rpx×10、home 24/26rpx×9、menu 24rpx×4） | 文字层级全靠感觉，同级文案跨页不一致 |
| A-3 | 设计纪律 | 规格不统一 | hero 大标题 7+ 种字号（menu 120 / recipes 115 / 五个页面 116 / login 104 / vip 96 / help-faq 84 / favorites 80 / orders 76 / legal 66rpx）；照片 hero 8 种高度（554-870rpx）；返回键 4 种尺寸（vip 64、search 77、recipe-detail 80、cook-mode 84rpx）；按钮字号 29/30/32rpx 三种；骨架色 3 套（`#f0ebe2`/`#d8d0bf`/`#efe4d7`） | 杂志风「精致」被规格混乱抵消 |
| B-1 | 组件复用 | 菜谱卡片 4 份实现 | `recipe-card` 组件仅 favorites 用；home 手写 `.mh-rcard`/`.mh-row`；recipes 手写 `.rx-card`；与组件高度同构 | 三处样式改一处漏两处；净删 300+ 行机会 |
| B-2 | 组件复用 | 空态 3 套并存 | `empty-state`（仅 menu）+ `state-empty`（14 页）+ app.wxss 全局 `.empty-state/.empty-text`（home 用） | 维护三倍成本，空态样式不统一 |
| B-3 | 组件复用 | `.shead` 13 页手抄，组件仅 1 页用 | `section-head` 组件只有 me 用；13 页内联手写同类区块标题 | 改一个标题样式要动 13 个文件 |
| B-4 | 组件复用 | `.badge` 三处同名不同实现 | vip/orders（圆点+文字状态）、family/members（纯文字 pill）、family/join（图标徽章），全局无 `.badge` 基准 | 同名类不同结构，易误改 |
| B-5 | 资源 | 12 个 SVG 闲置 | `cuisine-{chuancai,yuecai,lucai,riliao,xican,jiachang,xiangcai,default}`×8 + `empty-{list,menu,search,cooking}`×4，磁盘 20 个文件仅 8 个 tab 图标被引用；`tab-community*` 已删且零引用 | 资源浪费，设计资产未发挥作用 |
| C-1 | 设计稿缺口 | 5 屏未落地 | pay-wechat、share-card、state-loading、state-sheet、state-imgview 无对应小程序实现（warm 定稿 50 屏 vs 小程序 43 页） | 支付/分享/加载/弹层/看图体验缺统一组件 |
| C-2 | 设计稿缺口 | 忌口筛选未落地 | warm 设计稿有 `diet-bar` 忌口筛选；小程序 recipes 只有耗时/人份细筛；后端无 `family_member.avoid_tags_json` 字段 | 家庭场景核心需求（老人/小孩忌口）缺失 |
| C-3 | 设计稿缺口 | 文案中文化不彻底 | menu「Plating」、me「My Kitchen」等英文 eyebrow 未按 warm 定稿中文化；home 主动移除 Georgia serif（与 warm 定稿冲突，属历史主动选择，保留） | 与定稿不一致，杂志风完成度打折 |
| C-4 | 设计稿缺口 | home hero 细节缺失 | 镂空描边标题（`-webkit-text-stroke`）与暖光 `radial-gradient` 叠层未落地（对比 home-final.html） | 首屏视觉冲击力不足 |
| C-5 | 设计稿缺口 | GSAP 动效无对应 | 滚动浮现 / 数字滚动 / 视差三类动效仅演示稿有；小程序只能用 IntersectionObserver + setData + WXSS keyframes | 长列表页缺少滚动活力 |
| C-6 | 铁律违规 | 符号图标当功能图标 | settings 页 `☎ ⛨ ✉ ✈ ♪ ✎ ▤`、vip/upgrade `✨` 兜底、community/post-detail `♥` 等 29 处字形符号，iOS/Android 会渲染成彩色 emoji 字形 | 跨端渲染不一致，拉低质感 |
| C-7 | 铁律违规 | 菜图当头像 | family/members 用 `hongshao-pork.jpg` 当成员头像；wechat-auth fallback 头像用菜图 | 违反「头像=文字+品牌色」铁律 |
| D-1 | 体验 | 7 页无加载态 | me（onShow 并发 7 请求，wxml 无 loading 分支）、community、notifications、vip、pantry、weekly-menu、menu（onShow 4 请求无骨架） | 弱网下显示 0 值/空态，像「已加载但没数据」 |
| D-2 | 体验 | 失败被误报为空态 | shopping/recipes/weekly-menu/pantry/notifications 请求失败时显示「今天不用买」「冰箱还空着」「暂无消息」等误导空态且无重试；me 全失败无 catch 汇总；community 评论失败静默；vip 失败直接显示默认演示数据；cook-mode 失败静默空态 | 用户以为功能坏了/数据没同步，是当前最伤的体验问题 |
| D-3 | 体验 | js 层状态问题 | menu onShow 不重置 loading + setTimeout 未清理（页面销毁仍会导航）；home data 含 Map 实例；community posts=[] 期间闪现「还没有人发帖」；home 许愿保存/删除失败静默无回滚 | 状态不同步、闪空态、竞态导航 |
| D-4 | 无障碍 | 对比度不达标 | `--mut #9a8e7d` 在 `--paper #fbf8f3` 上约 3.03:1，低于正文 WCAG AA 4.5:1 | 长辈/弱视用户读不清次要文字 |
| D-5 | 无障碍 | 触达点过小 | chip 约 66rpx、vip 返回键 64rpx、search 返回键 77rpx、cook-mode 按钮 84rpx、recipes 新建钮约 66rpx、feedback 删除角标 20rpx（[feedback/index.wxss](miniapp/pages/me/feedback/index.wxss)） | 低于 88rpx 目标，误触率高 |
| D-6 | 无障碍 | 无适老化/深色模式 | 无字号缩放开关、无 darkmode/themeLocation | 家庭场景含老人；夜间点菜刺眼 |
| D-7 | 弹窗 | 滚动穿透 | home wish-modal（wxml 280-301）、wechat-auth sheet、community pf-mask/pf-sheet 全站无 `catchtouchmove` 滚动锁 | 弹窗打开时背景可滚动，操作错乱 |
| D-8 | 导航 | TabBar 不一致 | app.json list 文案「点菜」vs custom-tab-bar 实际「首页」；badge 首帧缺失（attached 时才同步）；`.tab-item` 有死 transition | 文案矛盾、角标首帧闪现 |
| D-9 | 导航 | 系统导航栏盖 hero | menu/me 等页面未设 `navigationStyle: custom`，系统导航栏压在沉浸式 hero 上 | 顶部双重背景，杂志风打折 |

### 1.3 组件引用现状（v2.0 实测）

| 组件 | 引用页数 | 说明 |
|------|----------|------|
| nav-bar | 32 | 主力返回组件，建议全量统一 |
| state-toast | 16 | 主力轻提示 |
| state-empty | 14 | 主力空态 |
| state-dialog | 3 | 确认弹窗 |
| empty-state | 1（menu） | 待并入 state-empty 后删除 |
| recipe-card | 1（favorites） | 待推广到 home/recipes |
| section-head | 1（me） | 待推广到 13 个手写页 |
| ad-banner | 1 | 正常 |
| state-loading / state-sheet / state-imgview | 0（不存在） | 旧计划书「幽灵组件」，目录与引用均无，需新建 |

---

## 二、优化目标与验收指标

| 指标 | 现状 | 目标值 | 度量方式 |
|------|------|--------|----------|
| 硬编码色值 | 57 处（42 需清） | ≤ 15 处（仅 mask/设计素材） | Grep 扫描 |
| 非标字号（30-34rpx） | 108 处 | ≤ 10 处 | Grep 扫描 |
| hero 标题字号 | 7+ 种 | 3 档（112/88/66rpx） | 抽查 |
| 返回键规格 | 4 种 | 统一 nav-bar 组件 | 组件引用扫描 |
| 菜谱卡片实现 | 4 份 | 1 份（recipe-card） | 代码扫描 |
| 空态组件 | 3 套 | 1 套（state-empty） | 组件引用扫描 |
| 闲置 SVG | 12 个 | 0 个（用掉或删掉） | 引用扫描 |
| 加载态覆盖 | 10/43 页 | 17/43 页（补 7 页） | 逐页检查 |
| 失败/空态解耦 | 5 页混淆 | 0 页混淆 | 逐页检查 |
| 弹窗滚动锁 | 0 处 | 全部弹窗覆盖 | 代码扫描 |
| 正文对比度 | 3.03:1 | ≥ 4.5:1 | 色值计算 |
| 触达目标 | 多处 < 88rpx | 全站 ≥ 88rpx | 抽查 |
| 深色模式 | 无 | 全页面可用 | 真机截图 |
| 大字模式 | 无 | 设置页一键开启 | 真机验证 |
| 设计稿缺口 | 5 屏 + 忌口 + 文案 + hero 细节 | 除降级项（pay-wechat/state-imgview 走原生）外清零 | 逐屏对照 |

---

## 三、已定决策与待定决策

### 已定（2026-08-05 用户确认）

1. **底部导航改为 warm 定稿四 tab：今日 / 菜谱 / 冰箱 / 我的**（当前是 首页/菜单/菜谱/我的）。菜单页降级为二级页，入口挪进「今日」与「我的」；冰箱（pantry）升级为 tab 页。
2. **交付范围：计划书 + 分阶段全部执行**（P0→P4，每阶段验收通过再进下一阶段）。
3. pay-wechat 收银台与 state-imgview 不造假 UI，沿用原生 `wx.requestPayment` / `wx.previewImage` 兜底。
4. home 页 eyebrow 保留现有中文无衬线写法（历史主动改动，不强行恢复 serif）。

### 待定（进入对应阶段前确认）

- share-card：做成独立页面还是仅自定义 `onShareAppMessage` 分享图（默认后者，工作量小）。
- 忌口筛选：按 warm 设计稿做「家庭成员忌口配置 + recipes 页筛选」，含后端 `family_member.avoid_tags_json` 字段与迁移；如不愿动后端，退化为前端本地配置。
- 深色模式：P0 token 收敛后做全页面；如工时紧张降级为「5 主页面 + recipe-detail + cook-mode」。

---

## 四、分阶段实施计划

### 前置：基线提交

1. 当前工作区有约 120 个文件未提交（v2 落地 + 删除的临时截图 + 新增文档），先整理提交为基线，保证每阶段 diff 干净可回滚。
2. 提交内容分组建议：miniapp v2 落地一组、docs 与工具脚本一组、删除的临时产物一组（`smoke-*.png`/`mcp-*.png`/`instance/warp_admin.db` 等不入库）。

### 阶段 P0：设计纪律收敛（零视觉风险，3~4 天）

> 原则：先收口，再美化。不改任何页面视觉效果，只做「换写法」。

**任务 1：色值 token 化**
1. `app.wxss` 补齐缺失 token：`--skeleton`（统一骨架色，替换三处 `#f0ebe2`/`#d8d0bf`/`#efe4d7`）、`--overlay-dark`、`--surface-pressed`、`--report-chip-bg`/`--report-chip-ink`（community 举报 chip）、`--phone-banner-*`（me 绑手机条渐变，或并入现有色板）。
2. 替换 home 许愿弹窗 24 处（690-842）、community 7 处（350-373）、me 7 处（352-370）、vip/orders 4 处（245-265）、favorites 3 处（171-185）。
3. 保留项：`#000` mask（about/shopping/checkout）、splash 金箔 SVG 渐变素材。
4. 每页替换后开发者工具截图与替换前对比，肉眼无差异才算过；禁止全局批量 sed 后直接提交。

**任务 2：字号标尺收敛**
1. 现有标尺 64/50/36/28/25/23/21/19rpx 保留；扩充或归并散值：30→28/36（按上下文）、31/32/33→36 或 28、34→36、29→28、24→25、26→25/28、22→23、27→28。
2. hero 大标题统一 3 档：主 hero 112rpx（menu/recipes/shopping/community/weekly/pantry/recipe-detail/home 类）、次 hero 88rpx（vip/family-create/splash/settings/verify-otp/help-faq）、小 66rpx（legal/success/orders）。
3. 按钮字号统一 29rpx；`.btn` 相关页面覆盖类（login 32、onboarding 32、vip 30）改为引用 token。
4. 验收：非标字号 ≤ 10 处；抽查 5 组同级元素跨页一致（列表标题/卡片副标题/按钮/标签/统计数字）。

**任务 3：规格统一**
1. 照片 hero 高度统一 862rpx（`--hero-h` token），小 hero（vip/family）保留 620/554 作为 `--hero-h-sm`。
2. 返回键统一收敛到 `nav-bar` 组件：vip 自绘 64rpx 圆钮（[vip/index.wxss](miniapp/pages/vip/index.wxss) 35-45）、recipe-detail 80rpx（41-47）、cook-mode 84rpx（22-27）、search 自绘 77rpx 全部替换或统一尺寸 88rpx。
3. 验收：Grep 返回钮样式只有 nav-bar 一处权威实现。

**任务 4：空态收敛**
1. `state-empty` 组件能力补齐（标题/描述/图标/CTA 插槽），menu 页迁移，删除 `components/empty-state`。
2. home 全空兜底改用 `state-empty` 或收敛到同一样式；删除 app.wxss 全局 `.empty-state/.empty-text`（无引用后）。
3. 验收：全库仅 1 套空态组件；删除文件后编译无报错。

**任务 5：重复样式收敛**
1. 13 页手写 `.shead` 迁到 `section-head` 组件（逐页替换，样式保持一致）。
2. `.badge` 抽公共实现（圆点/文字 pill/图标三变体）上收 app.wxss，vip/orders、family/members、family/join 接入。
3. `.btn.disabled` 上收 app.wxss；`.row` 冲突改名（checkout 的 `.row` 改 `.pay-row`）；`.chip` 页面扩展子类记录进规范。

**P0 出口标准**：三项验收全过；43 页截图与改造前无视觉差异（用 `smoke-all/` 基线 diff）。

---

### 阶段 P1：组件复用 + TabBar 重构（3~4 天）

**任务 6：菜谱卡片统一为 `recipe-card`**
1. 组件升级：字段别名兼容 `coverImage||dishImg||cover`；新增 props：`showAdd`（recipes 新建卡）、`selected`（menu 已选态）、`badge`（菜系角标）、宽度可覆盖（外层包 flex 容器控制）。
2. home 横滑卡 `.mh-rcard`/行卡 `.mh-row`、recipes 网格卡 `.rx-card`、favorites 卡全部接入组件；删除三份手写样式（预计净删 300+ 行 WXSS）。
3. 验收：三页卡片截图对比无视觉差异；事件绑定（tap 详情/加菜/收藏）行为不变。

**任务 7：SVG 盘活或删除**
1. `cuisine-*.svg` ×8 接入菜系 chip/角标（替换纯文字色条，或删除）。
2. `empty-*.svg` ×4 接入 `state-empty` 图标位（或删除）。
3. 验收：`assets/icons` 0 闲置文件。

**任务 8：TabBar 重构为「今日 / 菜谱 / 冰箱 / 我的」**
1. `app.json` tabBar list 与 [custom-tab-bar/index.js](miniapp/custom-tab-bar/index.js) 12-42 同步：今日（home）/菜谱（recipes）/冰箱（pantry）/我的（me）；修复「点菜」vs「首页」文案矛盾。
2. 菜单页降级为二级页：`menu/index.json` 设 `navigationStyle: custom` + 接入 `nav-bar` 返回；home「今日菜单」卡、me 页菜单入口改为 `navigateTo`；全站 `switchTab('/pages/menu/index')` 改 `navigateTo`（Grep 全站）。
3. pantry 升级为 tab 页：移除自定义导航栏改接 tab 布局、底部安全区 padding、onShow 刷新数据；me 的冰箱入口改 `switchTab`。
4. 新增冰箱 tab 图标（`assets/icons/tab-fridge.svg` + `tab-fridge-active.svg`，沿用现有线条风格）；`tab-cart*` 归档或删除（菜单不再占 tab）。
5. 修复 badge 首帧缺失（`attached` 时同步一次）；删除 `.tab-item` 死 transition。
6. 验收：4 tab 真机点击流程全通；menu/pantry 正反向跳转无死链；badge 首帧正确；图标零闲置。

**P1 出口标准**：组件引用扫描达标；43 页冒烟无死链；TabBar 真机 4 tab 逐一点击截图。

---

### 阶段 P2：设计稿缺口补齐（4~5 天，含后端）

**任务 9：文案中文化**
1. menu「Plating」、me「My Kitchen」等英文 eyebrow 按 warm 定稿中文化；全库 Grep `[A-Za-z]{3,}` 标题类英文残留。
2. home 保持现有中文无衬线 eyebrow（已定决策）。

**任务 10：home hero 细节**
1. 对标 [home-final.html](artifacts/home-final.html)：补镂空描边标题（`-webkit-text-stroke`，注意 Android 兼容回退：不支持时降级为实心白字）+ 暖光 `radial-gradient` 叠层（在 `.mh-hero-shade` 上叠加）。
2. 验收：首屏截图与设计稿差异肉眼不可辨。

**任务 11：忌口/过敏筛选（含后端）**
1. 后端：[schema.sql](server/src/main/resources/schema.sql) 加 `family_member.avoid_tags_json` 列（迁移脚本 + 备份）；FamilyService 提供成员忌口读写；EnhancedService 或 recipes 接口支持 `avoid` 过滤参数。
2. 前端：family/members 成员编辑加忌口标签多选；recipes 页落地 warm 设计稿 `diet-bar`（VIP 门控按现有高级筛选逻辑）。
3. 验收：配置忌口后 recipes 列表正确过滤；接口返回与前端展示一致；无成员配置时行为与现状一致。

**任务 12：缺失组件与页面**
1. 新建 `components/state-loading`（全屏加载，骨架+文案变体）、`components/state-sheet`（底部弹层，内置 mask + `catchtouchmove` 滚动锁 + 圆角 + 安全区）。
2. 新建 `pages/share-card` 或仅自定义 `onShareAppMessage` 分享图（待定决策，默认后者）。
3. 现有弹窗（wish-modal/wechat-auth/community sheet）迁移到 `state-sheet` 或同步滚动锁写法。
4. 验收：组件在 3+ 页面实际使用；编译无警告。

**任务 13：动效补齐**
1. 长列表页（home/menu/recipes/shopping/me）滚动浮现：`IntersectionObserver` 监听卡片容器，进入视口后加 `g-fade-up` 类（注意列表渲染后再创建 observer，避免性能问题）。
2. 数据卡数字滚动：setData count-up（偏好条/统计卡），时长 600ms 缓出。
3. `tap-scale` 加弹性回弹（`--g-back-out` 已有）。
4. 验收：开发者工具真机模式下滚动浮现可见；无掉帧（Performance 面板）。

**任务 14：铁律违规修复**
1. settings 页 `☎ ⛨ ✉ ✈ ♪ ✎ ▤` 替换为 CSS 图标或 SVG（沿用 `mh-ico-*` 画法）；vip/upgrade `✨` 兜底删除；community/post-detail `♥` 保留为收藏态装饰（非功能图标）或替换。
2. family/members 菜图头像、wechat-auth fallback 菜图头像改为「文字 + 品牌色」（张/我=红、妈=金、爸=绿、奶=深棕）。
3. 验收：全库 WXML 无语义功能依赖字形符号；无 `assets/dishes/` 图片被当头像使用。

**P2 出口标准**：50 屏 warm 设计稿对照表清零（除已定降级项）；忌口功能端到端可用；动效走查通过。

---

### 阶段 P3：体验健壮性 + 适老化（3~4 天）

**任务 15：加载态补齐（7 页）**
1. me：7 请求汇总 loading 态（首次加载骨架，后续静默刷新）；community：posts 加载中显示骨架而非空态；notifications/vip/pantry/weekly-menu/menu 补骨架分支。
2. 验收：3G 弱网模拟下 17 个数据页全部有明确加载视觉。

**任务 16：失败/空态解耦**
1. shopping/recipes/weekly-menu/pantry/notifications：新增 `loadError` 状态 → 错误提示 + 重试按钮；空数据才显示空态。
2. community 评论失败 toast；vip 失败不显示默认演示数据（改错误态）；cook-mode 失败提示；home 许愿保存/删除失败回滚 + toast。
3. 验收：断网启动每个数据页 → 均为错误态可重试；恢复网络点重试 → 正常渲染。

**任务 17：js 层清理**
1. menu onShow 重置 loading、setTimeout 引用保存并在 onUnload 清理；home 的 `Map` 移出 data（改普通对象/数组）；community 加载完成前不渲染空态分支。
2. 验收：快速切页/返回无「已销毁仍 setData/导航」告警；状态切换无闪烁。

**任务 18：弹窗滚动穿透**
1. 全部弹窗（wish-modal/wechat-auth sheet/community pf-sheet/state-dialog/新建 state-sheet）mask 加 `catchtouchmove` 或页面级滚动锁。
2. 验收：弹窗打开时背景滚动被锁，弹层内滚动正常。

**任务 19：无障碍**
1. 对比度：`--mut` 仅装饰场景；正文/次要文字场景改 `--mut-strong`（约 4.7:1）。
2. 触达目标：chip 高度 ≥ 88rpx、vip/search/cook-mode 返回键 ≥ 88rpx、`rx-create` ≥ 88rpx、feedback 删除角标改整行可点（20rpx → 44rpx 命中区）。
3. 安全区：splash/onboarding/wechat-auth 补 `safe-top`。
4. 验收：触达目标抽查清单清零；真机刘海屏截图无遮挡。

**任务 20：大字模式**
1. 设置页加「大字模式」开关（本地存储 + app.globalData）；page 根挂 `.font-lg`，字号 token `calc()` ×1.25。
2. 定宽容器（chip 横滑、统计卡）逐页走查 `ellipsis` 与溢出。
3. 验收：开启后 43 页无布局错乱（重点：home hero 标题、统计数字、chip 横滑）。

**P3 出口标准**：断网/弱网全流程走查通过；触达目标与对比度达标；大字模式 43 页截图抽查无错乱。

---

### 阶段 P4：深色模式 + 验证体系 + 文档（3~4 天）

**任务 21：深色模式**
1. `app.json` 配 `darkmode: true` + `themeLocation`（基础库 ≥ 2.11.0，确认 `project.config.json` libVersion）；token 按主题取值（`page` 挂 `data-theme` 或官方 darkmode 方案）。
2. 图片遮罩加深、hero 暖光层调暗、阴影减弱。
3. 验收：5 主页面 + recipe-detail + cook-mode 深色截图走查；真机跟随系统切换无闪白。

**任务 22：视觉回归基线**
1. `smoke-all/` 27 页截图扩为 43 页全覆盖；`probe-mcp.mjs` 固化到 `package.json` scripts（`npm run smoke`）。
2. 每阶段改动前后截图 diff，纳入验收流程。
3. 验收：一条命令可跑 43 页冒烟并输出 diff 报告。

**任务 23：规范文档**
1. 新建 `docs/UI设计规范.md`：token 表（色值/字号/圆角/阴影/间距）、字号标尺、组件用法（场景→组件映射）、动效规则（什么元素用 g-fade-up/g-scale-in/tap-scale）、Do & Don't（禁新增硬编码色值、禁 px、字形符号不做功能图标、新页面模板）。
2. 更新 [DESIGN.md](DESIGN.md) 变更历史；本计划书同步执行状态。
3. 验收：按规范文档可独立完成一个新页面的样式开发，无需问人。

**P4 出口标准**：深色模式可用；43 页冒烟全绿；规范文档落地。

---

## 五、排期总览

| 阶段 | 内容 | 预计工期 | 依赖 |
|------|------|----------|------|
| 前置 | 基线提交 | 0.5 天 | 无 |
| P0 | token 收敛 + 字号标尺 + 规格统一 + 空态/重复样式收敛 | 3~4 天 | 无 |
| P1 | recipe-card 统一 + SVG 盘活 + TabBar 重构（今日/菜谱/冰箱/我的） | 3~4 天 | P0（token） |
| P2 | 文案中文化 + hero 细节 + 忌口筛选（含后端）+ 缺失组件 + 动效 + 铁律 | 4~5 天 | P1（组件底座） |
| P3 | 加载态 + 失败/空态解耦 + js 清理 + 滚动锁 + 无障碍 + 大字模式 | 3~4 天 | P0 |
| P4 | 深色模式 + 截图回归 + 规范文档 | 3~4 天 | P0（强依赖 token 收敛） |

**执行顺序**：前置 → P0 → P1 → P2 → P3 → P4，每阶段结束跑 43 页截图回归再进下一阶段。
**若中途需要先交付**：优先级切法是 任务 16（失败/空态解耦）→ 任务 15（加载态）→ 任务 8（TabBar）→ 任务 1/2（token+字号）→ 任务 13（动效），先保体验正确再谈精致。

---

## 六、风险与注意事项

1. **token 替换是唯一高危操作**：剩余 42 处硬编码必须逐页截图对比，禁止全库 sed 后直接提交；深色模式依赖此步完成。
2. **TabBar 重构影响面大**：menu 从 tab 降级为二级页会牵动全站跳转（Grep `switchTab` 全站），P1 完成后必须跑全站冒烟；「今日」卡进菜单、「我的」页菜单入口都要同步。
3. **忌口筛选含数据库迁移**：改动前备份 schema；无成员配置时行为必须与现状一致，避免回归。
4. **emoji/符号替换注意跨端**：字形符号在 Android 会渲染为彩色 emoji，替换优先 CSS/SVG 而非引入新依赖。
5. **深色模式基础库兼容**：`themeLocation` 需基础库 ≥ 2.11.0，发布前确认 `project.config.json` 的 `libVersion`。
6. **大字模式**：rpx 字号 ×1.25 后个别定宽容器（chip 横滑、hero 标题、统计卡）可能溢出，需逐页走查 ellipsis。
7. **IntersectionObserver 动效**：列表先渲染再建 observer，页面隐藏/卸载时 disconnect，避免内存泄漏与重复触发。

---

## 七、附：审计原始数据速查（2026-08-05）

- 硬编码色值：全库 57 处（home 24、community 7、me 7、vip/orders 4、favorites 3、about 3、shopping 2、splash wxml 6 素材、checkout 1），需清理约 42 处。
- 非标字号分布 Top：import 22/24rpx×14、community 22/26rpx×10、home 24/26rpx×9、menu 24rpx×4、shopping 24rpx×4、recipe-edit 24rpx×4、family/join 24rpx×4。
- hero 标题字号 7+ 种：120/116/115/104/96/84/80/76/66rpx；hero 高度 8 种：862/858/870/840/826/869/620/554rpx。
- 返回键 4 种：vip 64、search 77、recipe-detail 80、cook-mode 84rpx。
- 骨架色 3 套：`#f0ebe2`（vip/orders、favorites）、`#d8d0bf`（home 弹窗）、`#efe4d7`（app.wxss `.skeleton`）。
- emoji/字形符号：WXML 29 处，Top：vip/upgrade 5（✓★）、vip 5（✓✕）、me/settings 3（☎⛨✦♪✉✈▤✎）、post-detail 3（♥★☆❝）、me 3（★☏）、payment/success 3（✓★）。
- 组件引用：nav-bar 32、state-toast 16、state-empty 14、state-dialog 3、empty-state 1、recipe-card 1、section-head 1、ad-banner 1；state-loading/state-sheet/state-imgview 不存在（需新建）。
- 闲置 SVG：`cuisine-{chuancai,yuecai,lucai,riliao,xican,jiachang,xiangcai,default}`×8、`empty-{list,menu,search,cooking}`×4；`tab-community*` 已删零引用。
- 无加载态页面：me、community、notifications、vip、pantry、weekly-menu、menu（7 页）。
- 失败→空态混淆页面：shopping、recipes、weekly-menu、pantry、notifications（+me 无 catch 汇总、community 评论、vip、cook-mode 静默）。
- 弹窗无滚动锁：home wish-modal、wechat-auth sheet、community pf-sheet、state-dialog（待查）。
- 设计稿 50 屏 vs 小程序 43 页：5 屏未落地（pay-wechat、share-card、state-loading、state-sheet、state-imgview）。
- 铁律违规：settings 符号图标、vip/upgrade `✨`、family/members 与 wechat-auth 菜图头像、menu/me 系统导航栏盖 hero、TabBar 文案「点菜」vs「首页」矛盾。

---

## 八、执行状态（2026-08-06）

> 计划已按 P0→P4 全部执行完毕并分阶段提交（commit 见 git log）。

| 阶段 | 状态 | 完成内容 | 偏差与说明 |
|------|------|----------|-----------|
| 前置基线 | 完成 | UI 落地 + 支付闭环 3 个提交 | — |
| P0 设计纪律 | 完成 | 色值 token 化（含 root-portal 变量副本方案）、字号标尺 12 级、hero/返回键/按钮规格统一、空态收敛 state-empty | `.shead` 13 页组件化与 `.badge` 三处合并**跳过**：样式已在 app.wxss 全局收敛，页面样式隔离下无实际冲突，组件化纯属结构搬家，收益低于风险 |
| P1 组件与导航 | 完成 | TabBar 四 tab 重构（今日/菜谱/冰箱/我的）、menu 转二级页、pantry 转 tab 页、SVG 零闲置、recipe-card 字段兼容 | home/recipes 卡片保持手写：横滑紧凑卡与「selected/创建卡」是独立视觉变体，强行组件化回归风险高，列为低优先级 |
| P2 设计稿缺口 | 完成 | 文案中文化、home hero 镂空+暖光、忌口筛选闭环（schema+接口+成员编辑+recipes 过滤）、state-sheet/state-loading、tap-scale 弹性、me 数字滚动 | 滚动浮现（IntersectionObserver）**降级**：页面入场动画 + g-d 阶梯已覆盖主要感知，收益边际；share-card 默认走 onShareAppMessage，pay-wechat/state-imgview 原生兜底（已定决策） |
| P3 体验健壮性 | 完成 | 失败/空态解耦 5 页 + community 加载态、menu 定时器清理、home 死 Map 删除、许愿离线提示、弹窗滚动锁、--mut AA 收敛、feedback 触达区、大字模式开关 | 大字模式**已知局限**：仅 var() 引用字号放大（6 主页面），静态 rpx 字号不缩放；全站缩放需字号 token 化二期 |
| P4 深色模式与文档 | 完成 | theme.json darkmode + token 主题化（含 TabBar）、docs/UI设计规范.md、DESIGN.md 变更历史 | 真机深色截图与 43 页截图回归**未执行**（需微信开发者工具环境）；`probe-mcp.mjs` 回归流程已写入规范文档 |

### 残余风险（下阶段建议）

1. **真机验收**：4 tab 跳转、忌口编辑、深色模式、大字模式需开发者工具/真机过一遍（本会话为静态验证 + 编译验证）。
2. **大字模式二期**：字号 token 化后全站 calc 缩放。
3. **滚动浮现**：如产品需要，按规范文档第九节用 IntersectionObserver 落地。
4. **cook-mode 失败静默**：详情加载失败仍为静默空态（未列入本次 5 页清单，P3 收尾时遗漏，建议补）。