# 小程序端 · 上线冲刺状态（2026-09-23）

> 归小程序端负责人维护。截图在 `artifacts/launch-2026-09-23/miniapp/`，测试日志 `00~02-*.txt`。

## M1 · 测试基线（12:06）

环境：本机**没有 node**（`command -v node` 为空，`~/.nvm`、`/opt/homebrew` 都没有）。
用微信开发者工具自带的 Electron 运行时当 node：
`ELECTRON_RUN_AS_NODE=1 /Applications/wechatwebdevtools.app/Contents/MacOS/Electron`（v22.16.0），
已建软链 `~/.local/bin/node` → 上面这行，所以 CI 里的命令可以原样跑。

九条门禁全部 exit 0（`miniapp/00-baseline-tests.txt`）：
static-check（主包 1.4MB/2MB、pkg-extra 0.56MB/2MB）· dish-logic · kitchen-logic · pantry-match ·
post-share · cook-finish · favorites-cover · interaction-audit（A/B/C 全 0）· ui-ledger。
static-check 的非阻断提醒是预期项（legal-config 两处 【】、env.js 的 trial/release 仍是 example.com）。

## M2 · DevTools 实机（12:07）

- `open_project_window --project miniapp --window-mode liteMode` → success，winId `s1`，**无需扫码**
  （`check_wechatide_status`：`versionRelation: equal`、`loginExpired: false`）。
- `simulator_refresh` → success，整包编译通过（后续每次改完都 refresh 过，最后一次 12:29 也通过）。
- 本地后端：复用前任 `target/*.jar`（未重建，避免与后端 worker 争抢 `server/`），
  `DB_NAME=fm_miniapp_db SERVER_PORT=18081 AUTH_DEV_OTP_ENABLED=true APP_SEED_DEMO_DATA=false`。
- 首屏报过 `home loadAll failed <网络请求失败>`：根因是**编译时后端还没起**，不是代码问题；
  重新 `loadAll` 后 `loadError=""`、`hasHomeData=true`。该错误态留证 `10-home-error-state.png`
  （离线空态 + 「重新加载」，文案与按钮都正确）。

### 自动化限制（重要，下一任别再花时间踩）

`automation_page_action --action querySelectorAll` **看不见自定义组件内部**：
`state-empty` 的 `.se-btn`、`recipe-card` 组件标签本身，query 全是 `[]`。
可用的三种操作方式：① 页面级 class（如 `.mh-load-error-btn`）② `callMethod` 调页面方法
（推荐，`addToToday` / `goAddRecipe` / `submitPost` / `buildShopping` 都这么触发的）
③ 坐标点击，换算 **CSS = 截图像素 ÷ 1.5154**（窗口 390×844，截图 591×1280；tabBar 在 y≈759，
五个 tab 的 x ≈ 39/117/195/273/351）。坐标点带 `catchtap` 的按钮有效，但**某些按钮点了没反应**
（`点菜`、`加菜单`、弹层里的`取消`），改用 `callMethod` 立刻成功——所以优先 `callMethod`。

## M3 · 三条主线实机走查（12:09–12:29）

家庭点菜：首页 hero →「加到菜单」→ 菜单页汇总（`25-menu-with-dish.png`：1 上桌菜 / 40 分 / 4 份 /
备菜进度 0/5）→ 菜篮子 5 样待买 →「一键生成购物清单」。
家庭做菜：菜谱库（16 道可点，`20-recipes.png`/`20b`）→ 菜谱详情（食材清单 + 家里有 0/5 +
把 5 样缺的加入买菜清单，`21-recipe-detail.png`）→ 加菜单 → 做菜模式（`33-cook-mode.png`：
「01 第一步」大字分步 + 每步食材 chip 带用量 + 计时 + 上一步/下一步 + `setKeepScreenOn`）。
采购清单（`31-shopping.png`：按品类分组「肉蛋水产/调味干货」、勾选、移除、每行标注「来自 糖醋排骨」、
顶部 0% 已买进度）。冰箱页（`32-pantry.png`，路由确认）。
社区：列表（`71-community-list.png`）→ 发帖层（`72-post-compose.png`）→ 发布成功
（`73-post-published.png`：「审核中」角标，游客发帖走人工审核）→ 帖子详情（`74-post-detail.png`）。
**console 全程只有 2 条错误**：首屏那次 `home loadAll failed`（后端未起）与刷新后同一原因的
`community loadPosts failed`；没有 JS 异常、没有 WXML 编译错误、没有接口 5xx。

