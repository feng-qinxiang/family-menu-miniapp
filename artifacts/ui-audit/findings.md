# 全站 UI 走查发现（2026-09-12）

对照 docs/UI设计规范.md。分级：[硬伤] 溢出/遮挡/不可读 ｜ [不一致] 跨页规格漂移 ｜ [打磨] 观感提升

## 浅色走查

### [硬伤·已修] 数组解构白屏第二波（3 页）
走查实锤：pantry 整页白屏。根因同类但形式不同，之前的正则漏了两种形式：
- pages/pantry/index.js:68 赋值式解构 `[a, b] = await Promise.all(...)`（无 const 前缀）
- pkg-extra/community/post-detail/index.js:98、pkg-extra/me/preference-profile/index.js:65 回调参数解构 `.then(([a, b]) =>)`
已全部改下标取值；static-check.js 新增「数组解构语法」永久防线（含赋值式/参数式），双向验证通过。
教训：解构形式不止一种，静态防线必须覆盖全部形式并进 CI。

### 走查记录（浅色，前 8 页）
- home 首屏/二屏：无硬伤。槽栏吸顶与胶囊重叠属正常滚动表现
- recipes 首屏/网格：无硬伤。卡片规格一致
- community：无硬伤。统计半卡叠 hero 可读
- post-detail：页面正常；[打磨·记录不改] loadAll 网络失败与帖子不存在共用文案"不存在或已删除"，语义略混，已有"换网络再试"兜底
- preference-profile：修复后渲染完整
- me 三屏：无硬伤
- menu：[打磨·已修] 统计卡空数据 "?分/?份" 问号直出 → 改 "--" 且空值隐藏单位；菜品行 timeCost 同步

## 第二阶段补扫（分包剩余 16 页 + menu/pantry 复拍，2026-09-12）
方式：miniprogram-automator（cli auto 9420）批量 reLaunch + 截图，截图 20~37 号。
逐页结论：
- 20 login-phone：登录/微信登录按钮右边贴屏幕边（左 54rpx 正常）——`width:100%`+`padding` 且无 border-box，实宽 706rpx 溢出 64rpx。**已修**（补 box-sizing）→ 20-login-phone-fixed.png
- 21 settings / 22 notifications / 23 feedback / 24 help-faq：干净
- 25 about / 26 profile-edit：干净
- 27 recipes-search：placeholder「搜菜名/菜系/口味」被输入框宽度截断成"…/ 口"。**已修**（缩短文案）→ 27-search-fixed.png
- 28 recipe-edit(id=8)：干净（分段控制/封面/stepper 均正常）
- 29/30 legal：内容排版干净；console 两条——(a) 运营者占位符 warn＝提审前运营项，记入汇报不改码；(b) nav-bar statusBarHeight 非 Number（privacy 未在 data 声明、menu 同）。**已修**（data 初始化 0）
- 31 vip-upgrade / 32 vip-orders(空态) / 33 checkout / 34 success / 35 family-invite：干净
- 36 menu："?分/?份" 修复确认生效；statusBarHeight warn 已修
- 37 pantry：白屏修复确认生效，列表/热区正常

## 阶段 2b：深色模式（2026-09-12）—— 本次走查最大发现
**深色模式此前从未生效。** 官方文档证实 theme.json 变量只能经 @ 引用在 app.json/页面 json 生效，
不注入 WXSS；app.wxss 的 var(--themeX, fallback) 永远命中 fallback（品红探针上屏实证）。
theme.json 换槽、系统深色+IDE 重启均无法让页面变暗 → 8 月计划书"深色框架已落地"不成立。

修复（全部落地）：
1. app.wxss 新增 @media (prefers-color-scheme: dark) 块：覆盖裸 --themeX 层（值=theme.json dark 段）
   + 字面量 token 深色档（阴影/横幅/描边等）+ 旧 --c-* 兼容层字面量深色档
2. --ink-deep 双角色拆分：新增 --anchor（恒定深底，两主题不翻转）与 --anchor-contrast（恒定浅字）
   - 36 处 background: var(--ink-deep) → var(--anchor)（今日菜单卡/餐盘托/激活片/添加按钮等）
   - 全站 color: var(--c-surface) / var(--paper) → var(--anchor-contrast)（彩底/照片上的文字恒浅）
3. 全局类修复：.card-dark / .chip.on / .btn-dark / .title-stroke（白描边标题填充恒白）
4. home 许愿弹窗（root-portal 不继承变量）：js 增加 theme 管道（getAppBaseInfo + onThemeChange），
   wxss 增加 .is-dark token 副本（d10 截图验证通过）

验证：12 关键页深色截图（d01~d12）全部正常——home/menu/recipes/pantry/community/me/shopping/
recipe-detail/cook-mode/recipe-edit/notifications/许愿弹窗；浅色回归 4 页（L-*）与基线一致零变化。

残余项：
- @media 触发需真机抽查（devtools 模拟器深色开关无法经 CLI 触达；值校验已用临时直写探针覆盖）
- app.json window 导航栏色未跟随深色（全部页面 custom nav，影响≈0）
- theme.json dark 段为中性灰，与 UI设计规范.md 所写暖棕不一致——按 theme.json 实际值执行，规范文档待更新
- legal-config.js 运营者信息仍为占位符（提审前运营项，非代码缺陷）

