# 一家人的饭桌：正式页面与四阶段流程

沿用用户确认的“现代优化 × 家庭点菜单”，在原版视觉上完成正式页面的主导航、菜单、做菜与记录布局，并统一常用二级工具页。

- worktree：`/Users/xx/.codex/worktrees/meal-journey-ui/家庭点菜小程序`
- 分支：`codex/meal-journey-ui`
- 当前预览：<http://127.0.0.1:8847/?v=20261104-layout-focus#followup-update>
- 全部正式页面：<http://127.0.0.1:8847/#all-pages>
- 原工作区：`/Users/xx/cx/家庭点菜小程序`，本轮未编辑。

## 正式页面

新增 [17 页点击原型与 Figma 原型包](http://127.0.0.1:8847/figma-prototype/)，沿用确认的现版视觉。包含设计规范、流程画布、SVG 与离线 Figma 开发插件；网页可点击演示，插件生成原生文字、图片填充、矢量图标及页面跳转。详见 `figma-prototype/README.md`。当前没有 Figma 写入连接器，未声称已在真实 Figma 文件导入或发布。

底栏统一为 **点菜 / 做菜 / 记录 / 社区 / 我的**。菜谱库和冰箱成为带返回导航的普通页面；做菜记录进入主包，旧完成链接保留兼容跳转。

- **点菜**：保留原版照片、加到菜单和换一道；家庭菜单展示菜图、点菜人、菜品状态与上桌进度，买食材与做菜操作提前；家人心愿与推荐菜继续保留。空菜单、长昵称、长菜名、大字模式及滚动页头均有对应布局。
- **做菜**：按餐次分组，菜品图片和状态放在一起，操作独立成行；支持继续做菜、直接上桌、厨房总控和买菜清单。
- **记录**：本月统计、七日开火日历、掌勺人筛选、评分与心得组成时间线；可再点一次或关联菜谱晒到社区。旧做菜完成链接把菜品 ID 交给记录 Tab，高亮刚完成的菜。
- **社区**：延续紧凑页头、成品分享和关联菜谱；发布与审核沿用现有业务与功能开关。
- **我的**：家庭成员、菜谱、最近上桌与工具入口继续使用统一纸色、字号和卡片。
- **工具页**：买菜清单、导入菜谱、周菜单、创建家庭和会员页收紧照片装饰，主要操作提前。菜谱库、冰箱、厨房总控和分步做菜继续复用现有能力。

首页、菜谱详情等以菜品为主的页面保留大图；分步做菜保留适合专注操作的暗色界面。设置、帮助、反馈、通知、家庭成员、邀请、资料及协议页面继续使用原有统一组件与主题。

## 2026-11-04：四处反馈，分栏与连续阅读

继续在同一个 worktree 修改。精确的本轮修改前备份位于 `/var/folders/3y/jk4gpwpj34s6c6s76db7by600000gn/T/meal-layout-focus-before-ruqe6el9`，包含 9 个源文件及 SHA256 清单；保留前轮未提交内容。

- 按需挑菜弹层：空输入只留两个示例，输入后收起；人数、耗时、菜系、餐次、口味和食材逐行核对。复用原解析与挑菜逻辑，关闭保留草稿，无匹配保留输入。
- 冰箱摘要：名称与数量排成两列，临期提示收到底部，保留加载失败重试与空库存说明。
- 推荐卡：左侧整块菜图，右侧集中菜名、耗时、人份、库存与说明。网页动态文本按三行更新，避免换菜后越过右栏；共享菜卡的说明与按钮也消除覆盖。
- 菜谱详情：头图缩短，菜名和简介放到纸底正文；用料图片靠左、名称与数量同行、库存在下一行。做法统一序号，无视频时不显示重复视频封面。小程序的人份调节、图片上传与原有操作保留。

网页交互原型、17 页 SVG、离线网页和 Figma 开发插件已同步。画廊 `#followup-update` 展示本轮三张截图，旧版移至 `#skills-update`，原生截图与 39 页目录保留。

验收证据：`layout-focus-browser-checks.json` 记录 28 项交互检查；`layout-focus-responsive-checks.json` 记录 1344 / 957 / 375 / 320px 共 14 个页面状态，未发现横向或文字越界，并检查共享菜卡影响到的做菜、记录页。`layout-focus-source-checks.json` 汇总静态、逻辑、交互反馈与源码检查；`gallery-layout-focus-evidence.json` 记录画廊与资源验收。

本轮网页截图不能替代原生运行验收。微信开发者工具仍受当前账号的 `APPID_ERROR` 开发者权限限制，未完成本轮原生编译或真机验证；Figma 插件仅完成本地契约验证，未在真实文件运行。未提交、推送或部署。

## 2026-11-04：Skills 试改，菜谱、冰箱与按需挑菜

继续使用 `codex/meal-journey-ui`，保留暖纸底、番茄红、松绿、左侧分类和左图右文。修改前备份在 `/var/folders/3y/jk4gpwpj34s6c6s76db7by600000gn/T/meal-skills-try-before-jnvfdd25`；原版和上版截图未覆盖。

- 菜谱库将菜系/来源切换收入左栏，搜索与筛选合成一行，用料开关放入筛选，菜卡提前出现。
- 冰箱将临期食材、能做几道和挑菜集中显示，提醒默认折叠；保留照片、无图名称、拍照和管理入口。
- 新增“按需挑菜”：输入“两人吃，30分钟，不辣，冰箱有的”，先查看识别条件，再确认挑菜。关闭保留草稿，无匹配保留输入；未支持或矛盾的要求阻止确认。复用现有库存匹配和随机挑菜，不自动写入菜单。

已安装并参考的 7 个 skills 均在 `/Users/xx/rjd/skills/`：`ui-ux-pro-max` 来自 [UI UX Pro Max](https://github.com/nextlevelbuilder/ui-ux-pro-max-skill)；`ui-design`、`miniprogram-development`、`cloudbase-platform` 来自 [CloudBase AI Toolkit](https://github.com/TencentCloudBase/CloudBase-AI-Toolkit)；另有 [wechat-miniprogram-skills](https://github.com/larkwins/wechat-miniprogram-skills)、[frontend-design](https://github.com/anthropics/skills/tree/main/skills/frontend-design) 和 [order-skill](https://github.com/TencentCloudBase/awesome-miniprogram-skills)。本轮只借鉴设计、平台约束和条件输入方式，没有接入大模型、外卖或支付服务。

本地规则解析集中在 `miniapp/utils/meal-request.js`，网页原型内联同一实现，不依赖模型或网络接口。网页使用少量设计样例，搜索、完整分类、真实库存和图片上传仍在小程序中使用。离线 Figma 包更新为 17 个页面/状态及 2 张画布。

逻辑回归、静态检查、浏览器交互与窄屏验收记录在 `skills-trial-checks.json`、`skills-browser-checks.json`、`gallery-skills-evidence.json`。本轮微信登录后打开项目返回 `APPID_ERROR`，提示当前账号不是该小程序开发者，因此未完成本轮原生编译、模拟器截图或真机验收。新画廊的三张图明确标为网页交互原型，上版模拟器截图及 39 页目录保留。未在真实 Figma 文件运行插件，未部署后端或发送真实通知。

## 2026-10-11：紧凑筛选与消息操作

根据新一轮两处标注，筛选面板紧接搜索，耗时和人份两行对齐。选中项用小块暖色标记；重置放在人份行末，外层仍是 44px 点击高度。展开区从上一版的 155px 缩到 97px，去掉独立白卡、圆形选项和单独的重置行。

消息页的批量已读从导航右侧移到内容标题旁，使用“全部标为已读”边框按钮和项目现有勾选图标。有未读且消息加载成功时才显示；全部已读后显示“暂无未读消息”，按钮隐藏。复用现有处理函数，本轮没有改业务 JavaScript。

`filter-actions-compile.json` 记录四个修改文件的局部编译及源码 hash；`filter-actions-picker.json` 记录 16 张菜谱状态截图、15 项检查，增加两行筛选、搜索下方位置及重置同行的几何校验。`filter-actions-notifications.json` 记录 3 张消息状态截图和 3 个布局检查，包含普通、大字长消息与已读后隐藏操作。原生脚本串行执行，结束恢复临时 Page 数据，未点击真实批量已读或其他业务写操作。

静态检查、`ui-followup.test.js` 和 `git diff --check` 通过。点击原型的消息按钮已同步；Figma 包仍为 16 页和 2 张画布，未在真实 Figma 导入。画廊把这两处放到前排，并提供上一版截图对照。

`gallery-filter-actions-evidence.json` 记录浏览器验证：39 页目录、100 个截图链接均能加载，1344 / 375 / 320 三种宽度无横向溢出；原型消息按钮可点击并显示演示说明。

## 前轮：菜谱库顶部层级

搜索和筛选共用浅底工具栏；随机一道、冰箱能做与看冰箱改为文字入口；菜系/来源切换使用下划线标签。默认隐藏“全部菜系 / 全部来源”摘要，选中条件后可分别清除。展开的耗时与人份选项保留至少 44px 的点击高度，两行之间留出间距。左侧分类及左图右文菜卡继续使用当前布局。

`toolbar-compile.json` 记录当前 WXML/WXSS 的局部编译及源码 hash；`toolbar-picker.json` 记录 16 张截图状态、15 项检查，包括默认、展开、已选条件、逐项清除、大字、来源/菜系交叉及随机挑菜。脚本结束恢复临时 Page 数据，没有调用真实业务写接口。静态检查、`ui-followup.test.js` 与 `git diff --check` 通过。

画廊前排展示默认、展开筛选、已选条件，并提供修改前截图对照。`gallery-toolbar-evidence.json` 验证 39 页目录、98 个截图链接和 1344 / 375 / 320 宽度显示。已同步 16 页点击原型和 Figma 包，生成与本地导入契约检查通过；`toolbar-prototype.json` 验证顶部文字、冰箱跳转和明确标注的筛选演示入口，未实际导入 Figma。

本地预览使用标准库 `ThreadingHTTPServer`，监听 127.0.0.1:8848，连接队列设为 128，减少批量截图加载时的连接重置。

## 2026-10-09：参考公开产品后的菜卡与作品阅读

本轮实际查看下厨房家常菜列表、作品详情与 Cookpad 手机详情，按家庭点菜场景重排两处。参考链接已放在画廊中。

- 菜卡上半部是左侧大图、右侧菜名/耗时/口味/用料，来源收成图片角标，简介缩成一行。底栏左侧显示冰箱用料，右侧固定点菜按钮；隐藏库存时显示查看做法。长菜名允许两行，保持现有左侧菜系/来源筛选、详情点击和加菜事件。
- 帖子按作者、作品图、标题与正文、话题、关联菜谱、评论的顺序排列。标题与正文连续阅读，使用白色底和现有字号标尺；正文行高 1.6，段间距 16rpx。关联菜谱用暖纸底分区，底部评论输入与互动沿用现有行为。

`product-layout-compile.json` 记录四个修改模板/样式的局部编译与源码 hash。`product-layout-picker.json`：13 张截图状态、9 项检查；`product-layout-details.json`：12 张截图状态、6 个布局状态，额外检查大字长正文与长 URL 自动换行。原生脚本串行完成，结束恢复临时数据和 mock，未调用真实点菜、库存或评论写接口。静态检查与 `ui-followup.test.js` 通过。

`gallery-product-layout-evidence.json`：39 页目录、115 个截图链接均可读取，1344 / 375 / 320 宽度没有横向溢出。16 页点击原型与 Figma 原型包已同步，生成与本地导入契约检查通过；未在真实 Figma 文件导入。

## 前轮：菜卡留白与帖子阅读调整

继续在同一 worktree 修改本轮两处标注。菜卡保留左图右文，将来源与点菜按钮放到图片下方；右栏保留菜名、耗时、人份、口味、简介、用料和冰箱状态，取消横贯整卡的底部操作行。帖子改为作者、标题、图片、正文、话题、关联菜谱和评论的顺序，正文自然左对齐，统一字号、行高和段间距。有图和无图共用同一阅读结构。

证据：`card-reading-compile.json`、`card-reading-picker.json`、`card-reading-details.json`。菜谱检查包含 13 个截图状态、9 项布局/交互检查，帖子检查包含 12 个截图状态、6 个布局状态。涵盖大字、长标题、隐藏库存、多图、无图、图片失效、输入评论和评论失败。原生脚本串行完成，结束恢复临时数据与 mock，未调用真实点菜、库存、评论写接口。静态检查和 `ui-followup.test.js` 通过。

16 页点击原型与 Figma 原型包已同步；仍未在真实 Figma 文件导入。当前预览：<http://127.0.0.1:8848/?v=20261009-card-reading#followup-update>。

## 前轮：七处留白与按钮反馈

本轮继续在同一 worktree 修复四处显示结构，没有新增接口或依赖。

- **菜谱库和展开列表**：简介、用料和冰箱状态移到图片右侧的完整信息栏。左侧菜系 / 来源和方图保留，底部单独显示来源与点菜操作。
- **买菜清单**：绿色“买好了”和边框“移除”使用原生按钮，操作行充分利用右栏；复用已有事件和失败处理，拍照与连续添加继续保留。
- **冰箱通知**：消息入口在右上，订阅说明与固定宽度按钮分行。显式覆盖微信按钮的默认宽度、字号和行高，普通 / 大字都保持按钮文字一行。“订阅一次”和“再次订阅”仍表示一次授权；微信模板未开放时展示提醒说明。
- **帖子详情**：标题、段落和话题组成连续阅读区；正文和话题降低视觉重量，举报在正文末尾，关联菜谱和评论独立排列。

原生证据 `spacing-pass-picker.json` 包含 25 个截图状态与 48 项布局检查，`spacing-pass-details.json` 包含 15 个截图状态与 9 个布局状态，全部通过。新增断言检查简介、用料与库存确实在右栏，买菜按钮不重叠，提醒文字不被微信默认按钮样式挤压，帖子阅读层次有序。临时 Page 数据与 mock 在结束时恢复，未调用真实点菜、采购、库存、通知或评论写接口。

静态检查及 `ui-followup`、`ingredient-photo`、`ui-refinement` 回归通过，`git diff --check` 通过。局部编译记录见 `spacing-pass-compile.json`。40 个截图状态已接入原来的 `#followup-update`；画廊桌面 / 375px / 320px 验收见 `gallery-spacing-evidence.json`，111 个截图引用无缺失，39 个页面目录保留。

四个对应点击原型已同步。原型包仍包含 16 个页面/状态和 2 张画布，生成与本地插件检查通过；真实 Figma 导入、手机拍照联调、后端部署与微信模板配置仍需单独验收。

复跑指定页面：

```sh
MEAL_UI_LAYOUT_EVIDENCE=spacing-pass-picker.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-picker.cjs recipes pantry shopping
MEAL_UI_LAYOUT_EVIDENCE=spacing-pass-details.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-all-pages.cjs pkg-extra/community/post-detail/index pkg-extra/me/notifications/index
```

## 前轮：八处图文、加购与排版反馈

沿用同一 worktree 和确认的暖纸色、番茄红版本，本轮落实到五个正式页面。

- **菜谱库与展开列表**：共享菜卡的左图改为方图；菜名、耗时、人份和口味在右，简介、用料、冰箱状态与底部点菜占整卡宽度。左侧菜系 / 来源保留，减少图片下方留白。
- **临时加购**：表单左侧增加拍照 / 选图入口，右侧填名称、数量和单位。先填食材名，再设置图片；复用现有家庭食材照片映射，每种食材一张图。添加成功清空草稿，可继续添加下一种；失败保留名称和照片，连点仍防重。无图显示名称，长名称最多两行，避免挡住拍照入口。
- **冰箱概览与文字**：临期数量、可做菜数和随机挑菜集中在上方；通知说明与订阅按钮合为一行。食材名称、数量、到期状态标签与具体日期各有清楚层级。
- **帖子详情与评论**：统一标题、正文、关联菜谱和评论字号及间距，作者说明可换行。分享使用微信小尺寸按钮，避免默认宽度挤压作者信息。底部圆角评论输入区与点赞、收藏、评论独立排列；输入后切换发送，多图、无图和失败状态保留。
- **消息中心**：时间移到卡片右上角，标题与类型在左，长标题可换行，正文继续使用整行宽度。

代码静态检查和 `ingredient-photo`、`ui-followup`、`recipe-pick` 相关回归已通过；加购测试覆盖空名称、照片预览、取消与失败保留、连点防重以及连续添加两种食材。10 个 WXML / WXSS 文件的局部编译见 `detail-polish-compile.json`。

原生验收：`detail-polish-picker-layouts.json` 包含菜谱、冰箱与买菜清单 25 个截图状态、34 项检查；`detail-polish-all-pages.json` 包含帖子与消息中心 15 个截图状态、9 个布局状态。共 40 个截图状态，覆盖普通 / 大字、长菜名、加购空表单 / 有图 / 长名称、多图、评论输入 / 发送中、无图和失败态。验收曾遇到一次工具响应超时，补跑后全部通过；样例 Page 数据和 mock 已恢复，未执行业务写接口。

画廊 `#followup-update` 接入本轮截图；39 页目录的买菜页新增加购空表单、有图及大字入口。Figma 原型包同步五个页面，仍为 16 个页面/状态与 2 张画布；已更新 SVG、离线网页和开发插件，并通过本地导入逻辑校验。真实 Figma 导入、拍照上传跨设备联调和后端部署不属于已完成验收。

画廊浏览器验收见 `gallery-detail-polish-evidence.json`：桌面及 375px、320px 无横向溢出，6 张本轮主图已加载，111 个本地截图引用没有缺失。临时视口已恢复，最终预览为 `screens/gallery-detail-polish-final.png`。点击原型的本轮补验记录在 `figma-prototype/browser-checks.json`，保留前轮证据并单独记录本轮范围。

复跑本轮指定页面：

```sh
MEAL_UI_LAYOUT_EVIDENCE=detail-polish-picker-layouts.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-picker.cjs recipes pantry shopping
MEAL_UI_LAYOUT_EVIDENCE=detail-polish-all-pages.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-all-pages.cjs pkg-extra/community/post-detail/index pkg-extra/me/notifications/index
```

## 前轮：七处布局重新整理

本轮继续修改同一 worktree，源码修改前的 29 文件备份：

`/var/folders/3y/jk4gpwpj34s6c6s76db7by600000gn/T/meal-ui-layout-review-20261009-lqyoa37m`

- 菜谱分类明确“按菜系 / 按来源”，左栏选中项有底色与左侧标记，当前交叉条件支持单独清除。缩小列表两侧边距，给右侧菜卡留宽度。
- 菜卡保留菜名、耗时、人份、口味、简介、用料、库存、来源、评分与点菜；减少胶囊和零碎间距，独立点菜按钮保持触控热区。
- 买菜清单改名称与数量同排，左侧食材照片为大方图；右侧保留来源、库存和买好 / 移除动作。
- 冰箱临期食材、能做菜数、随机挑菜与通知入口合成一个分区概览框；模板缺失、订阅一次、匹配失败状态照旧。
- 冰箱库存名称与数量同排，日期与明确的“管理”按钮同排，大图仍在左；无图或失败使用食材名称，可拍照或选图。
- 帖子详情按作者、大图、标题正文、话题、关联菜谱、评论排列；底部常驻点赞、收藏与评论，输入文字后切换发送，分享在作者栏，举报保留在正文末尾。无图不留图框，多图滑动与评论失败重试保留。
- 消息卡按卡头、完整宽度正文、状态和动作三层排版，临期使用冰箱图标；长标题可换行，未读点与时间不抢位置。

### 本轮验证状态

代码静态检查、交互阻断检查以及 `ui-followup`、`ingredient-photo`、`ui-refinement` 三个逻辑回归通过。证据：`layout-review-checks.json`。局部模板与样式编译记录：`layout-review-compile.json`。原工作区状态与备份一致；本轮文本凭据模式扫描无命中，`git diff --check` 通过。

原生几何检查通过：`layout-review-geometry-picker.json` 记录菜谱、冰箱与买菜清单 25 项检查；`layout-review-geometry-details.json` 记录帖子与消息中心 9 个布局状态。覆盖普通 / 大字、长文本、交叉分类、数量与名称同排、日期与管理、底部阅读与输入切换、无图及失败态。Page 数据已恢复，未调用业务写接口。

Mac 解锁后重新采集完成：`layout-review-picker.json` 包含菜谱、冰箱与买菜清单 22 个截图状态，`layout-review-details.json` 包含帖子详情和消息中心 15 个截图状态。均通过相关布局检查，涵盖普通 / 大字、长标题、分类、无图、图片失败、临期订阅状态、评论和发送状态。截图采用临时样例，Page 数据恢复；不代表真实接口或手机验收。预览最新分区已接入本轮图片，39 页面目录和原版对照继续保留。

帖子底部心形、收藏和评论复用 Lucide 图标；新增 `heart.svg` 与 `bookmark.svg` 来自 [Lucide 官方 heart](https://github.com/lucide-icons/lucide/blob/main/icons/heart.svg) 和 [bookmark](https://github.com/lucide-icons/lucide/blob/main/icons/bookmark.svg)，仅调整描边色以匹配现有主题，未添加运行依赖。

浏览器最新入口验收见 `gallery-layout-review-evidence.json`：桌面及 375px、320px 无横向溢出，临时视口已恢复，6 张本轮主图已加载，39 页面目录及原版入口仍可达。最终截图：`screens/gallery-layout-review-final.jpg`。本轮未再次编译全部 39 页面或运行后端测试。

未部署后端、执行数据库迁移或发送真实通知。前轮的临期提醒与食材照片依旧需部署联调；本轮仅修改显示层。复跑指定页面：

```sh
MEAL_UI_LAYOUT_EVIDENCE=layout-review-picker.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-picker.cjs recipes pantry shopping
MEAL_UI_LAYOUT_EVIDENCE=layout-review-details.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-all-pages.cjs pkg-extra/community/post-detail/index pkg-extra/me/notifications/index
```

## 2026-10-09：菜系、食材拍照、临期提醒与帖子详情

继续在同一 worktree 修改正式页面。修改前备份位于 `/var/folders/3y/jk4gpwpj34s6c6s76db7by600000gn/T/meal-ui-cuisine-expiry-20261009-eo7cnwq7`。

1. **菜系选择**：左侧新增“菜系 / 来源”切换，菜系和来源交叉筛选，切换分类方式保留另一维条件；列表真实出现的自定义菜系也可选择。耗时、人份继续在筛选区。
2. **食材拍照**：冰箱、买菜清单与菜谱用料复用同一照片编辑流程，支持拍照、从相册选择和恢复文字。没有上传或图片加载失败时显示食材名称；取消或上传、保存失败保留原照片。
3. **临期提醒**：每天中国时间 09:00 检查到期当天至未来 3 天的有日期库存，排除零、负数库存，按家庭汇总给有效成员。站内消息按用户、家庭与日期的数据库唯一键去重，可从消息打开冰箱。微信提醒沿用已有订阅机制，冰箱页只申请临期模板；未配置模板、拒绝授权、保存失败均有独立状态，一次订阅不显示为永久开启。
4. **帖子详情**：作者、标题、实拍、正文、关联菜谱、评论和底部互动分层。实拍改为大图滑动图集，显示图序，可点击放大；评论可定位，支持空态、加载失败重试和多行输入，评论失败保留正文。作者无实拍时直接呈现文字，不使用菜谱封面冒充作品照片。

帖子详情参考前轮核验的 [Cookpad 公开详情](https://cookpad.com/eng/recipes/25851126) 的作者、作品、正文、关联菜谱和评论层级，沿用现有点赞、收藏、举报与审核机制。

### 验证

服务端 `PantryReminderTests`、`IngredientPhotoTests`、`PantryMatchTests` 共 7 项隔离测试通过，不连接真实数据库或微信。小程序静态、交互阻断检查和 11 个逻辑回归脚本通过，新增 `ui-followup.test.js` 覆盖菜系与来源交叉筛选、拍照来源、临期模板授权、失败保留、消息路由与评论重试；已接入小程序 CI，远端 CI 未运行。

12 个 WXML / WXSS 文件局部编译通过。`followup-picker-layouts.json` 记录 21 个截图状态与 19 项检查；`followup-all-pages.json` 重采帖子详情、设置、消息中心共 12 个状态，并确认正式路由共 39 个。普通/大字、菜系与来源切换、无图食材、订阅一次/微信未开放、多图图序、无图帖子、评论空态和失败态均有证据。临时 Page 数据与 mock 已恢复，截图不代表真实业务联调。

代码与编译证据分别保存在 `followup-checks.json`、`followup-compile.json`。复跑：

```sh
/Users/xx/.local/opt/node22/bin/node miniapp/test/ui-followup.test.js
MEAL_UI_LAYOUT_EVIDENCE=followup-picker-layouts.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-picker.cjs recipes pantry shopping
MEAL_UI_LAYOUT_EVIDENCE=followup-all-pages.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-all-pages.cjs pkg-extra/community/post-detail/index pkg-extra/me/settings/index pkg-extra/me/notifications/index
```

最终浏览器验收见 `gallery-followup-evidence.json`：桌面、375px 与 320px 无横向溢出，39 个页面目录与 103 个独立截图引用无缺失。消息中心样例已修正并重新采集，断言临期消息分组后仍可见、查看冰箱按钮处于卡片内。桌面、手机及帖子/消息预览分别保存在 `screens/gallery-followup-final.jpg`、`screens/gallery-followup-mobile.jpg`、`screens/gallery-followup-detail.jpg`；`git diff --check` 通过，141 个已改与新增文本文件的凭据模式扫描无命中。

### 部署边界

本轮**没有执行数据库迁移、部署或重启后端，没有接受真实相机/订阅权限，也没有发送真实通知**。上线临期提醒前，先执行 `server/sql/migrate-pantry-reminders.sql` 补充通知去重列与唯一索引，再部署后端；定时检查可通过 `PANTRY_REMINDERS_ENABLED` 控制。

微信提醒还需在小程序后台申请字段为 `thing1` / `thing2` 的对应模板，配置 `WECHAT_SUBSCRIBE_TEMPLATE_PANTRY`，并由用户在微信中点击订阅授权。每次订阅只提供一次对应提醒额度；没有模板或额度时仍可接收站内消息。食材照片跨设备保存也仍需前轮 `server/sql/migrate-ingredient-photos.sql` 及后端部署联调。迁移和配置准备好后才能验收真实提醒与拍照上传。

## 前轮：11 处逐页标注

继续在 `codex/meal-journey-ui` 修改正式页面。修改前备份位于 `/var/folders/3y/jk4gpwpj34s6c6s76db7by600000gn/T/meal-ui-refinement-20261009-rb9z9krz`。

1. 菜谱列表：保留左侧来源栏，放大最左菜图，菜名、耗时、人份、简介、口味、来源、评分和点菜都收在右侧。新增“显示冰箱用料”本地偏好开关，状态来自真实库存匹配；接口未确认或前 10 道候选之外的菜不冒充“没有材料”，提示进入详情核对。
2. 做菜记录：放大成品图，右侧展示日期、掌勺人、评分与心得，保留再点和社区分享。
3. 社区动态：话题筛选前置，作者、作品图、标题、心得、关联菜谱和互动组成单列内容流；没实拍图就直接显示文字，菜谱封面只在关联卡里显示。
4. 做菜总览：左侧使用已点菜图，右侧放菜数、正在做、上桌比例和厨房入口。
5. 我的：使用已拉取的个人资料、今日菜单和家庭数据，新增六个常用工具入口和今日菜单图；“本月做菜”按记录日期统计，不使用累计偏好次数。
6. 买菜清单：大食材图在左，名称、数量、来源、库存说明和买好/移除操作都在右侧；保留已入篮和恢复待买。
7. 冰箱：图块、名称、数量和到期日期重新分组，匹配菜卡也统一左图右文。
8. 帖子详情：减小标题装饰，作者实拍、正文、关联菜谱、评论分区；长评论名与时间分行；分享首图优先作者实拍。
9. 厨房总控：扩大菜图和状态信息，把计时收进图片右侧，状态、剩余时间与暂停/换时长同组；底部独立开做/上桌，按钮保持触控尺寸。
10. 开通确认：改为套餐摘要、服务期、明细、微信支付方式与唯一底部按钮；删去虚构余额/银行卡状态和重复入口，功能关闭时按钮禁用。没有调用支付接口。
11. 食材清单：复用家庭食材图片和原有上传流程，支持添加、更换和恢复文字；照片同步失败不阻断菜谱、保留旧图，份量变化也保留照片。

库存共享判定同步排除已过期条目，详情、买菜与菜单使用同一口径。没有新增依赖。

社区参考（只读公开页面）：

- [下厨房公开作品流](https://www.xiachufang.com/activity/site/?order=pop)：作品照片、关联菜谱、心得、作者与互动计数的层级。作品详情重定向登录，未登录、未核验受限详情。
- [Cookpad 公开菜谱详情](https://cookpad.com/eng/recipes/25851126)：实际打开并查看了作者、说明、实拍、配料、步骤、Cooksnaps 与评论分区；借鉴信息层级，未操作收藏、关注或发布。

食材图片仍使用前轮准备的后端代码；没有运行数据库迁移或部署后端，跨设备真实上传仍待联调。截图使用临时样例，不代替业务接口验收。完整 39 路由、原版与前轮方向保留供逐页比较。

本轮原生验收记录了 **43 个截图状态、63 项布局与交互检查**：普通/大字、长菜名与食材名、空库存、加载失败、无图帖子、真实图片失败事件、运行/暂停计时和禁用支付按钮。12 个页面/组件的 WXML、WXSS 局部编译通过；静态检查和交互阻断检查通过。10 个逻辑回归脚本已通过，覆盖库存、随机挑菜、食材照片、导航、做菜完成与一致性、收藏封面、首页动线及社区分享。

证据文件：`refinement-compile.json`、`refinement-layouts.json`、`refinement-picker-layouts.json`、`refinement-all-pages.json`、`refinement-checks.json`。`refinement-resource-checks.json` 校验 39 个正式路由和 96 个独立截图引用，缺失为 0。全部截图临时 Page 数据和 wx mock 已恢复，未调用业务写接口。食材文字缩略图保留两行并避开加图标签，右侧展示完整名称；未提供步骤照片时不保留空图框。

本轮原生检查复跑（必须串行）：

```sh
MEAL_UI_LAYOUT_EVIDENCE=refinement-layouts.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-layouts.cjs cook record community me kitchen
MEAL_UI_LAYOUT_EVIDENCE=refinement-picker-layouts.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-picker.cjs recipes pantry shopping
MEAL_UI_LAYOUT_EVIDENCE=refinement-all-pages.json /Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-all-pages.cjs pkg-extra/community/post-detail/index pkg-extra/payment/checkout/index pkg-extra/recipe-detail/index
```

## 2026-10-09：最新 9 处反馈与全部页面目录

继续沿用原版、暖纸色和番茄红；本轮修改在同一 worktree，原工作区未编辑。

- **首页主推菜**：缩小大标题、分开简介与耗时/人份/口味小标签，重新采集普通与大字长菜名截图。
- **左侧来源 / 右侧菜卡**：左侧位置保留。右侧上半行放图片、菜名和耗时/人份；简介、口味、已有用料占整行，来源与评分和独立点菜按钮放下方。用料只有列表接口原本携带时展示。
- **随机与冰箱能做**：增加“冰箱现有”的名称/数量摘要，区分空库存、库存读取失败和菜谱匹配失败；库存成功但匹配失败时，库存摘要仍保留。推荐补简介与口味，下方继续显示可做菜列表。
- **库存与购物清单**：缩图改成可点的上传入口，未上传或加载失败用食材名称。数量靠右，保质期信息紧随名称；来源说明继续占整行。两页复用同一家庭食材照片映射，支持更换和恢复文字，失败保留原图。
- **社区**：画廊单独展示动态、详情、评论与多图。修正详情单张图片窄条与多图默认高度问题：单图占整行，多图为方格。
- **全部正式页面**：`page-catalog.json` 覆盖 `app.json` 的 39 个正式路由，分为点菜与备菜、做菜与记录、社区、家庭、账户与会员、我的与帮助；网页支持分组和搜索、点图查看原图。新增 25 个页面的原生截图和 6 个详情/表单状态；13 个已有页面复用本轮或前轮截图，旧记录入口注明跳转。新补页面标“原有布局”，供后续逐页标注，未宣称全部布局已修复。

会员、支付、手机号登录的正式功能开关仍关闭。截图时仅临时 mock 页面返回导航，结束即恢复，没有支付、发帖、创建家庭、登录或库存修改操作。邀请页用真实获取失败态展示，不生成演示邀请码。截图有临时样例，不能作为真实接口验收。

食材上传前后端代码已经准备好；复用已有选图、文件上传、上传归属校验、响应签名与入站路径归一。新表与迁移脚本为 `server/sql/migrate-ingredient-photos.sql`，家庭演示数据清理脚本同步包含照片关联。**没有执行数据库迁移、没有重启/部署后端，真实照片跨设备联调待部署后验收。** 未上传默认显示文字，新规则替代前轮本地食材照片映射。

本轮证据分别保留：`expansion-compile.json` 为 11 个模板/样式的局部编译；`expansion-picker-layouts.json` 为 28 个截图状态和 27 项布局/随机交互检查；`all-pages-evidence.json` 为补齐页面的 31 个截图状态与 26 项路由检查。以上均使用临时 Page 数据，结束恢复，无业务写操作。静态、交互、逻辑和后端隔离测试汇总见 `expansion-checks.json`；浏览器验收见 `gallery-expansion-evidence.json`。

新增复跑：

```sh
/Users/xx/.local/opt/node22/bin/node miniapp/test/ingredient-photo.test.js
/Users/xx/.local/opt/node22/bin/node miniapp/test/recipe-pick.test.js
/Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-all-pages.cjs
```

全页面脚本默认复用已捕获页面；需要重拍时在末尾指定正式路由，如 `pkg-extra/recipe-edit/index`。微信原生脚本必须串行运行，以遵守开发者工具限流。

## 前轮：14 处布局与 UI 打磨

沿用确认的暖纸色与番茄红，继续修改正式页面。

- **社区**：去重复统计和装饰标题，作者与时间合组；无图帖子直接排文字，关联菜谱与点赞、收藏、评论各有清楚的位置，举报仍可从卡片右上进入。
- **家人心愿**：折叠预览改为头像、两行菜名与点菜人，更多数量靠右；展开列表保留原有操作。
- **菜谱与随机推荐**：来源保留在左侧，右侧复用图片、两行菜名与独立加菜按钮；来源与模式使用浅色选中态，推荐卡收紧文案和按钮间距。
- **冰箱**：去页头重复统计，保留全部、临期、过期筛选；图片、名称、数量与日期占主要空间，编辑和删除收进每行管理菜单，删除保留二次确认。
- **一周菜单**：七日选择增加日期号，统计合为一张卡；午晚餐图文行更易读，空餐次用一行「还没安排 / 挑一道」入口。
- **买菜清单**：来源与库存说明单独占整行，勾选、图片、食材和移除各占独立位置；复用冰箱的原食材图片，无图用文字，不再把来源菜谱封面当食材图；已入篮与加购标题收紧。
- **导入与创建家庭**：导入页突出内容输入与解析动作；创建家庭将输入合为表单卡，头像、可选地区与加入入口统一对齐。
- **厨房总控**：菜名与状态放在图片右侧，计时和开做、上桌各占整卡宽度。
- **分步做菜**：顶部仅菜名、步数与返回；图片、正文和用料一起滚动，计时常驻底部、紧接翻步按钮；运行、暂停、其他步骤计时与长步骤均有独立验证截图。

本轮代码检查见 `polish-checks.json`，21 个模板/样式文件的局部编译见 `polish-compile.json`。原生截图采用临时样例，恢复 Page 数据，不调用点菜、库存删除、发帖或创建家庭等写接口；真实接口仍有网络失败，真机与完整联调未验收。

本轮静态检查、交互阻断检查及 8 个逻辑回归脚本通过。`polish-layouts.json` 与 `polish-picker-layouts.json` 共记录 40 个截图状态、67 项布局检查，覆盖普通/大字、长菜名、空态、失败态、图片兜底和底部计时。31 个相关源码与文档的凭据模式扫描无命中，`git diff --check` 通过。

画廊五个主页面切换、当前图片加载及 44 个本地截图引用的验收见 `gallery-polish-evidence.json`；本轮浏览器截图为 `screens/gallery-polish-final.jpg`。此前方向方案与原版对照继续保留。

## 前序：六处显示与布局反馈

- **家庭菜单**：菜数与已上桌数量合成一行，保留细进度条；缩小标题、动作区与菜品行之间的留白。
- **随机推荐**：缩短标题和库存文案、收紧图片与按钮间距；保留独立触控热区和大字排版。
- **来源位置**：两处标注统一为左侧「全部 / 自建 / 社区 / 导入 / 收藏」竖栏；右侧复用 recipe-card 的图文行卡，封面、两行菜名和加菜按钮并排。搜索与推荐仍在上方。
- **食材图片**：库存条目自带图片优先；番茄、鸡蛋、香菇使用本地原食材照片，缺图或加载失败显示食材名称。加工品不误配原食材图，切换筛选仍保留失败兜底；「家里已有」复用同一映射。素材许可与缩图说明见 `artifacts/ui-journey-2026-10-08/figma-prototype/assets/ingredients/README.md`（2026-11 起这几张图只给 Figma 原型用，已移出小程序包）。
- **一周菜单**：压缩统计和日卡间距，午晚餐标签与耗时放在菜名上方，长名允许两行，缺餐显示「待安排 / 去挑一道」，当前选择有描边；日期按本地日期解析。
- 顺手修正库存分组的调味分类 key，避免盐等条目在分组后被漏掉。

## 上一轮：随机挑菜、冰箱与四处布局反馈

- **随机点菜**：首页与菜谱库提供入口，先预览菜图、耗时和人份，可换一道，再加入当前餐次。遵守既有搜索、来源、菜系、耗时、人份和家庭忌口过滤；今日已点过的菜退出随机候选。加入失败保留推荐，连点复用现有防重。
- **冰箱能做**：只从服务端确认用量、单位齐全且没有缺料的菜里随机，临期食材优先；匹配失败明确显示重试。复用现有匹配接口的前 10 道候选，不是全菜谱无限随机。
- **库存与到期日**：显示全部、临期、过期数量；到期当天至未来 3 天为临期，已过期不参与推荐。库存同类按到期日排序，添加和编辑使用原生日期选择器，编辑支持清除日期；未填日期单独提示。
- **菜谱选择位置**：初版搜索与来源靠左，筛选与餐次选择靠右；本轮进一步改为左侧来源竖栏和右侧行卡。首页纵向菜卡保留右下「＋」，已选显示绿色勾。
- **空间与显示**：买菜清单把名称和数量并排，来源放下一行；冰箱把库存标题与添加入口合行；家人心愿改为分隔列表，长菜名两行、点菜人下一行，修改/移除收进更多菜单；首页常做菜新增搜索。

服务端 `EnhancedService.getPantryMatch` 新增过期剔除和临期排序，返回 `expiringIngredients`。代码已通过隔离测试，尚未部署或重启运行中的后端；新匹配规则需部署该服务端版本后才能在真实接口生效。

## 图片行为

- 首页点菜单与做菜列表展示对应菜图，真实菜谱封面优先，无封面时复用现有本地菜图匹配；首页和做菜列表保留加载失败兜底。
- 做菜记录使用记录携带的菜谱封面，无封面时使用菜名匹配的本地图。
- 社区作品图使用作者上传图片，关联菜谱封面放在独立菜谱卡；用户实拍加载失败时使用中性占位，不用本地菜图冒充实拍。
- 本轮未新增成品拍照或图片上传业务。记录卡的菜图可能是菜谱封面；已有社区发帖支持上传成品图。

## 六处反馈的验证记录

代码检查、编译和布局验证分别保留证据，不把临时样例截图当作真实接口验收。

该轮证据见 `density-checks.json`、`density-compile.json`、`picker-layouts.json`。全页面与上轮随机挑菜的检查仍保留在 `rollout-checks.json`、`compile-checks.json`、`picker-checks.json`、`picker-compile.json` 中。

- 该轮 `static-check.js` 通过：340 个文件、97 个 JS；主包约 1.48MB，extra 约 0.54MB，preview 约 0.2MB。既有运营者资料和发布域名占位由部署方填写。
- 该轮 5 个逻辑回归脚本通过：`home-journey`、`journey-navigation`、`recipe-pick`、`pantry-match`、`pantry-delete`。扩展已有测试覆盖原食材图、精确别名、失败兜底、调味分组和周菜单本地日期；交互体检阻断项 A=0。
- 该轮涉及的 10 个 WXML / WXSS 文件通过微信工具局部编译；添加图片错误处理 class 后另编译 pantry WXML 成功。此前 27 文件与上轮 10 文件编译另有记录。局部编译不等于发布或真机验收。
- `verify-picker.cjs` 重采首页、菜谱、冰箱和买菜页：21 张普通/大字与状态截图，包含紧凑菜单、左侧来源、随机换菜、空态与失败态、食材图与图片失败兜底、过期筛选、添加及编辑日期。使用临时 Page 数据并恢复，未调用业务写接口；通过原生组件查询检查图片、菜名、加菜按钮不横向重叠。
- `verify-layouts.cjs weekly` 重采该轮一周菜单普通/大字两张，展示长菜名和缺餐。`layout-evidence.json` 中其余 17 张仍属于此前全页面改版，未重复计为该轮验证。
- 上轮 14 个逻辑回归和服务端 10 项隔离测试的已通过记录保留，该轮未重新运行服务器测试。服务端新匹配规则尚未部署；真实接口仍有网络失败，手机真机与完整联调未验收。
- 画廊在 `#picker-update` 优先展示该轮细节，保留五个主页面、工具页、A/B/C/D 方案和原版对照。浏览器最终截图和资源加载检查另见 `gallery-density-evidence.json`。

## 复跑

```sh
/Users/xx/.local/opt/node22/bin/node miniapp/test/static-check.js
/Users/xx/.local/opt/node22/bin/node miniapp/test/home-journey.test.js
/Users/xx/.local/opt/node22/bin/node miniapp/test/journey-navigation.test.js
/Users/xx/.local/opt/node22/bin/node miniapp/test/recipe-pick.test.js
/Users/xx/.local/opt/node22/bin/node miniapp/test/cook-finish.test.js
/Users/xx/.local/opt/node22/bin/node miniapp/test/cook-consistency.test.js
/Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-layouts.cjs
/Users/xx/.local/opt/node22/bin/node artifacts/ui-journey-2026-10-08/verify-picker.cjs
```

原生布局脚本需先编译并打开 worktree，且 `Codex` CLI 客户端已获本机授权。脚本用运行时导航切页；`simulator_open_page` 会重新编译，重编译后自动化连接可能需要重新建立。可用 `MEAL_UI_LAYOUT_EVIDENCE=文件名.json` 写入独立证据索引，并在命令末尾给出页面名，只重采指定场景并保留其他证据：`verify-layouts.cjs` 使用 `record me family` 等，`verify-picker.cjs` 使用 `home recipes pantry shopping`。

画廊重新启动：

```sh
python3 -m http.server 8847 --bind 127.0.0.1 --directory artifacts/ui-journey-2026-10-08
```

截图按仓库规则不入 Git，可通过布局脚本重新生成。正式入口为 `pages/home/index`；历史方向预览为 `pkg-preview/journey/index?design=d`，参数 design 可取 a/b/c/d。

本轮修改保留在 worktree 中，未提交、合并或推送。远端 CI、上线部署与生产验证不在本次已完成范围内。