### 逐页看下来的结论

- 信息层级：三件事都站得住——首页 hero 只放「一道菜 + 加到菜单」，「今天这一桌」紧跟其后；
  菜谱页「点到即做」置顶、底部常驻「今日餐盘 0 / 去点单」；做菜模式把当前步放到最大。
- 空/加载/错误态：首页、菜单页、社区页、帖子详情都有专门空态与错误态（不是白屏）。
- 断网态：后端停掉后的两屏（`10-home-error-state.png`、`74b-post-detail-report.png`）都是
  「图标 + 中文说明 + 重试按钮」，可读。
- 长文本/安全区/小屏：本次只在 390×844 一档看，长标题用 `clamp-2`/`ellipsis`；
  **深色档与小屏弹层内滚动未实测**（用户已列为真机暂缓项）。
- 点击区域：`interaction-audit` C 类 0 处（<88rpx 的可点类）。
- aria-label：交互体检通过；图标按钮（回顶/退出/取消关联）都带 `aria-label`。

## M4 · 上线合规（小程序侧）

| 项 | 现状 |
| --- | --- |
| 不强制登录可浏览 | ✅ 401 自动走 `/api/auth/guest`（`api.js` 119 行），首屏能直接看菜谱 |
| 隐私保护指引 / 权限被拒兜底 | ✅ `utils/privacy.js` 统一 `requirePrivacyAuthorize`；`utils/upload.js` 走 `chooseMedia` |
| UGC 举报入口 | ✅ 列表页与详情页都有（`reportCommunityPost` + 原因枚举 + 提交举报层），处置在 `/admin` |
| 内容规范提示 | ⚠️ **本轮补上**（`pages/community/index.wxml` 的 `.pf-hint`） |
| 用户协议 / 隐私政策入口 | ✅ `me/index`、`me/settings`、`me/about`、登录页都有 |
| 账号注销入口 | ✅ **M8 补上**（`pkg-extra/legal/deletion`，入口在设置页；不做自助注销） |
| 主包 ≤ 2MB | ✅ 1.4MB |
| COMMUNITY 开关 | ⚠️ **本轮补彻底**（见下），当前值 `true` |

### COMMUNITY 开关（个人主体 / 企业主体的分岔）

个人主体拿不到「社交-社区/论坛」类目，社区 UGC 必须整体下线。开关补到了 12 个入口：
社区首页（`onLoad`+`onShow` 双守卫）、帖子详情、收藏页、首页社区菜谱并流、菜谱详情
「大家晒的 + 晒我的作品」、厨房「晒到邻里厨房」、`utils/post-share.js`（所有「晒一晒」的唯一出口，
关闭时直接 reject）、以及原有的 tabBar / 通知 / 我的页收藏 / 文案常量。

实机验证（把 `features.js` 临时置 false → refresh → 截图 → 置回 true → refresh）：
`90-community-off-home.png`（tabBar 只剩 4 项、菜名来源标签从「社区」变「精选」）、
`91-community-off-recipe-detail.png`（「大家晒的」整块消失）、
直达 `/pages/community/index` 被 `leaveToHome` 弹回首页（路由实测 `/pages/home/index`）、
`92-community-on-home.png`（置回 true 后 5 个 tab 恢复）。
**当前 `miniapp/utils/features.js` 的 `COMMUNITY: true`（= 企业主体路线），与 HEAD 一致。**

## M5 · 修复清单（最小 diff，复用已有机制）

| 文件 | 改动 | 原因 |
| --- | --- | --- |
| `pages/community/index.js` | +`features` 引入；`onLoad`/`onShow` 守卫 | COMMUNITY 关闭时页面不可达（分享卡片/路径直达也挡） |
| `pkg-extra/community/post-detail/index.js` | +守卫 | 详情页能被分享出去，必须自查 |
| `pkg-extra/favorites/index.js` | +守卫 | 收藏页数据源就是社区帖子 |
| `pages/home/index.js` | 社区菜谱按开关并流 | 关闭时首页不该出现社区来源的菜 |
| `pkg-extra/recipe-detail/index.js` | 关掉时跳过 `getCommunityPosts`、`composeWork` 早退、+`showCommunity` | 请求与 UI 一起收 |
| `pkg-extra/recipe-detail/index.wxml` | 「大家晒的 + 晒我的作品」包 `<block wx:if>` | 同上 |
| `pkg-extra/kitchen/index.js` | `shareCooked` 早退、+`showCommunity` | 同上 |
| `pkg-extra/kitchen/index.wxml` | 晒入口 `wx:else` → `wx:elif` | 关闭时不渲染空动作行 |
| `utils/post-share.js` | 关闭时 `reject` | 所有「晒一晒」的唯一出口，兜住漏改入口 |
| `pages/community/index.wxml` + `.wxss` | 发帖层内容规范提示（`.pf-hint`，`--fs-cap` 字号 token） | UGC 提审要求发布前可见的规范告知 |
| `test/static-check.js` | +「社区开关覆盖面」12 项 | 守卫被顺手删掉时当场失败 |
| `test/post-share.test.js` | +第 ⑤ 组断言 | 关闭时不写交接单、不跳社区 tab |
| `utils/env.js` | **已 `git restore`** | 前任的联调地址（9088→18081），收尾还原；现为 `localhost:9088`，与 HEAD 无差异 |