## 阶段 3：大字模式二期（2026-09-12）
- font-lg 根类接线从 7 页补齐到全站 36 页（wxml 根节点绑定 + js onShow/onLoad 读取 font_scale）
- app.wxss font-lg 块补 --fs-tiny: 24rpx；块注释更新为全站覆盖
- 大字态走查 8 关键页（g01~g08）：hero 标题/chip 横滑/统计卡均无溢出；post-detail 顺带验证了
  「帖子不存在」错误态渲染正确
- 机制验证：help-faq 根类实测 `container help font-lg`、data.fontScale=lg
- 残留：页面 wxss 中 ~400 处静态 rpx 字号不随档位放大（8 月计划书已知局限，代码有注释）。
  全量迁移风险大于收益，维持现状；新增页面一律用 token
- 踩坑记录：批量注入 wxml 时正则吞了根节点闭合 `>`（21 文件）+ feedback 页误接 nav 提交按钮，
  已全部修复；此类批量改动必须紧跟一次 reLaunch 编译验证

## 阶段 4：滚动浮现动效（2026-09-12）
- 新增 behaviors/scroll-reveal.js（项目惯例 mixin，非 Behavior——Page 不支持 behaviors 生命周期）
- 机制：IntersectionObserver observeAll + data-rv 下标 + reveal[index] 批量 setData；
  rv-hold 潜藏态由 revealOn 门控——脚本失效时内容照常渲染（不玩消失）；
  wx.nextTick 后才 observe（wx:if 门控节点需等渲染帧）
- 接入 5 页：recipes(.rx-card-slot) / community(.pcard) / shopping(.mkt-item，key=group.key-idx) /
  me(.mag-hrow) / home(.mh-rcard-slot 横滑卡)
- 验证：各页 revealOn=true，首屏项即现、滚动项随入随现（recipes 2→6，shopping 2→4，home 0→2
  ——home 卡区在 956px 首屏外，初始 0 是正确行为）；截图无内容卡在潜藏态
- tab 页（home/community/me）不卸载不 dispose；shopping 非 tab 页已加 onUnload dispose；
  mixin 重复调用自动先 dispose，刷新不泄漏

## 阶段 5：视觉风格升级（2026-09-12）
候选清单逐项判定：
1. 统计数字 count-up —— 计划书写"参考 me 页实现"，实测全站不存在（8 月被降级未做）。本次落地：
   utils/count-up.js（600ms cubic-out，30fps，0 值落数字 0 防 `!data.key` 守卫被骗）；
   接入 menu 统计卡（totalCount/totalTime/totalServings）+ home 菜单卡待买数（shoppingPending）。
   menu 实测：动画中途 '4'（字符串 tween）→ 终值 truthy，空态守卫 `!totalCount` 不受影响
2. hero 暖光层 / 卡片阴影圆角 / 区块留白节奏 —— 对照 47 页走查截图与规范基线：均已在规范内
   （8 月 P0-P4 已落地），不为此再动（避免无回归依据的观感抖动）

## 阶段 6：回归与总结（2026-09-12）
- 三套检查全绿：static-check 275 文件通过 / interaction-audit A=B=C=0 / dish-logic 全部断言通过
- after 基线：after-01~05（5 主页浅色，与走查基线一致）；深色 d01~d12；大字 g01~g08；浮现 rv-*；
  count-up cu-*
### 未修项及原因
- ~400 处静态 rpx 字号不随大字档放大：8 月已知局限，全量迁移风险>收益
- @media 深色触发需真机抽查（devtools 模拟器深色开关无法经 CLI/自动化触达）
- app.json window 导航栏色未配 @ 深色引用（全站 custom nav，影响≈0）
- legal-config.js 运营者占位符（提审前运营项）
- theme.json dark 为中性灰、与设计规范文档的暖棕不一致：按 theme.json 实际值执行，规范文档待更新

## 残留项清缴（2026-09-12 第二轮）
1. **@media 深色触发真实验证 ✓**：找到 devtools 每项目模拟器设置（WeappLocalData/localstorage_d0fd5e0…=
   toolbar_E:\cx\…\miniapp，键 darkmode），置 true 重开项目 → systemInfo.theme=dark，
   **12 页经真实 @media 触发渲染深色全部正常**，home 许愿弹窗 theme 走真实 getAppBaseInfo 管道
   拿到 dark（非强制 setData）。已还原 false。复抓 3 轮 console 无 error（先前 1 条瞬时无法复现）
2. **静态字号大字档缩放 ✓**：469 处 `font-size: NNrpx` → `calc(NNrpx * var(--fs-mul, 1))`（44 文件），
   `.font-lg` 定义 `--fs-mul: 1.15`。标准档 ×1 逐像素不变（home/recipes/recipe-detail 与基线一致），
   大字档全站文本统一放大且无溢出（home/help-faq/menu/recipes/shopping 实拍）。
   比 token 迁移更优：零浅色回归风险
3. **设计规范文档修订 ✓**：docs/UI设计规范.md 深色值列改为 theme.json 实际值（中性灰）、
   更正「theme.json 自动注入 WXSS」的错误说法为 @media 机制（含双处同步提醒）、
   补 --anchor/--anchor-contrast/--fs-mul 说明、大字覆盖面更新为全站 36 页
4. **legal-config 运营者信息 ✋ 唯一遗留**：operatorName / operatorContact 是微信提审核对的
   运营者实名信息（个人开发者=本人姓名+邮箱/手机号），只有项目所有者能填，代填即造假必被驳回。
   utils/legal-config.js 顶部已有醒目标注，填两行字符串即可

工程备注：批量改 wxss 后 IDE 会把半程状态编译缓存（help-faq 曾整页样式丢失），**重启项目
（cli quit + cli auto）即恢复**——大批量改动后必须重启验证。