有意的简化（`ponytail:` 口径）：社区开关只做到"入口隐藏 + 页面不可达 + 出口拒绝"三层，
**没有**在前端做内容过滤（机器审核依赖后端 msgSecCheck/imgSecCheck，处置依赖运营后台），
升级路径就是企业主体开类目后把 `COMMUNITY` 置回 `true`。

## M6 · 开源对标（只列有结论的）

已落地（本轮之前就有，实测确认）：做菜模式大字分步 + 计时器 + 屏幕常亮（`33-cook-mode.png`）；
采购清单按品类分组勾选 + 每行标来源菜（`31-shopping.png`）；菜谱详情按人数缩放用量
（`changeServings`，1 人份按钮实测可用）；「冰箱里有没有」与服务端扣库存同一口径
（`pantry-match.test.js` 钉住）。
上线后建议（改动大、不阻塞上线）：库存「现在能做什么」反向推荐（需要后端按库存交集算）、
做菜模式步骤内嵌视频/动图、周菜单按营养均衡自动配平、采购清单支持手动加自定义条目。

## M7 · 最终测试与收尾

`02-final-tests.txt`：九条门禁全部 exit 0（`features.COMMUNITY: true` 已还原）。
`miniapp/utils/env.js` 与 HEAD 无差异（`git diff --stat` 空）。
未动 `server/` 任何文件；未 commit/push；共享文件（CHANGELOG / LAUNCH-CHECKLIST）只做局部 StrReplace。

## 交接（阻塞项）

等用户提供信息：ICP 备案域名（`env.js` trial/release）、运营者姓名与联系方式（`legal-config.js`）。
需要用户拍板：① 主体是个人还是企业 → 决定 `COMMUNITY` 的取值（现在是 `true`）；
② 账号注销的处置口径（后端接口 + 承诺的 15 个工作日）。
需要后端：`handoff-to-backend.md` #1（自己「审核中」的帖子详情读不到）、#2（缺账号注销接口）。
> 12:22 后端回执（`handoff-to-miniapp.md`）已到：它为「删除库存改 404 语义」与「注销缺入口」两件事给出配合要求，
> 但**回执里没有 #1/#2 的编号条目**（后端当时读到的是更早的版本，回执里写「那份文件里只有表头」）。
> 本轮已按回执做完 M8 的两件事；#1（PENDING 帖详情）未收到正式回执。

## M8 · 收尾：注销入口 + 删除库存 404 语义（12:31–）

后端 12:22 的回执要的两件事，本轮都落到了共享位置，没有在调用点各打补丁。

- **注销入口**（合规硬项）：新增 `pkg-extra/legal/deletion/`（js/json/wxml/wxss，wxss 只 `@import` 隐私政策的样式，
  不复制第二份），路由登记进 `app.json` 分包；`pkg-extra/me/settings` 的「关于」组加一行
  「注销账号」（`icon: 'del'` → 「销」字图标，沿用既有字符图标机制）；隐私政策的「数据保留」一段
  补了「我的 → 设置 → 注销账号」这条路径。页面四段说明 + 底部运营者联系方式（`legal-config.js` 单一来源，点击复制）。
  **不做自助注销**：前端提交 + 后端端点属于要拍板的产品项，与后端回执一致。
- **删除库存 404**：只改 `utils/api.js` 的 `deletePantryItem`（两处调用点的共同出口）——
  404 视为「已被删除」按成功返回，并标 `silent` 防止 api 层先弹服务端 404 文案；
  500/断网照旧抛出，调用方原有的 `catch` 提示不变（失败提示由两条收敛成一条）。
- **防回归**：新增 `test/pantry-delete.test.js`（wx 打桩，4 组断言：200 正常删 / 404 不 reject 且零提示 /
  500 仍抛且 `err.status=500` / 断网 status 0 不被吞），已挂 `miniapp-ci`。
- **门禁**：`miniapp/03-final-gates.txt` —— 十条全绿（原九条 + 新增的 pantry-delete），
  static-check 仍只报预期的 4 条部署方占位提醒（legal-config 两处 【】、env.js 的 trial/release 域名）。
  `miniapp/utils/env.js` 与 HEAD 无差异（`git diff --stat` 空）。
- **未做**：DevTools 实机截图。本轮 `wechatide -c ide check_wechatide_status` 卡在
  `toolCall:auth` pending（需用户在授权卡片上点一下），按约定不轮询、不反复重试；
  注销页的视觉只过了静态检查（页面四件套齐全、WXSS 配平、跳转路径已登记、bind 处理函数存在）。
  **授权一到位就该补的截图**：`43-settings-deletion-row.png`、`44-deletion-page.png`（含占位文案现状）。

## M9 · 后端 #1 定性后的小程序侧收口（13:08–）

后端回执（`handoff-to-miniapp.md` 顶部「编号回执」）把 #1 拆成两半：后端那半是
「详情判据与取行判据打架 → 200 + 空 body」（已改成 404 + 文案）；剩下一半在小程序侧，本轮做完。

- **共享层：2xx 空 body 不再被当成「内容没了」**（`utils/api.js`）：新增
  `emptyReadMessage(result, config)`，`request()` / `requestStrict()` 在 **GET** 拿到
  `null / undefined / ''` 时按失败处理，文案「数据异常，请重试」；`fallback` 语义保留
  （`getCurrentUser` 仍返回 null）。**只对 GET 生效**：写/删接口返回 204/空 body 是常态，
  空数组 `[]`、空对象 `{}` 也不算异常（后端实测空列表就是 `[]`，2 字节）。
- **缺 postId 不再发那个"假装是 404"的请求**（`pkg-extra/community/post-detail/index.js` 的 `onLoad`）：
  直接 `loadError + loadErrorDesc='这个链接缺少帖子编号，请从社区列表重新打开'` 并 return，
  不发 `getCommunityPost('')`。
- **空态文案不再冤枉用户**（`index.wxml` 的 `state-empty`）：兜底标题
  「暂时看不到这条分享」、说明「可能还在审核，也可能是网络问题，稍后再试一次」，
  替掉原来的「帖子不存在或已删除 / 可能已被作者删除」。
- **#1 验收（后端 #1 的验收条件，实测）**：`/tmp/fm-server-miniapp` rsync 最新 `server/` 后重建 jar
  （`mvn -DskipTests package`），18081 + `fm_miniapp_db` + `AUTH_DEV_OTP_ENABLED=true` +
  `APP_SEED_DEMO_DATA=false`。游客登录 → 无图纯文字发帖 → 列表出现 → 作者本人 `GET /api/community/posts/{id}`
  **200**（`mine:true`、`auditStatus:PENDING`、正文在）；匿名同名请求 **404**；不存在的 id **404 + 文案**
  （不再是 200 空 body）。证据 `miniapp/60-post-detail-pending-verify.json`。
  另外把 `api.js` 里全部 23 条 GET 端点对着本地后端扫了一遍，**没有一条返回空 body**
  （`miniapp/61-get-empty-body-smoke.json`），确认新口径不会误伤现有接口。
- **防回归**：新增 `test/api-empty-payload.test.js`（wx 打桩 4 组：GET 空 body 必 reject 且带文案 /
  空数组与空对象放行 / DELETE 空 body 照旧 resolve / 声明 fallback 的读接口仍走默认值），已挂 `miniapp-ci`。
- **门禁**：`miniapp/04-final-gates.txt` —— 十一条全绿（原十条 + api-empty-payload）；
  static-check 仍只报预期的 4 条部署方占位提醒。`miniapp/utils/env.js` 与 HEAD 无差异。
- **未做**：仍无 DevTools 实机截图。`wechatide -c ide check_wechatide_status` 这次新开了一个
  `toolCall:auth` task（`auth_74e8e347...`）仍是 `pending`，按约定只查一次、不轮询。
  **授权到位后要补的截图**：`43-settings-deletion-row.png`、`44-deletion-page.png`、
  `75-post-detail-own-pending.png`（作者看自己「审核中」帖，替代上轮那张误导性的 `74b`）、
  `76-post-detail-missing-postid.png`（缺 postId 的新提示）。
