# 上线清单（个人主体版）

> ## 接手须知（2026-09-19 第六轮更新：转入「全链路实操 + UI 细节管理」，共 8 轮 R1~R8）
>
> **本轮的取向（owner 定的四条，别再重新问）**：
> ① UI 手腕＝**按视觉角色收敛**——不做 `--sp-*` 全量替换（实测 37 页里 0 页用它、硬编码 rpx 共 3482 处、
> 裸圆角 158 处，而 6 档 token 覆盖不了 20/28/36rpx 这些众数值，等于在零视觉断言下重做 1.3 万行样式）；
> ② 后端＝**用户可感知项 + 索引/执行计划全做**；③ 做菜主线＝**照成熟菜谱 App 惯例补齐交互**；
> ④ 深色/小屏＝**模拟器能逼近多少算多少，逐项标注证据边界**。
> owner 同时明确：备案域名 / 运营者信息 / 短信网关 / 生产库迁移 / 真机三项**继续推迟**，本轮不碰。
>
> **R1~R8 全部完成**（八轮：止血状态缺陷 → 图标标准 → UI 台账与规格表 → 做菜计时/跳步 →
> 端到端与弹层/深色取证 → 后端读路径与执行计划 → 写路径竞态与 404 语义 → 购物清单 N+1 与时钟口径）。
> 证据在下面「第六轮 R1 … R8」八张表里，每行都写了"怎么量的、修复前测到什么、修复后测到什么"。
> 当前门禁：`miniapp-ci` 五条步骤（静态检查 21 项 + 两份纯逻辑 + 交互体检 + UI 台账）、
> `server-ci` **188 项**（181 + 本轮新增 7）。
> 仍要 owner 做的：上线六项（备案域名 / 运营者信息 / 短信网关 / 生产库三条迁移 / 真机三项 / 两条收尾）
> ＋ 本轮新增两条待决（浅色档金色小字要不要压暗、做菜进度段要不要给可点提示）。
>
> ⚠ R2 把一条计划里的判断**推翻了一半**：被列成"文字当图标"违规的 8 处里只有 2 处（kitchen 的 💡🎉）
> 是真违规，`❝ ⤴  ★ ✦` 都是默认文字呈现的 BMP 字符、本来就能着色；首页 hero 的「买」「谱」判定为**保留**。
> 理由与判据写在 R2 那张表里，owner 要翻案看同一行。
>
> **当前状态（刚核过，不是回忆）**：`git log origin/master..HEAD` 为空、工作区无改动；
> `server-ci / build-and-test` = success（**30 个测试类 / 181 项**，全新 MySQL 库）、
> `miniapp-ci / static-check` = success（四条前端门禁，静态检查编号到第 **20** 项）。
> ⚠ `miniapp-ci` 只有**一个 job 名**却按顺序跑完四条门禁（static-check / dish-logic / kitchen-logic / interaction-audit），
> 别看到只有一个 check 名字就以为只跑了静态自检。两个 workflow 都带 `paths` 过滤
> （`miniapp/**` / `server/**`），所以**纯文档提交不触发任何 run 是正常的**，不是漏跑。
>
> push 的完整可复现命令（**必须先清空凭据助手列表**，否则 git 全局 `osxkeychain`
> 会优先返回补 `workflow` scope 之前的旧 token，继续被 remote 拒绝）：
> ```
> git -c credential.helper= -c http.proxy=http://127.0.0.1:7897 \
>     -c https.proxy=http://127.0.0.1:7897 -c http.version=HTTP/1.1 \
>     -c credential.helper='!gh auth git-credential' push origin master
> ```
> 改 `.github/workflows/**` 时 `gh` 的 token 必须带 `workflow` scope：
> `gh auth refresh --hostname github.com --scopes workflow`。本轮没动 workflow 文件。
>
> ### 后面上线**只差 owner 的动作**，代码侧我能做的都做完并推上去了
>
> 按依赖顺序，每条都给了可直接抄的命令/文件位置：
>
> 1. **ICP 备案域名** → 填 `miniapp/utils/env.js` 的 `trial` / `release`（现在还是 `https://test-api.example.com`
>    与 `https://api.example.com`，CI 每次点名），并同步小程序后台的 request/uploadFile 合法域名。
> 2. **运营者姓名 + 联系方式** → 填 `miniapp/utils/legal-config.js` 的 `operatorName` / `operatorContact`
>    （现在是 `【请填写运营者名称】` / `【请填写联系方式】`，带占位符提交会被驳回）。
> 3. **真实短信网关** → 后端环境变量 `SMS_PROVIDER`（现在 `noop`）。不接则**谁也绑不了手机号**，
>    `/admin` 只能靠 `ADMIN_BOOTSTRAP_TOKEN` 引导登录（见 §6.1）。
> 4. **生产库执行三条迁移**（存量库才需要；全新库由 `schema.sql` 直接建全）：
>    ```
>    mysql -u<user> -p <prod_db> < server/sql/migrate-import-source-index.sql
>    mysql -u<user> -p <prod_db> < server/sql/migrate-post-feed-index.sql
>    mysql -u<user> -p <prod_db> < server/sql/migrate-cook-history-family-index.sql
>    ```
>    三条都是幂等写法（`CREATE TABLE IF NOT EXISTS` / `information_schema` + `PREPARE`），重复执行安全。
> 5. **真机三项**：相册授权弹窗、深色模式整体回归、小屏弹层内滚动。
>    模拟器都给不了证据：相册是原生面板够不到；`simulator_refresh` 不重读 `theme.json` 所以深色只能算对比度；
>    小屏只能靠真机手感。**这三条别用模拟器结论冒充已验**。
> 6. **两条本轮新留的收尾**：① 登录状态下打开一次 `…/issues/new/choose`，确认「问题反馈 / 功能建议」
>    两个模板显示出来（匿名访问会 302 到登录页、`community/health` 接口 404，本机无法机器确认）；
>    ② `GET /api/recipes`、`/api/recipes/filter`、`/api/me/favorites` 三个列表**没有 LIMIT**，
>    但前端「菜谱」页拿整份列表做本地搜索/筛选，加 LIMIT 会改坏功能——要连着前端分页一起改，属功能改动。
>
> ### 本轮（第四、五轮）做完的事，详细证据在 §3 走查表与 §3b 后端审计
>
> 大字模式 37 页全量接线（实测 64.98px vs 55.86px，缺口钉成 CI 失败）；社区发帖端到端实测；
> 社区/成员/反馈/导入四页的加载-失败-空态统一（含**「加载失败」冒充「还没有数据」同类 3 处**，钉成 `static-check` 第 16 项）；
> 忌口过滤在服务端**永远不可能命中**已修（词典两端一致性由测试直接读 `constants.js` 守住）；
> 买菜清单重建的确认文案说反了已改正并钉测试；**做完菜按用量回写冰箱**（ADR-0009 方案 A，
> 实测 `鸡蛋 8→6`、单位不符不扣、扣光即删行，且下游「现在能做」跟着掉出去）；
> 首页看板不再捞 100 条帖子只为展示 4 条（通用查询日志实测 `LIMIT 4`）；
> 用例顺序依赖修掉一处并把「反序全量」写进 README 验证步骤（现 **181 项**）；
> 补 `SECURITY.md` / Issue 模板 / `CHANGELOG.md`；做了一次**全新库首跑彩排**（空库核心端点全 200）。
>
> ### 以下两段是**更早轮次的记录，状态已作废**，保留只为留住那两条教训
>
> ~~本地 `master` 领先 `origin/master` 21 个提交；这台机器三条凭据路径都实测不通
> （keychain 无 `github.com` 条目、无 `gh` 登录、`ssh -T` publickey 拒绝）。~~
> → 现已 `gh` 登录 + 代理推送成功，工作区干净、`git log origin/master..HEAD` 为空。
> **仍然成立的两条事实**：直连 GitHub 会 `Recv failure: Operation timed out`，**必须走本机代理**；
> 本机没有 SSH 私钥，换 SSH remote 这条路不通。
>
> **下一步：push，但它现在被一条 GitHub 规则挡住。**
>
> 2026-09-19 实测过程：`gh auth login` 已成功（账号 feng-qinxiang），但
> `git push` 被远端拒绝：
> ```
> ! [remote rejected] master -> master (refusing to allow an OAuth App to create
>   or update workflow `.github/workflows/miniapp-ci.yml` without `workflow` scope)
> ```
> 原因：**凡提交里改动了 `.github/workflows/**`，token 必须带 `workflow` scope**。
> `gh` 默认只申请 `repo / read:org / gist`，所以 22 个提交整体被退回（不是部分失败）。
> 也解释了为什么 9/13 那次推送没事——那次没碰 workflow 文件。
>
> 另外两个环境事实（都实测过，别再重新试）：
> - 直连 GitHub 会 `Recv failure: Operation timed out`，**必须走本机代理**：
>   `git -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 -c http.version=HTTP/1.1 ...`
> - 本机没有 SSH 私钥（`ssh -T git@github.com` → `Permission denied (publickey)`），
>   所以换 SSH remote 这条路不通。
>
> **两条可选路线**：
> 1. 给现有 token 补 scope（已在 Safari 开过授权页，设备码 15 分钟有效）：
>    `gh auth refresh --hostname github.com --scopes workflow`
>    然后 `git -c http.proxy=... -c credential.helper='!gh auth git-credential' push origin master`
> 2. 用带 `workflow` 权限的 PAT，或直接用 GitHub Desktop / 你平时推代码的工具推送。
>
> **push 之后必须回答的两个问题**（在此之前，本清单里所有"CI 已校验"的说法都不成立）：
> 1. `server-ci` 是否转绿？根因已定位为时区（JDBC 钉 `serverTimezone=Asia/Shanghai`
>    使 MySQL 会话在 +08:00，而 CI runner JVM 在 UTC；过期时间曾由 JVM 时钟写、
>    由 SQL `NOW()` 校验 → 会话与验证码"一建立就过期"）。已在未修复的 `origin/master` 上
>    用 `TZ=UTC` 复现出与 CI 同签名的失败（139 项 4 失败），修复后 153 项全绿。
>    **若仍红**，就去 Actions 取「Build and run tests」的日志——本机无法复现的原因已排除，
>    剩下的差异只可能在 mysql:8.0 / JDK 17。
> 2. `miniapp-ci` 是否**第一次真正执行**四条门禁？GitHub 上那份 YAML 至今是坏的
>    （`did not find expected key ... line 18 column 5`），所以历史上它的 job 列表为空、
>    等于小程序零自动化把关。修好的那份在这 21 个提交里，没 push 就不生效。
>
> **仍然卡在部署方手上、代码无法代劳的**：ICP 备案域名（`miniapp/utils/env.js`）、
> 运营者姓名与联系方式（`miniapp/utils/legal-config.js`）、真实短信网关
> （不接则谁也绑不了手机号、`/admin` 进不去）、生产库执行 §7 列的两个迁移脚本、
> 真机三项（相册授权弹窗、深色整体回归、小屏弹层内滚动）。
>
> 其余细节见 §7「CI 的真实状态」、§8 逐条清单，以及「跨家庭数据隔离（IDOR）实测结论」。


> **当前就绪度（2026-09-19 自动走查 + 加固后）**
>
> 已验证：37 个注册页面全部在模拟器实际打开过；点菜→清单、做菜（详情→步骤→记一笔→记录）、
> 社区（发帖/待审隔离/举报入口/分页）、家庭（创建/邀请码/加入/成员）、导入、周菜单、反馈、通知
> 均端到端跑通；后端 153 项测试 0 失败；三份 workflow YAML 经自检脚本校验。详见 §3 走查结论表。
>
> 同日二次复核（对着**当前工作区**重跑，非引用上次结论）：后端 `mvn verify` 25 类 / 153 项 / 0 失败 0 错误
> （连真实 MySQL，surefire 报告为准；**在 `TZ=UTC` 与默认 `+08:00` 两种时区下各跑一遍都全绿**——
> 前者曾暴露 4 项 OTP/登录失败，根因是过期时间用 JVM 时钟写、却用 SQL `NOW()` 校验，已修）；四条前端门禁全绿（static-check 285 文件、交互体检 A/B/C 均 0）；
> 做菜链路再走一遍并落库验证（`cook_history` 新增行含 recipe/user/family/score，验完已删）；
> `utils/capsule.js` 的运行时覆盖已实测生效（菜单 hero 顶距由 CSS 兜底 136px 被改为胶囊下缘 91px）。
> 本轮新增：`static-check` 第 10 项「require 目标必须存在」，并用移走 capsule.js 的方式实测其能阻断 CI。
>
> **提交状态（2026-09-19）**：上述改动已 `git add -A` 全量提交（含 9 个未跟踪新文件），
> 工作区干净；但**尚未 push**——这台机器没有 GitHub 凭据，`gh auth login` 的设备码流程
> 直连 GitHub OAuth 端点会超时，需带 `HTTPS_PROXY=http://127.0.0.1:7897` 走本机代理，
> 并由部署方在浏览器里输入一次性代码。**在 push 成功之前，GitHub Actions 仍然从未在本轮代码上跑过，
> §8「工作区已提交」这条只能算完成一半。**
>
> **另需注意（历史坑）**：曾有 9 个未跟踪文件被**已跟踪代码**依赖，
> 只 `git commit -am` 会得到一个「编译即失败」的 commit（详见 §8 第一条清单）。
>
> 仍卡在部署方（也就是你）手上的三件事，代码侧无法代劳：
> ① `miniapp/utils/env.js` 的 `trial`/`release` 换成已备案 HTTPS 域名；
> ② `miniapp/utils/legal-config.js` 的 `operatorName` / `operatorContact` 两处 `【】` 填真值；
> ③ 接入真实短信网关（`SMS_PROVIDER`），否则谁也绑不了手机号、`/admin` 进不去。
>
> 仍需真机才能确认的三项：相册选图与隐私弹窗、深色模式整体回归、小屏弹层内滚动。
>

代码已按个人主体裁剪完毕（支付/手机号登录用开关隐藏，主包 < 2MB）。
**社区（邻里厨房）保留上线**：发帖/评论已接微信 msgSecCheck 机审 + 站内举报人工审核队列双重机制。
以下是**提审前必须人工完成**的运营侧事项，按顺序执行。

## 1. 服务器与域名（硬前提）

- [ ] 购买服务器 + 域名，域名完成 **ICP 备案**（1~2 周，最早启动）
- [ ] 域名配置 HTTPS 证书（微信强制，Let's Encrypt 免费证书即可）
- [ ] 部署后端（MySQL + Java 17 运行 server），确认公网可访问
- [ ] 替换 [miniapp/utils/env.js](../miniapp/utils/env.js) 中两处占位域名：
  - `trial`（体验版）: 当前值 `https://test-api.example.com` → 你的真实域名
  - `release`（正式版）: 当前值 `https://api.example.com` → 你的真实域名

> 注意：占位值是 `example.com`（**不是** `familymenu.com`，旧文档写错了）。
> 另外 `project.config.json` 里的 `urlCheck: false` 只影响开发者工具，
> 真机/体验版仍然按微信后台配置的服务器域名校验，改完 env.js 记得同步后台白名单。

### 后端环境变量清单（部署时设置）

| 变量 | 说明 | 必填 |
| --- | --- | --- |
| `WECHAT_APP_ID` | 小程序 AppID | 是（微信登录依赖） |
| `WECHAT_APP_SECRET` | 小程序 AppSecret | 是 |
| `DB_HOST` / `DB_PORT` / `DB_NAME` | MySQL 连接 | 是 |
| `DB_USERNAME` / `DB_PASSWORD` | MySQL 账号（**改掉默认 123456**） | 是 |
| `UPLOAD_DIR` | 上传文件目录（建议绝对路径） | 建议 |
| `UPLOAD_ACCESS_SECRET` | 上传文件访问签名密钥。**prod 留空会启动失败**（否则 `/uploads/**` 等于公开可长期访问的家庭实拍）；本地留空则整套签名自动关闭 | prod 必填 |
| `UPLOAD_LINK_TTL_SECONDS` | 图片链接有效期，默认 604800（7 天）。设太短会让用户停留在旧页面时图片成片裂开 | 否 |
| `WECHAT_PAY_MOCK_ENABLED` | 模拟支付开关，**生产严禁设置** | 否（默认关） |
| `AUTH_DEV_OTP_ENABLED` | 调试验证码开关，**生产严禁设置** | 否（默认关） |

## 2. 小程序后台配置（mp.weixin.qq.com）

- [ ] **服务类目**：选择个人主体可用类目，建议「生活服务 > 百科资讯」或「工具 > 效率」
      （菜谱类内容个人主体可选「餐饮 > 菜谱」需核实当前开放情况）
- [ ] **社区 UGC 合规**：带用户发布内容，审核时可能要求补充说明内容安全机制——
      答复口径：发布时接入微信官方 msgSecCheck 文本机审（违规拒发）+ 站内举报与管理员审核队列（人工下架）。
      注意 msgSecCheck 依赖 AppSecret，服务端必须配置 `WECHAT_APP_ID`/`WECHAT_APP_SECRET` 机审才生效
- [ ] **request 合法域名**：添加你的 API 域名（开发 > 开发管理 > 开发设置 > 服务器域名）
- [ ] **uploadFile / downloadFile 合法域名**：同上添加（图片上传下载用）
- [ ] **用户隐私保护指引**（设置 > 服务内容声明）：必须声明以下三项，否则接口会被微信拦截：
  - 「选中的照片或视频信息」—— 用于：菜谱封面/步骤图上传、头像上传、反馈截图
  - 「剪切板」—— 用于：复制/粘贴家庭邀请码
  - 「微信昵称头像」—— 用于：微信登录后展示昵称与头像
      页面内对应文案已写在 [miniapp/pages/legal/privacy/index.js](../miniapp/pages/legal/privacy/index.js)，
      后台声明的项必须与它一致（少一项会被拦）。
- [ ] 完善小程序名称、头像、简介（避免"点菜"字样引起"餐饮服务"类目误判，可用"家庭菜谱"表述）

## 3. 提审前自测（体验版）

- [ ] 微信开发者工具「上传」生成体验版，真机扫码回归：
  - [ ] 微信一键登录 + 游客模式都能进入首页
  - [ ] 登录页**没有**手机号登录/注册入口
  - [ ] 我的页**没有** VIP banner；**有**社区菜谱入口且能正常进入
  - [ ] 社区发帖/评论正常（服务端配好 AppSecret 后发一条测试内容确认机审链路不报错）
  - [ ] 首页/菜谱/冰箱/菜篮子核心流程可用（增删菜谱、点菜、生成购物清单）
  - [ ] 图片上传（菜谱封面）正常，隐私弹窗出现后同意可继续
- [ ] 检查体验版请求走的是 `trial` 域名且 HTTPS 正常

### 模拟器走查结论（2026-09-19，Qoder 自动走查 + 手工操作）

以下在**微信开发者工具模拟器**上真机操作验证通过，**不等于**体验版真机回归（真机仍须单独做）：

| 项 | 结果 | 证据 |
| --- | --- | --- |
| 游客会话进入首页 | ✅ | 自动取游客 token，首页有真实数据 |
| 登录页无手机号入口 | ✅ | `features.PHONE_LOGIN=false` + `wx:if`，且 `auth/login-phone` 页已加开关守卫，直连被弹回首页 |
| 我的页无 VIP banner | ✅ | 页面仅家庭统计与做菜记录；VIP/支付 5 个页面直连全部被弹回首页 |
| 社区发帖 → 先审后发 | ✅ | 发帖落库 `audit_status=PENDING`；作者可见并带「审核中」角标，他人接口只返回已过审帖 |
| 点菜 → 购物清单 | ✅ | 连点 3 次「加到菜单」菜单仍 1 条（幂等），清单自动派生 3 项并回指来源菜谱 |
| 做菜全流程 | ✅ | 菜谱详情 → 做菜模式 1~5 步 → 完成·记一笔 → 做菜记录页 |
| 做菜换步后步骤正文回到顶部 | ✅（修复后） | 原实现把 `scroll-top` 恒绑成字面量 `{{0}}`：值不变就不下发，所以**从第二步起换步仍停在上一段的滚动位置**，长菜谱的新步骤开头在屏外。改为绑 `stepTop` 并在 `gotoStep` 里 0/0.01 交替（0.01px 被渲染层夹回 0，两档观感都是顶部，但每次都是「值变了」）。实测连点 gotoStep(1/2/3) → stepTop 依次 0.01/0/0.01 |
| 新建菜谱 | ✅（修复后） | 曾前后端校验不一致：后端 `tasteTags @NotEmpty`、前端不校验且把 400 吞成「创建失败，请重试」→ 已修，实测创建成功 |
| 家庭邀请 → 加入 | ✅ | 输码预览「周末厨房」→ 申请加入 → `familyId` 变更、成员表新增 ACTIVE 行、跳转成员页 |
| 导入配方 → 解析 → 存入菜谱 | ✅ | 点「填入示例」→「开始解析」得 5 食材/4 步骤 → 「存入我的菜谱」：菜谱 17→18（`id=110, sourceType=imported`），并在 `import_source` 落一条 `PENDING` 进后台待审队列 |
| 周菜单重新生成 | ✅ | `POST /api/weekly-menu/generate` 返回 7 天、每天 2 道不重复；页面确认框文案如实说明"覆盖当前这一版" |
| 意见反馈提交 | ✅ | `feedback_ticket` 落库：`user_id/family_id/types_json=["feature"]`、内容原样、`status=OPEN`，后台工单队列可见 |
| 通知全部已读 | ✅ | 点「全部已读」后 `/api/notifications` 3 条未读归零 |
| 上传→展示闭环 | ✅（服务端侧） | 用接口真实上传一张 PNG（`/uploads/xxx.png` 直接 200）→ PUT 设为菜谱封面 → 详情页显示的正是这张上传图。**注意**：修 `recipeDishImg` 之前，菜名含「番茄/紫菜/土豆」等关键词的菜谱会永远显示库存图而非用户实传封面 |
| 冰箱「还剩几天」算错（差一天，且到期当天被判已过期） | ✅（修复后） | 实测拿当天与前后日期喂页面自己的 `daysLeft`：旧实现是 `floor((到期日 0 点 − 现在)/86400000)`，同一天上午算 0、下午算 -1。**修复前**：到期=今天 → `-1`「已过期，尽快处理」（今天其实还能吃，等于让用户扔掉好食材）；到期=明天 → `0`「还剩 0 天」；+5 天 → 报 4 天，**每个数都少一天**。而且「临期待用」判据是 `days>=0`，所以到期当天的食材根本不计入临期数。改成两边都归到当天 0 点再 `round` 相减（日历日差），并给 `days===0` 单独一句「今天就到期，先用」。修复后实测：昨天→-1 已过期、今天→0 今天就到期、明天→1、+5→5。同类问题在「我的」页做菜时间的 `formatCookedLabel` 一起修了（昨晚 22:00 做的菜，今天早上按 24 小时差算成 0 → 标「今天」，现按日历日算）。⚠ 两处都是 Page/文件内函数、没法被 `miniapp/test/*.test.js` 直接 require，所以靠模拟器实测 + 本页记录，不是漏写测试 |
| 大字模式（无障碍 `font_scale=lg`）整体回归 | ✅ 模拟器实测 | 这一档以前**从没验过**。实测方法：`wx.setStorageSync('font_scale','lg')` 后重开页面，并读页面 `data.fontScale` 确认模式**真的生效**（不确认就会拿一张普通截图当证据）。看过社区首页（副文案换两行、统计卡、feed 卡、自定义 TabBar 标签一起放大）、做菜模式（11 个食材标签 + 69 字长步骤文案，行高与滚动区都正常、无溢出无裁切）、餐桌页。**结论：没有发现需要修的布局问题**——`--fs-mul: 1.15` + token 各自 lg 值这套设计是成立的。⚠ 截图对比看不出 15% 的字号差，别拿"看起来一样"当"没生效"或"没问题"的依据。 |
| 三处 hero 标题换行后两行字互压 | ✅（修复后） | `line-height < 1` 是给单行展示字定的，但这三处会换行：登录页 hero 有硬换行 `.br`（永远是两行，审核员看到的第一屏）、菜谱详情页绑 `{{recipe.title}}` 且无 nowrap/clamp（实测 19 字菜名换三行、整块认不出来，而首页 hero 早就有 nowrap + 分档缩字号兜着）、我的页绑 `{{familyProfile.familyName}}`（家庭名可在家庭管理里改）。分别改为行高 1.06 / 1.14+最多三行 / 1.1+最多两行。**已钉成 `static-check` 第 13 项**（line-height<1 且该类在配套 WXML 里绑动态文本、又没 nowrap/line-clamp 即失败），反向验证过：塞回原来的 0.92 规则 → 点名 `.mag-hero-title` 并 exit 1；当前树 0 命中。 |
| 品牌色底上的图标在深色档变深灰（系统性一处规则用错） | ✅（两轮共 8 处 / 13 条声明） | 图标画在**品牌色填充**（`--pop` 红 / `--anchor`）上时，描边用的是 `--c-surface`——它是「页面底色」token，浅色档 #ffffff、**深色档 #242424**，于是红底上的加号/箭头在深色档变成深灰，几乎看不见，而同一个按钮里的文字用的是恒定 `--anchor-contrast`（一个按钮的图标和文字翻转规则不一致）。已改：社区发帖 FAB 的加号、首页「换一道」圆环+箭头、家庭管理「邀请新成员」的人像加号（共 5 条声明）→ `--anchor-contrast`。<br>⚠ **别一刀切全改**：`--c-surface` 作**未读小红点的描边**（首页 `:79`）是**对的**——那圈描边的作用是隔开徽标和图标底色，本来就该跟页面底色一起翻转。判据是「这个描边画在谁上面」：画在品牌色上→用恒定浅色；画在页面底色上→跟底色。<br>⚠ 同类残留已全部判完（2026-09-19 二轮）：`community .rgo-arrow`（父 `.rgo` 底色 `--anchor`，其自身注释就写着「两主题不翻转」）、`me .mag-phone-glyph`（父底 `--pop`）、`login-phone .ic-arrow`（父 `.btn-pop`）、`login-phone .lp-check`（勾选后底色 `--pop`）、`checkout .pm-check-tick`（父底 `--wx` 微信绿，常量）——**五处共 8 条声明已一并改成 `--anchor-contrast`**。<br>判据落地成一句话：**描边画在恒定/品牌色底上 → 用 `--anchor-contrast`；画在会随主题翻的页面底色上 → 保持 `--c-surface`**。<br>所以 `shopping .mkt-tick`（父底 `--paper-2`，会翻）**故意没动**，它就是该跟底色一起翻；`vip .vip-av` 在未开放的会员页上，留待该功能开放时一并看。<br>⚠ 这批的浅色档观感只有 #ffffff → #fbf8f3 的极微差别（与同按钮文字同色），**深色档的像素级复核仍待真机**。 |
| 菜谱搜索副文案谎称「按相关度排序」 | ✅（修复后） | 读 `_apply()` 确认：只有点了标签（最快/川菜/家常/做过的）才真的排序，默认「综合」这条路不做任何相关性计算，空关键词时「相关度」更是无的放矢，可副文案无条件写着「按相关度排序」。属于「页面对用户撒的小谎」那一类（同邀请码的「24 小时内有效」，那条已被更正过）。改成如实报当前标签：`共 N 道菜 · 按「{{sortLabel}}」排列`，`sortLabel` 在 `_apply` 里随 `activeSort` 一起算。实测页面 `data.sortLabel="综合"` 已生效。<br>同页布局本身没问题：两列网格、chip 横滑、导航是「返回 + 搜索框 + 取消」不带标题，所以不在标题被压那一类里。 |
| 大字模式漏接了 8 个页面（含做菜模式） | ✅ 8 页全部接上 + 缺口钉成失败 | `app.wxss` 里 `.font-lg` 的注释自己写着「全站 36 页根节点挂 .font-lg」，实测**只有 29 页真挂了**。漏掉的包括**做菜模式**和菜谱详情——不白屏不报错，就是「设置里开了大字，这一页照样小字」，而做菜那屏手机在一臂外、手上有油，最需要大字。<br>原先以为「其余 7 页要包一层结构才能挂」，读了 CSS 才发现不用：`.font-lg` 只做一件事——重定义 `--fs-*` 自定义属性，而自定义属性**只向下继承**，所以挂在**任意**祖先节点上都生效。于是没有单一根的页面改成每个可见顶层节点各挂一份：`recipe-detail` 挂 3 个（正常态 / 骨架 / 空态是并列的 `wx:if` 根）、`recipe-edit` 挂 3 个（`.rc-seg`/`.rc-body`/`.rc-footbar` 并列），其余 5 页挂各自唯一根。<br>**实测生效**（不是"看着一样"）：`font_scale=lg` 下 `recipe-detail` 的 `.rd-hero-title` 高 **64.98px**，切回 normal 同一选择器 **55.86px**，比值 1.16 ≈ 设计值；`recipe-detail / recipe-edit / cook-log / favorites / import / weekly-menu` 六页的 `data.fontScale` 逐个读出来都是 `lg`、`Object.keys(data).length` 正常（页面没被改白）。`vip` 页**没能渲染核对**：它自己的 `onLoad` 守卫把深链弹回首页（预期行为），只有静态检查与代码走读。<br>**`static-check` 第 15 项已升级**：只接一半、整页没接**都判失败**（原先整页没接只列清单）。反向验过：删掉 `legal/terms` 的 WXML 类 → 点名「只接了一半」；连 JS 一起改名 → 点名「整页没接」；随后原样还原。<br>⚠ **已知残留、故意没动**：只在 `onLoad` 读档的页面（几乎所有分包页）在**页面还留在栈上**时去设置页改档位、返回来不会重读；五个 tab 页读在 `onShow`，所以主链路会即时生效。要修得给 ~20 个页面加统一的 `onShow` 重读（或抽 helper），属跨页面改造，留上线后。 |
| 社区发帖端到端（写路径 + 待审可见性） | ✅ 实测跑通 | 在模拟器里直接调社区页自己的 `submitPost()`（不是只点一下看动画）：库里确实多出 `community_post` 一行 `audit_status=PENDING`、`author_user_id=11`；随后在 feed 数据里读到它，`isPending=true`、`mine=true`，卡片带「审核中」徽标，详情页与评论各自也带「审核中 · 审核通过后大家可见」。<br>关键判据在服务端 SQL：`MysqlKitchenStore.java:253` 的 `WHERE audit_status='APPROVED' OR (audit_status='PENDING' AND author_user_id=?)`（评论同规则在 `:420`）——**作者看得见自己的待审内容**，不会出现「发了就消失」。<br>⚠ 一个我差点误判成缺陷的点：feed 排序是 `ORDER BY like_count DESC, id DESC`，刚发的 0 赞帖**不在列表首位**（实测落在第 4 位）。我第一次只读 `posts[0]` 没找到，差点写下「作者看不到自己的帖子」这条假结论。验列表类断言要按 id 找，别看首位。<br>⚠ 由此暴露的真实小体验问题（**故意没改**）：发完帖只有一句 toast，帖子却在列表中段，「我发的帖子去哪了」是可预期的困惑。改法要么发完滚动定位＋高亮，要么给「我的帖子」入口——属产品决定，不自作主张加。<br>验完删掉了自检产生的那条（连带 comment/like/favorite 子表）；库里只剩早先走查留下的 id=4（PENDING，仅作者可见）。 |
| 社区页的加载/失败/空态与全站不是一套（三个核心旅程之间的观感断层） | ✅（修复后） | 换了个查法：不再逐页看截图，而是**按页统计共享组件用量**（`nav-bar`/`state-empty`/`state-loading`）。结果很清楚——菜谱、买菜清单、餐桌、厨房、收藏、做菜记录这些列表页都用 `state-empty`（插画 + 标题 + 描述 + CTA）和 shimmer 骨架，**唯独社区**（三个核心旅程之一）三态全是一行裸文字 `.empty-text`，加载时连骨架都没有。而生产库第一天社区必然是空的，审核员点进来看到的就是那行小字。<br>改成：加载态用**与 `.pcard` 同形状**的三张骨架卡（头像块 + 两条线，`--paper-2` + 全局 `.shimmer`，加载完不跳版）；失败态/空态换成 `state-empty` 并各带 CTA；随之删掉本页失效的 `.empty-state`/`.empty-retry` 规则（`.empty-text` 是 app.wxss 的全局工具类，别处还在用，保留）。<br>⚠ 顺手修掉一个隐藏陷阱：原失败态按钮写的是 `bindtap="loadPosts"`，而 `loadPosts(silent)` 第一个参数是布尔——**事件对象被当成 `silent` 传进去了**（当前实现下恰好不影响结果，属于运气好）。现在走 `retryLoad()` 包装，与菜谱页同一写法。<br>⚠ 空态文案分两种：按话题筛过的空 ≠ 全站没人发帖。`currentTag` 非空时改为「「X」下还没有帖子」+ CTA「清空筛选」，否则「还没有人发帖」+「写一条」。判据同搜索页那次「别对用户撒小谎」。<br>实测：`setData({posts:[]})` 出图＝插画＋「还没有人发帖」＋「写一条」胶囊；`setData({loading:true,posts:[]})` 出图＝三张与真实卡片同形状的骨架；`onEmptyAction()` 两个分支分别验过（无标签 → `showPostForm` 变 true；有标签 → `currentTag` 被清空）。<br>⚠ **组件内部的 `.se-btn` 自动化够不到**：`automation_element_action` 报 `no such element`，`page.selectComponent("state-empty")` 在 eval 上下文返回 null（与 `createSelectorQuery` 同一个限制）。所以「点 CTA 会怎样」是**直接调页面方法验的**，不是真点出来的——真机点一下仍值得补。 |
| 家庭成员页把「加载失败」显示成「还没有家庭成员」 | ✅（修复后） | 读 `loadFamilyProfile()` 的 catch：失败时 `setData({members:[], memberCount:0, loaded:true, codeFailed:true})`，而 WXML 的空态分支是 `wx:elif="{{loaded}}"` ——**网络一抖，页面就告诉用户「还没有家庭成员，邀请家人一起点菜吧」**。toast「家庭信息加载失败」两秒就消失，留在屏幕上的是一句假话；对一个家庭应用来说这等于说"你的家人不见了"。<br>改成三态分开：新增 `loadFailed` 标记 → `state-empty type="offline"` +「家庭信息没加载出来」+ CTA「重新加载」（走 `retryLoad()`：先清标记再重拉）；真正的空态保留，也换成共享 `state-empty`（与社区那次同一套插画语言），本页自带的 `.mem-empty`/`.mem-empty-txt` 规则随之删净。<br>⚠ 同页两处计数一并改了口径：邀请码卡上的「共 N 人」和 section 的「N 位成员」在失败态下不再报 0（一个显 `—`、一个显「暂无数据」）。**0 是"知道家里没人"，失败是"不知道"，两者不能混**。<br>实测：`setData({loadFailed:true,members:[]})` 出图＝断网插画＋标题＋「重新加载」胶囊，无溢出；再调 `retryLoad()` → `loadFailed=false`、`members.length=2`、`memberCount=2`，即真的从服务端拉回来了。<br>⚠ 两个过程坑：① 改完文件后开发者工具会**自动重编译并把页面栈重置回首页**，前一次 `p.retryLoad()` 报 `is not a function` 就是这个原因（不是代码没生效）——验方法存在性之前要先确认 `getCurrentPages()` 栈顶是谁；② 与社区页同一限制，组件内部 `.se-btn` 自动化点不到，CTA 是**直接调页面方法**验的。 |
| 「加载失败」被显示成「还没有数据」——全站点名式排查（同类 3 处，含 1 处死代码） | ✅（修复后） | 家庭成员页那条（上一行）不是孤例，是一类写法错误：`catch` 里把列表清成 `[]` + 置 `loaded=true`，而 WXML 的空态分支恰好是 `wx:elif="{{loaded}}"`，于是**请求失败 = 告诉用户"你还没有 X"**。<br>排查方法（可复用、无需判断）：`grep -rn -B2 -A4 "catch" pages/*/index.js pkg-extra/*/index.js pkg-extra/*/*/index.js | grep "setData" | grep -E "\[\]|: 0|Count" | grep -v -i error` —— 全站点名后逐个核 WXML，命中 3 处。<br>① `family/members`：见上一行。② `me/feedback`：`catch → setData({history:[], historyLoading:false})`，WXML `wx:elif="{{!history.length}}"` → 显示「还没有反馈记录」，用户会以为自己发过的反馈被删了。新增 `historyFailed` 标记 + 一行「反馈记录没加载出来，点这里重试」（`--pop` 红 + `tap-scale`，跟普通灰字提示区分开），点它直接重跑 `loadHistory`。**实测出图**： staged `historyFailed:true` 后「我的反馈」下面就是那行红字。③ `pkg-extra/import`：**这条是反过来的**——WXML 里 `wx:elif="{{recentLoadFailed}}"` 的「最近导入加载失败，点这里重试」分支、样式、`bindtap="loadRecent"` 全都写好了，可 `catch` 里只写了 `setData({ recentImports: [] })`，**从没把 `recentLoadFailed` 置 true**，所以那是一整条死代码，失败时落到"没有最近导入"。补一个字段即复活（不新增任何 UI）。<br>判据留一句：**0 和空是"知道没有"，失败是"不知道"——两者必须各占一个状态位，不能共用一个分支**。<br>**已钉成 `static-check` 第 16 项**（catch 块内清列表却没置 `*Failed/*Error: true` 即失败）。反向验过：删掉 feedback 的 `historyFailed: true` → 点名 `@catch 第 64 行`、exit 1；还原 → exit 0。<br>⚠ 这版门禁的第一稿用「从 catch 起算 500 字符」的固定窗口，**误报 3 处**（`cook-mode`、`notifications`、`community` 都是 catch 后面的正常代码被扫进窗口，`images: []` 之类被当成清列表）。改成**花括号配对取整个 catch 块**后当前树 0 命中，且反向测试仍然能抓到。教训：新门禁先跑一遍数误报，别一上来就判红。 |
| 忌口过滤在服务端**永远不可能命中**（家庭场景的核心功能形同虚设） | ✅（修复 + 钉成测试） | 忌口是这个产品区别于普通菜谱库的家庭特色：成员可配忌口标签（`family_member.avoid_tags_json`），菜谱列表和「今天做什么」都该避开。列表端（前端 `matchesAvoid`）用的是「菜名 + 菜系 + 口味标签」的关键词包含，还带同义词表（辣→麻婆/水煮/香辣、花生→宫保、鸡蛋→蛋）；**服务端却是 `tasteTags.contains(tag)` 的相等比较**。<br>实测数据直接判死：库里出现过的口味标签全集是 {下饭, 咸甜, 酸辣, 麻辣, 香辣, 清淡, 酸甜, 孩子爱吃, …共 33 个}，而成员能选的八个预设忌口是 {辣, 香菜, 猪肉, 牛肉, 羊肉, 海鲜, 花生, 鸡蛋}——**一个都不在其中**，所以这条过滤对任何可配置的值都不可能命中。后果：家里设了「辣」，菜谱列表已经过滤干净，首页推荐照样端出麻婆豆腐。<br>修复：新增 `service/AvoidTagFilter.java`（与前端同一套 haystack、同一份词典），`MysqlKitchenStore` 的 `removeIf` 改走它。<br>**端到端实测**（重启本地服务带上新代码，`/healthz` 8 秒后 UP）：给成员写 `["猪肉"]` → dashboard 推荐从 `红烧肉 / 糖醋排骨 / 牛肉炒西兰花 / 可乐鸡翅` 变成 `牛肉炒西兰花 / 可乐鸡翅 / 番茄炒蛋 / 香菇滑鸡`（两道猪肉菜被剔、后面补位）；清掉标签 → 立刻变回原样。⚠ 用 `["辣"]` 第一次测**看不出差异**（当天 top4 里本来就没有辣菜）——换成一个必然命中的标签才算验到，别把"没变化"读成"没生效"。<br>⚠ 顺带修掉词典里一处过度过滤：`辣` 的关键词含 `川菜`，等于"不吃辣 = 整个川菜区被端走"（红烧肉就标着川菜却不辣）。两端一起删掉 `川菜`，靠 辣/麻婆/水煮/香辣/麻辣 命中真辣味。<br>⚠ 词典现在**两端各有一份**（前端要即时本地筛、后端要在推荐里算），这是事实不是疏忽；由 `AvoidTagFilterTests#keywordDictionaryStaysInSyncWithMiniappConstants` 直接读 `miniapp/utils/constants.js` 逐键比对守住。反向验过：给前端加一个关键词 → 该用例报「忌口标签「香菜」的关键词两端不一致」并 exit 1。<br>⚠ **故意没改**：`海鲜` 的关键词含 `鱼`，会连带挡掉鱼香肉丝这类不含鱼的菜。过敏场景宁可多挡不可漏挡，误伤方向是安全的。<br>新增 6 项用例；全量 **29 类 / 171 项**（当时的数，最新见 README）在**先 DROP 掉的测试库**上 0 失败 0 错误。 |
| 忌口闭环实测（写入 → 列表过滤 → 推荐过滤）+ 保存后角色副标题写错 | ✅（跑通 + 修 1） | 动手前先看了数据：**`family_member.avoid_tags_json` 全库没有一行不是 NULL**——这功能从写下来没人走通过。用真机式操作跑一遍：① **写入**：模拟器里驱动成员页自己的 `onMemberTap → toggleAvoidTag('辣') → saveAvoid()`，库里 member 6 确实变 `["辣"]`，行副标题即时变「忌口：辣」，弹层关闭、busy 位复位。② **列表过滤**：菜谱页 `avoidTags=["辣"]`、`avoidActive=true`、`avoidHiddenCount=4`，而真正渲染的那个数组 `displayedRecipes` 里 辣/麻婆/宫保/拌面 一个不剩。③ **推荐过滤**：见上一行（服务端那条相等比较永远不命中，已修）。<br>⚠ 这一步我差点自己造了个假缺陷：第一次读列表用的是 `p.data.list || p.data.recipes`，而 WXML 的 `wx:for` 绑的是 `displayedRecipes` —— 读到的是**未过滤的原始数组**，于是"忌口没生效"看起来铁证如山。判据：**读 `page.data` 之前先看模板那一行绑的是哪个键**。<br>修掉的真缺陷：`saveAvoid()` 成功后重算副标题用 `m.isSelf ? '管理员 · 家庭创建者' : …`，而首次渲染那行用的是 `isOwner`——**自己永远是 self**，所以任何人只要清一次忌口，自己那行就自称"家庭创建者"。已改成 `isOwner`。<br>⚠ 已知未改：`hidden=4` 但页面只显示 6/18，是默认来源标签还叠着「自建」等筛选——两个数都对，别并排读成矛盾。 |
| 「按菜单重新生成清单」的确认文案说反了（承诺会清掉已勾的「买好了」） | ✅（修复 + 钉成测试） | 实测走的是接口不是猜的：拿小程序同一个 token，`PATCH /api/shopping-list/today/items/{id}` 把自动条目「紫菜」勾成买好 → `POST /shopping-list/today/rebuild` → `GET`。结果**紫菜仍然是买好**（换了新 itemId：1103 → 1164），手动加的「厨房纸」也还在。可弹窗写的是「已勾的"买好了"会清掉」——两处（`pages/menu/index.js` 与 `pages/shopping/index.js`）同一句假话，而且 `shopping/index.js` 上面的注释还专门解释"原文案说反了"，方向也是反的。服务端 `TodayService.loadPreviousPurchasedMap` 存在的目的**就是**按「食材名+单位」把勾选恢复回来。<br>改成：两处文案统一为「自动条目按当前菜单重算用量；已勾的『买好了』和你手动加的条目都会保留」，注释一并改正，并新增 `CoreFlowTests#rebuildKeepsPurchasedFlagsAndManualItems` 把这个语义钉住（以后谁把恢复逻辑删了，文案就变成假话 → 测试先红）。<br>⚠ 写这个用例踩到一点：**重建后自动条目的 itemId 会变**，断言必须按食材名找、不能按 id 找。<br>顺带确认了买菜页的另一半是好的：`enrichItems` 会给清单条目打 `pantryText='库存里已有'`，实测「鸡蛋」「紫菜」都带上了（清单不按库存扣减是**设计如此**，靠这行提示让用户自己决定，不是缺陷）。 |
| 用例之间有顺序依赖：`CoreFlowTests` 单独跑必红 | ✅（修复 + 把反序跑写进 README） | 查上面那条时顺手单跑了 `-Dtest=CoreFlowTests`（先把测试库 DROP 掉），结果 `communityPostLikeTogglesAndKeepsCountInSync` 红在 `assertThat(posts.size()).isGreaterThan(0)`——它**直接读 feed 的第一条帖子**，假设库里已经有内容。全量跑之所以绿，是因为别的用例先建了帖子；CI 同理。这正是本仓库已经栽过一次的那类坑（后台治理用例当初就是靠"自带数据"修掉的），只是又漏了一个。<br>改成：用例自己 `POST /api/community/posts` 建一条再点赞，初值从建回来的响应读（`likeCount` 缺省按 0）。<br>修完的三重验证（都在**先 DROP 测试库**的前提下）：单跑 `CoreFlowTests` 10/10 绿；全量 29 类 **171 项** 0 失败 0 错误；再用 `-Dsurefire.runOrder=reversealphabetical` **反序全量**跑一遍也是 171/0——反序是查顺序依赖最便宜的手段，已写进 README 的验证步骤。 |
| 做完菜不回写冰箱：`pantry_item` 只有加和删，**没有任何扣减**（核心闭环缺最后一环） | ✅（补齐 + 端到端实测） | 查法：`grep pantry_item server/src/main/java` → 只有 `INSERT`（手工加 / 演示种子）和 `DELETE`（手工删），没有 UPDATE。也就是说冰箱里的数字**只会变大**，做完一顿饭库存纹丝不动，而买菜清单还一直提示「库存里已有」。这不是遗漏而是没做完：`docs/adr/0009-family-menu-core-model.md`（状态 accepted）§5 明确写了「偷懒默认按标准量自动扣减（方案 A）」，`docs/blueprint-v1.md` 的闭环图也画着「做完菜 → 扣减回写冰箱」。<br>补的实现：`PantryDeduction`（纯计算，好测）+ `MysqlKitchenStore#deductPantryForRecipe`（在 `addCookHistory` 同一事务里落库）。规则刻意保守——**名称与单位归一后完全相等才扣**（"香葱"不当成"葱"）、**两边任一侧解析不出数字就不扣**（"适量"/"少许"）、同料多行按**临期优先**依次消耗、扣到 0 即删行、绝不写负数。<br>**线上实测**（重启本地服务后拿小程序同一个 token 打接口）：冰箱 `鸡蛋 8 个 / 紫菜 1 包`，做一道 `紫菜蛋花汤`（食材 `鸡蛋 2 个`、`紫菜 8 g`、`香葱 1 根`）→ 响应 `pantryDeducted: 1`，鸡蛋 **8 → 6**；紫菜因单位对不上（包 vs g）**没被扣**，香葱冰箱里没有也不动——三条规则一次看全。做完的自检数据已清（两条 `cook_history` 删掉、鸡蛋改回 8）。<br>⚠ **过程坑（值得记住）**：第一次"重启"我按 `pgrep` 拿到的一组 PID 去 kill，但真正在听 9088 的是**另一对进程**，新进程起不来（日志里是 `MojoExecutionException`），`/healthz` 却在 **2 秒**就返回 200——那是旧进程在答。于是第一轮"实测"读到的响应根本没有新字段、库存也没变，差点被我记成"实现没生效"。判据：**重启后必须看 `lsof -nP -iTCP:9088 -sTCP:LISTEN` 的 PID 是不是新的**，并让一个只有新代码才会有的字段（这里是 `pantryDeducted`）出现在响应里，再开始测。<br>⚠ 前端配合：`pages/menu` 与 `pkg-extra/kitchen` 的「上桌」toast 现在会说「已上桌 · 冰箱扣了 N 项」——库存数字自己变小却不解释，用户会以为东西被人删了。`cook-history` 响应新增的 `pantryDeducted` 是**可选字段**（列表语境走兼容构造器 = null），所以没有改动既有 DTO 调用点。<br>测试：`PantryDeductionTests` 8 项纯逻辑 + `CoreFlowTests#cookingDeductsPantryByRecipeAmount` 端到端 1 项；全量 **30 类 / 180 项** 在删掉的测试库上 0 失败 0 错误。<br>⚠ 第一版集成测试放的是 `99` 克排骨，结果那道菜要 500 克，库存被扣到 0 **直接删行**，断言"还剩一点"就红了——那是设计行为（扣光即用完），不是 bug；改成放 999999 保证够扣。 |
| 冰箱页补一句库存口径；两处「没换成 state-empty」是故意的 | ✅ | 冰箱 hero 副文案补成「家里现在有什么，点菜前先看一眼 · **做完菜按用量自动扣**」——库存数字现在会自己变小，页面顶部必须说清是谁干的。实测出图：这一行在小屏宽度下仍是单行、白字带描影压在照片上清晰可读，没有换行挤压下面的统计条。<br>复跑了一遍"按页统计共享组件"的审计（现在 19 页用了 `state-empty`），剩三处带自己的空/失败文案，**两处判定不改**：<br>① `pages/me` 的「厨房数据没加载出来」是**页面内一条错误带**（下面数据卡照常渲染），换成整页插画组件反而错；② `pkg-extra/me/feedback` 的「反馈记录没加载出来，点这里重试」是表单页里**一小段列表**的状态，同理。<br>③ `pkg-extra/import` 的 `res-empty` 是"未识别到食材/步骤"的**字段级提示**，不是页面状态。<br>判据补一句：**`state-empty` 是给"整页没内容"用的；页面照常、只有一小块数据没回来的，用行内错误条**。 |
| 「做完菜 → 冰箱 → 现在能做」整条反馈闭环实测跑通 | ✅ 实测 | 上一行加了扣减，就得证明**下游真的跟着变**。拿小程序同一个 token 打接口：`GET /api/pantry/match` 先给出 6 道候选（其中 `蒜蓉西兰花` 与 `牛肉炒西兰花` 都靠冰箱那 `1 颗西兰花`）→ `POST /api/cook-history {recipeId: 7}`（蒜蓉西兰花食材含 `西兰花 1颗`）→ 响应 `pantryDeducted: 1`、`GET /api/pantry` 里**西兰花整行消失**（扣光即删）→ 再 `GET /api/pantry/match` 只剩 4 道，**两道西兰花菜一起掉出去**。这是这个产品的主线（点菜 → 做菜 → 库存 → 再点菜）第一次被当成一条链验证，而不是三段各自为政。测完已还原：删掉那条 `cook_history`、把西兰花按 `1 颗 / 到期 +2 天` 插回。 |
| 开源仓库的协作入口补齐（objective 里「看看 github 开源项目的操作」那一项） | ✅ | 此前仓库只有 `.github/workflows/`，没有 `SECURITY.md`、没有 Issue 模板、没有 `CHANGELOG.md`——而这是个 **public** 仓库、后端管着真实家庭数据，安全问题一旦被当普通 bug 开成公开 Issue，等于把利用方式广播。补了：<br>① `SECURITY.md`：只走私密渠道（GitHub 安全公告 `security/advisories/new`），列清在意的类别（`/api/**` 越权与 `family_id` 限定、`/uploads/**` 的 HMAC 签名绕过、登录与手机号绑定、社区审核绕过、限流）与不在范围内的（微信侧能力、部署凭据），并声明"本文件不代表存在已知漏洞"。<br>② `.github/ISSUE_TEMPLATE/`：`bug.yml`（现象/复现步骤/哪一块/真机还是工具/设备版本/日志，末尾一个**必须勾**的确认框：贴的东西里没有真实 token、手机号、邀请码、别人家的数据）、`feature.yml`（要求先写家里的具体场景，不接受"希望有个 XX 功能"）、`config.yml`（关掉空白 Issue，把安全上报和上线清单挂成 contact links）。三个文件都用 `ruby -ryaml` 解析验过。<br>③ `CHANGELOG.md`：Keep a Changelog 结构，「未发布」下按 Added/Fixed/Changed 汇总本轮所有带证据的改动，末尾单列「已知待办（部署方）」五项；写明**第一个 tag 在提审那天打**。<br>④ README 顶部加「文档与协作」小节把上面三样指出去。⚠ 没动 `.github/workflows/**`，所以不触发 push 需要 `workflow` scope 的那道坎。<br>核验到哪一步、没核到哪儿（说实话）：① `gh api .../contents/.github/ISSUE_TEMPLATE` 确认 `bug.yml / config.yml / feature.yml` 与 `SECURITY.md` **都在远端 master 上**（api.github.com 走得通）。② "GitHub 是否已把模板挂上 New Issue 选择页"**当前无法机器确认**，三条路都堵着：`/issues/new/choose` 会 302 到登录页（匿名看不到）、`GET /repos/.../community/health` 带完整 header 仍返回 **404**、直连 `github.com` 的 HTML 请求被 reset（`curl` exit 56，本机只有走 `127.0.0.1:7897` 代理才稳）。**留一条给 owner 的收尾动作**：登录状态下打开一次 New Issue 页面，看到「问题反馈 / 功能建议」两个按钮即算闭环。③ 这次 push **没有触发任何 CI run 是符合预期的**——两个 workflow 都带 `paths` 过滤（`miniapp/**` / `server/**`），纯文档改动本就不该跑。 |
| **全新库首跑彩排**（审核员/第一个真实用户进来会看到什么） | ✅ 跑通，无缺陷 | 做法：`CREATE DATABASE family_menu_fresh_db`（空库）→ 用 `DB_NAME=family_menu_fresh_db` 起服务（应用自己跑 `schema.sql` + `data.sql`）→ 以**全新游客**身份把核心端点逐个打一遍 → 测完 DROP 掉、把服务切回开发库并核对数据没被污染。**结果**：27 张表建齐、`recipe` 16 条（`data.sql` 的公开菜谱）、`user_account` 1 条；`home/dashboard / recipes / daily-menu/today / shopping-list/today / pantry / pantry/match / community/posts / notifications / family/profile / cook-history / me/favorites` **全部 200**，空数据时返回的是空数组/空列表而不是 500 或 null（`pantry: []`、`community/posts: []`、`notifications: {items:[],unreadCount:0}`）。我猜的 `me/profile` 返回 404 `接口不存在`，那是**我路径写错**，不是缺陷。<br>⚠ **中途一个假警报（差点记成隐私缺陷）**：我连开两个游客，两次都拿到 `familyId=2`，看着像"新用户被塞进同一个家庭、能互相看到今日菜单"。实际是 `/api/auth/guest` 的 `X-Device-Id` 请求头我**没传**——不传时后端按同一个共享指纹认人。带上两个不同 deviceId 再测：`devAAA111 → familyId=3/owner=4`、`devBBB222 → familyId=4/owner=5`，**一人一个家庭，隔离是对的**；小程序侧 `utils/api.js` 本来就会生成并持久化 `dev-<时间戳>-<随机>` 的设备号，真实客户端不会走到"不传"那条路。判据：**看到"数据串号"先确认自己传的身份证据是不是同一个**。<br>顺带核到两条既有事实（不用改，记着）：① `POST /api/auth/guest` 有专门限流规则 `30 次/60 秒`（`RateLimitFilter:46`，注释就写着"防批量刷库"）；② `ensureFamilyForUser()` 会给没有家庭的用户**就地建一个家庭**（默认名"周末厨房"，`AuthService:512`），所以第一个用户不需要先建家庭也能用菜单/冰箱，名字之后在家庭管理里改。<br>⚠ 环境已复原：`family_menu_fresh_db` 已 DROP，服务切回 `family_menu_daily_db`（`/healthz` UP），开发库 `pantry_item` 5 行、西兰花 `1 颗` 都在。 |
| 图标与点击反馈对照市面成熟方案（owner 新提的要求） | ✅ 图标已收口 + 钉门禁；点击反馈已量化 | **图标**：社区帖卡动作行原来是「文字符号 + emoji 混用」——`♡ ☆ ⚠` 不追加变体选择符时 iOS/Android 常渲染成**彩色 emoji**，`💬`(U+1F4AC) 更是压根没有单色形态。彩色 emoji 吃不到 CSS `color`，于是既不跟品牌色也不跟深色档翻，还把系统风格混进品牌界面；成熟方案（Vant Weapp / TDesign 的 iconfont、下厨房的图标）一律**单色描边**。改法（最小且不引依赖）：BMP 符号统一追加 `\FE0E`（文字呈现），`💬` 改用 CSS 画气泡（`em` 单位 → 跟字号/大字模式，`currentColor` → 跟主题）。**模拟器实测**：一排图标同色同粗同基线。**全站审计结果**：`content:` 里当图标用的码位只剩社区这 6 处（都已带 `\FE0E`），其余 `content:` 是 `""` 装饰或纯文字（`home` 的 `·`、`cook-log` 的 `+ `），不算图标。<br>**已钉成 `static-check` 第 17 项**：A) `content:` 出现非 BMP 码位（>U+FFFF）即失败；B) 落在符号区 2600–27BF / 2B00–2BFF 却没跟 `\FE0E` 即失败。两个分支都反向验过：把 `.ico-warn` 改回 `"\26A0"` → 点名「符号图标没声明文字呈现 …U+26A0」；改成 `"\1F4AC"` → 点名「图标用了 emoji 码位 …U+1F4AC」；还原后四条门禁全 exit 0。<br>⚠ 教训：第一次反向测试用 perl 单行做替换，**没生效也没报错**，看起来像"门禁不灵"。改用 python 打印 `mutated: True` 确认改动落地之后，两条分支立刻都报——**验门禁前先证明你真的把代码改坏了**。<br>**点击反馈**：项目其实已有两套按压态工具，与成熟方案同思路——`.tap-scale`（`scale(0.95)` + back-out，块级用）与 `.tap-dim`（`opacity .55`，文字链接用，注释写明"缩放会显得怪，改成压暗"）。按「两种都不算」重新数：全站 **308** 个带 `bindtap/catchtap` 的元素里，**13 个**没有任何按压反馈（4%），分布：`recipe-edit` 2、`family/invite` 2（是 `fi-disabled` 禁用态，**故意不给反馈**）、`state-dialog` 2、`home` 2、`custom-tab-bar` 1、`recipe-detail` 1（步骤图预览）、`post-detail` 1（图片）、`state-sheet` 1、`recipes` 1。⚠ 早先我按「只认 .tap-scale」数出 12 处，其中 `login-phone` 的 3 处其实用的是 `.tap-dim`——**判据要先确认工具集里有哪些合法写法**，否则统计本身就是错的。剩下的逐个待判，见任务 #5。 |
| 相册选图与隐私弹窗 | ⬠ 未验 | `wx.chooseImage`/相册授权是原生面板，模拟器自动化够不到，仍需真机点一遍 |
| 深色模式 | ⬠ 部分 | 已修自定义 TabBar 变量作用域、两处硬编码色，及 4 处「前景/底色只在一档成立」：<br>厨房总控两个幽灵按钮 + 社区加图虚线（裸黑描边，深色档看不见）、<br>菜谱详情视频播放三角（恒定白圆上用了会翻转的 `--ink-deep`，深色档变白上白）。<br>`static-check` 第 9 项已禁止 border/color 再写裸黑。<br>**2026-09-19 二轮：查出并修掉「做菜沉浸页」整页深色档塌陷**——烹饪模式底色 `--cook-bg` 两档都是深色，
但它的前景/卡底当时用的是**会翻转**的 token：`--c-border-light`（浅 #f1ece2 → 深 **#333333**）压在 #111111 上 = **1.49:1**，
步骤正文、菜名、关闭 X、大号倒计时、上一步按钮全部看不见；`--ink`（深 #2c241b → 浅 **#efefef**）作卡底则会在暗底上蹦出白卡片、白食材药丸、白按钮；
`--line-deep` 作描边图标（重置箭头）深色档翻成 #3a3a3a = 看不见；`--c-surface` 作时钟针翻成 #242424 = 看不见；
`--pop` 深色档提亮到 #ff6a4d 后承载浅色文字只有 2.67:1。<br>
改法：`app.wxss` 新增 `--cook-ink / --cook-ink-mut / --cook-surface / --cook-line / --cook-mark / --cook-pop`
六个**恒定** token（取值 = 浅色档现状，所以浅色档观感零变化），沉浸页只准用它们；`static-check` 第 12 项把这条钉成门禁
（按 WXML 根节点类名识别「恒定暗底页」，逐规则算两档对比度：前景 <3:1 或 填充/描边两档亮度差 >0.25 即失败）。
**已反向验证**：把 `--c-border-light` 种回 `.steptext` → 门禁点名 `对比度 1.49:1` 并 exit 1。<br>
⚠ 深色档**像素级**复核仍待真机：模拟器 `simulator_refresh` 不重读 `theme.json`（实测把 light 钉成 dark 的值，页面纹丝不动），
所以本轮结论是「按 token 取色算出来的」，不是截图看出来的——这也是第 12 项用计算而不用快照的原因。**整站深色观感仍需真机复核** |
| 消息页导航标题也被右侧按钮压住 | ✅（修复后） | **先更正上一轮写错的一条**：我上轮写「其余 4 个『标题+右侧按钮』的二级页实测不冲突（按钮只有 2 字）」——那是**没测就下的结论**。这轮看消息页截图发现「消息」2 个字照样被「✓全部已读」的对勾压住（那个按钮是图标 + 4 字，约 190rpx，不是 2 字）。改法与社区页一致：导航标题留空，页面名由 hero「消息通知 / 家里的动静」承担。<br>另外 `pages/feedback`（提交）、`pages/profile-edit`（保存）、`auth/login-phone`（帮助）这三个是**真 2 字、无图标**，按几何算右侧按钮左缘在 506rpx、标题右缘在 407rpx，不会撞上——但请注意这条是**算出来的、没截图核**，谁改这几个按钮的文案或加图标就要重新看。<br>⚠ **别再来试「组件里运行时测量并 clamp 标题宽度」**：本轮真写了 `measureTitleRoom()`（`ready` + `wx.nextTick` 后量 `.navbar-right` / `.navbar-back` 再算 `max-width`），实测**不生效**——首帧量到的 slot 占位不对，标题照样被压；已整份回退。要把这个类一次性关掉，得改成「标题不再绝对居中」，那会动全站 30 个页面的导航观感，不是本轮该做的事。 |
| 社区导航标题 | ✅（修复后） | 截图放大实测：nav-bar 的标题是**绝对居中**（`.navbar-title-slot{position:absolute;left:0;right:0}` + `max-width:56%`），不会给右侧 slot 让位，所以 tab 页「邻里厨房」4 字标题的最后一个字被「发帖」胶囊**压掉一半**（不是省略号截断，是叠在下面）。社区页导航标题改为留空，页面名由 hero 大字承担——与餐桌页（`title=""` + 点菜胶囊）同一写法。（本行原先还写「其余 4 个二级页实测不冲突」，那句是错的，见上一行「消息页导航标题」的更正） |
| 社区发帖弹层可达性 | ✅（修复后） | **弹层里的「发布」按钮此前在 tab 页上永远点不到**。自定义 tabBar 是独立图层，页面内 z-index 再高（state-sheet 是 9990）也压不住它；而 `wx.hideTabBar()` 在 custom tabBar 下直接失败（实测 `errMsg: hideTabBar:fail custom Tabbar`），所以只能把弹层抬到 tabBar 上沿。改法：`state-sheet` 新增 `lift` 属性 + `--tabbar-h` token（= 8rpx 上内边距 + 96rpx 高 + 24rpx 下内边距 + 安全区，数值来源 custom-tab-bar/index.wxss，改那边必须同步这边），社区两个弹层启用 `lift`，并把 `max-height` 压成 `calc(80vh - var(--tabbar-h))` 保证小屏（SE 667px）下表单仍能滚到底。**实测 390×844 修复前发布键被吃掉、修复后取消/发布完整可见**。⚠ 遗留：tabBar 本身压不暗（遮罩在它下面），只是观感问题 |
| 做菜模式：换步不再杀掉正在倒计时的计时器 | ✅（2026-09-19 按 owner 选的 B 方案实现） | 原实现 `gotoStep()` 第一件事是 `clearTimer()`，**炖着 20 分钟点「下一步」看配料，那个倒计时就没了**（无提示、不保留）。现在改成**每步一个计时槽** `_slots[i] = {total, baseAt, baseLeft, running}`：换步只切视图、不动别的槽；离开且仍在跑的步骤由顶栏下方一枚小条接管（`第三步还剩 20:33 · 回去 ›`，多个在跑时追加「另有 N 步」），点它跳回那一步、数字和运行态原样接上；到点照样震动 + toast（文案带上是哪一步）。<br>顺带**简化了切后台续跑**：剩余一律 `baseLeft - (Date.now()-baseAt)`，`onHide` 只停 tick、`onShow` 重启，原来的 `_hiddenRunning` 补偿逻辑整个删掉。<br>实测（模拟器真点）：第三步起 10:00 → 跳第二步 → `bgIdx=2 / bgText=10:00` → 3 秒后 `09:58`（后台确实在走）→ 点回去 → `current=2 / running=true / 09:58`；另用 3 秒短计时验证到点后 `bgIdx=-1`、槽停止、`_timer` 归 null（不泄漏 interval）。<br>⚠ **实现过程中被实测抓到一个我自己引入的 bug**：`_tick` 里若每拍都把 `baseAt` 推到「现在」，elapsed 永远略小于 1，`ceil(1-0.995)=1` → **数字卡死在 00:01 再也不到 0**（3 秒计时跑 6 秒后仍显示 00:01）。已改为计时期间 `baseAt` 固定、每拍只读不写，注释里写明了原因。 |
| 开关页直连弹回首页（复核） | ✅ | 2026-09-19 二次实测：直连 `pkg-extra/vip/index` 后 t=3s 仍停在该页、**t=8s 已回到 `pages/home/index`**，守卫有效。<br>⚠ 别在 3 秒处采样就下结论——本轮曾据此误判「switchTab 被吞、守卫失效」，改了三版 `leaveToHome` 又全部回退，实际原实现一直是对的。<br>同理，`navPad`/`plans` 这类**在 Page data 里有默认值**的字段不能用来判断守卫之后的代码有没有跑。 |

### 第六轮 R1（2026-09-19）：止血四处 + 新门禁 18/19

四处都在模拟器上真操作过，截图在 `/tmp/r1-*.png`（`--optimize false`，780×1688）。

| 项 | 结果 | 证据：怎么量的 / 修复前测到什么 / 修复后测到什么 |
| --- | --- | --- |
| **周菜单加载失败 → 整块内容凭空消失** | ✅（修复后） | 两层缺陷叠在一起。① `pkg-extra/weekly-menu/index.wxml` 用了 `<state-empty wx:if="{{loadError}}">`，但该页 `index.json` 的 `usingComponents` 只声明了 `nav-bar` 与 `section-head`——**未声明的自定义标签不报错也不渲染**，所以错误态从来没显示过。② 就算补上声明，那块错误态原来排在**七天卡片之后**：本页 `onShow` 会静默重取，失败时 `weeklyMenu.days` 仍是上次的 7 天，于是用户先看见「本周安排 0 天 / 已排 0 道 / 空位 0 个」的统计卡（像数据被清空），说明"是网络问题"的那条提示要滚到底才够得着。<br>**量法**：`simulator_open_page` → `automation_evaluate` 里 `p.setData({loadError:true, loading:false})` → 截图。**修复前**：内容区整块空白（hero 之下什么都没有，`/tmp/r1-weekly-err-before.png`）。**修复后**：sheet 开头出现离线图标 + 「本周菜单没加载出来」+「重新加载」按钮，七天卡片与统计卡整块隐藏（`/tmp/r1-weekly-err-after.png`）；恢复声明后正常路径截图无回归（`/tmp/r1-weekly-ok.png`，`days=7`）。<br>⚠ 第一次截图我误判成"修复没生效"——因为 `setData` 之后没滚到错误块所在位置，看的是内容区。判据：**截图前先把要验的那一屏滚进视野**。 |
| **冰箱「匹配失败」被显示成「家里没食材」+ 删除无回执** | ✅（修复后） | `pages/pantry/index.js:164` 在 `matchRecipes` 的 catch 里认真置了 `matchFailed: true`，但 WXML 从来没读它——空态分支只看 `matchResults.length`，于是网络一抖就显示「冰箱里的食材还没匹配到菜谱」。**这是第 16 项门禁的补集**：16 管"忘了置位"，这条管"置了没人读"。<br>改法：`state-empty` 失败分支放在空态之前（`type=offline` +「现在能做没算出来」+「匹配失败了，不是家里没食材」+ ghost 样式「再算一次」→ `retryMatch()` 走静默重算，不滚页、不叠 toast）。<br>**量法**：`setData({matchFailed:true, matchResults:[]})` → 截图（`/tmp/r1-pantry-matchfail.png` 显示新文案与按钮）；再调页面对象自己的 `p.retryMatch()` → **before `matchFailed=true` / after `false`、结果 6 条**（真实打了 `/api/pantry/match`）。<br>删除回执：原来「添加」有 `已添加` toast、「删除」什么都没有（只有列表少一行）。**量法**：先 `api.addPantryItem` 建一条 `R1临时测试葱`（`id=1073`），把 `wx.showModal` 换成自动确认（**只有弹窗是替身，删除请求与 toast 都走真实路径**），调 `p.removeItem()` 并拦下 `wx.showToast` 的文案 → **实测 `toast="已删除"`、`stillThere=false`、条目 6→5**，临时行已随删除消失（不污染开发库）。 |
| **菜谱页重复加菜：点「加入」却直接换页** | ✅（修复后） | `pages/recipes/index.js:358` 命中"这道菜已在今日菜单"时只 `wx.navigateTo('/pages/menu/index')`，用户看到的是"我点了一下、页面跳走了、什么也没加"。改为先给一句说明再跳。<br>**量法**（不写库）：读 `p.data.todayDishIds` 取真实存在的那条 `id=101`，把 `wx.showToast`/`wx.navigateTo` 换成记录用的替身后调 `p.addRecipeToToday({currentTarget:{dataset:{id}}})` → **实测 `{toast:"这道菜已在今日菜单，带你去看", nav:"/pages/menu/index"}`**，早退分支在第一个 `await` 之前，所以没有任何写请求发出。 |
| **帖子详情只在 `onLoad` 拉一次 → 回来还是旧的** | ✅（修复后） | `pkg-extra/community/post-detail` 无 `onShow`：去别处点了赞、别人补了评论再回来看，赞数/评论数/评论列表全是旧值，且没有任何提示。<br>改法：加 `onShow`，**首次进页直接返回**（`_enteredOnce` 位，避免和 `onLoad` 重复请求），之后走 `refreshQuietly()`——不置 `loading`（否则每次回来看见一次骨架屏）、帖子恰好被下架时不清空整屏（交给下一次显式操作的失败回执）；顺带在 `onShow` 重读大字档位。<br>**量法（端到端、带还原）**：`postId=1` 打开 → 页面基线 `likeCount=128` → 用 `require("utils/api.js").toggleCommunityLike(1)` 在页面外改一次 → 服务端读到 `129` → 调 `p.onShow()` → **页面 `pageAfterOnShow=129`** → 再 toggle 一次把赞取消，服务端回到 `128`（数据已复原）。<br>顺手排掉一条我的怀疑：`normalizeComment` 里 `c.commentId || 'c-'+Math.random()` 看着像"后端不返 commentId、每次刷新都换 key、作者删不掉自己评论"——实际 `ApiModels.CommunityCommentItem` 第一个分量就叫 `commentId`（`ApiModels.java:128`），**没有这个缺陷**，随机兜底只服务假数据。 |
| **新门禁 18：WXML 用到的自定义组件必须在同页 `index.json` 声明** | ✅ 已钉，落地即 0 命中 | 泛化扫描（带连字符的标签，内置标签走 `WXML_BUILTIN_HYPHENATED` 白名单）：全站 37 页 + 组件，**唯一命中就是周菜单那条**；`scroll-view` / `root-portal` 这类内置标签有 19 处，不白名单会全变误报。<br>**反向验证**：删掉 `state-empty` 声明 → `exit 1`，点名 `pkg-extra/weekly-menu/index.wxml:124 用了 <state-empty>…不报错也不渲染，这一屏直接空掉`；还原 → `exit 0`。 |
| **新门禁 19：JS 里置的 `*Failed` / `*Error` 位必须被本页 WXML 读到** | ✅ 已钉，落地即 0 命中 | 基线扫描命中 **1 处 = `matchFailed`**（就是上面那个真缺陷），修完归零。<br>⚠ **这条门禁是被反向验证救回来的**：第一版用 `wxmlSrc.indexOf(key)` 子串匹配，我把 WXML 改成 `matchFailedZZZ` 之后门禁**照样 exit 0**——因为 `matchFailedZZZ` 里含 `matchFailed`。改成 `\b` 词边界后第一次测仍不报，原因是我自己新加的兜底分支里还留着另一处合法引用（**改坏要一次改干净**）。两处都改名 → `exit 1` 点名 `setData({ matchFailed }) 置了位，但 …wxml 里没有一处引用它`。 |
| 四条前端门禁 + 编译 | ✅ 全绿 | `static-check`（现 19 项，285 文件）/ `dish-logic.test` / `kitchen-logic.test` / `interaction-audit`（A/B/C 均 0）四条 `exit 0`；改过的模板另用 `compile_wxml` 单独编过（`codeLength=33489`）；console 宽 grep 无 error/warn。 |
| ⚠ 本轮我自己造的两个测量事故（记下来免得再犯） | 已复原 | ① **zsh 不对未加引号的变量做分词**：把 `wechatide -c Qoder automation_evaluate --project …` 存进 `$W` 再 `$W --fn-source …`，整串被当成一个命令名 → 命令根本没跑，而我把随之而来的空输出当成了"断言没通过"。② **替身恢复写错**：`wx.showToast = Object.getPrototypeOf(wx).showToast` 把 `wx.showToast` 变成了 `undefined`（`typeof` 实测），后续任何 toast 都不会出现；靠 `simulator_refresh` 重启运行时才复原（复原后 `typeof wx.showToast === "function"`）。<br>判据：**替身要存原引用、恢复后要 `typeof` 复核**；测完顺手 `get_simulator_console` 宽读一次。 |

### 第六轮 R2（2026-09-19）：图标标准收口 + 新门禁 20

| 项 | 结果 | 证据：怎么量的 / 修复前测到什么 / 修复后测到什么 |
| --- | --- | --- |
| 全站图标违规的真实范围 | ✅ 已量 | 计划里写的是"3 个文件 8 处"，实测**只有 2 处是真违规**：`pkg-extra/kitchen/index.wxml:49,104` 的 💡🎉（非 BMP，没有单色形态）。<br>其余被点名的 `❝ ⤴  ❞  ★ ✦` 全在 BMP，按 Unicode 是**默认文字呈现**，本来就能被 `color` 着色、跨端一致——把它们和彩色 emoji 混为一谈会把 8 个在用文件全判成缺陷，还会逼人往 WXML 里塞一个看不见的 `\uFE0E`。<br>所以门禁第 20 项的 B 分支用 **Emoji_Presentation=Yes 的码位清单**（约 90 个区间），不用第 17 项那种"整段 26xx/27xx"的粗判据。 |
| 新门禁 20：WXML 里的图标不许用 emoji | ✅ 已钉，落地 0 命中 | 基线：修复前 WXML 命中 **2 处**（就是 kitchen 那两枚）；修完归零。<br>**反向验证**：往 `k-done-banner` 注入 `💡⭐` → `exit 1`，两条分支各点名一次、行号都是 104（`U+1F4A1 没有单色形态` / `U+2B50 默认走 emoji 呈现`）；撤掉注入后四条门禁全 `exit 0`。<br>⚠ **第一版把 JS 字符串字面量也扫了，报出 31 条——27 条是误报**：`recipe-detail:292` / `cook-mode:485` 的 `wx.showActionSheet` itemList 用 ⭐ 表示评分档位。那是**原生面板**，CSS 到不了那里，"吃不到 currentColor、不跟深色档翻"的危害根本不成立，而两行评分选项除了星没有别的表达方式；我们自己的评分 UI 早就是 clip-path 画的 `.rd-star`（`recipe-detail/index.wxss:384`），不受影响。剩下 4 条是 `test/` 脚本自己的输出符号。<br>判据：**"图标"这个概念只在渲染层成立**，扫 JS 会把原生面板与测试脚本一起卷进来。 |
| 补一份全站共享的 CSS 图标词汇 | ✅ | `app.wxss` 末尾新增 `.ico-bubble`（评论）/ `.ico-share`（分享：开口托盘 + clip-path 箭头）/ `.ico-flag`（举报：旗杆 + 带缺口旗）。全部 `currentColor` + `em` 单位——颜色跟主题与激活态翻，尺寸跟 `font-size` 所以大字模式自动生效。<br>为什么放全局而不是各页再画一份：全站已有 20+ 个页面级 CSS 图标（社区 `.ico-chat`、通知页 `.ic-bell`、导入页 `.ic-cam`…）各画各的，这正是"同一角色多种实现"的漂移源。 |
| kitchen：💡 换成排版标签、🎉 直接删 | ✅（截图定稿） | 💡 先按标准换成 CSS 画的灯泡（圈 + 灯座），**截图一看读作"气球"**——26rpx 下细节全糊。改成一个纯排版的「建议」标签（`--pop` 色、`--fs-mul` 缩放），比小图标更好认也不引入"看不清的图形"。`/tmp/r2-k-crop2x.png` 已核。<br>🎉（开饭横幅）直接删掉：文案"这一餐全部上桌，开饭！"自己就带情绪，横幅本身是实心色块，加任何小图标都是噪音。 |
| post-detail：三个字符图标换 CSS，顺带查出操作行必然溢出 | ✅（A/B 证明不是我改坏的） | 换图标后截图发现「收藏 0」「举报」被竖排换行、三个胶囊高度不一。**先做 A/B**：把 `index.wxml` + `index.wxss` 临时换回 HEAD 版本重编译截图（`/tmp/r2-pd-BEFORE.png`）→ **换行在改图标之前就存在**，不是本次回归。<br>再量数值定因：`.react-bar` 可用宽 **344px（664rpx）**，五个胶囊按内容（图标 22rpx + gap 12 + 文案 + 左右内边距 60rpx）实际需要约 **800rpx**；`.react` 没有 `flex:none`，于是被等比压扁、文字折行——实测三个胶囊高度分别 **38.1 / 21.7 / 58.3px**。<br>改法：`.react` 加 `flex:none` + `white-space:nowrap`，`.react-bar` 改 `flex-wrap:wrap`（装不下就整胶囊换行，不压字）；分享/举报按社区列表页 `.pa-report` 的层级降为**次级文字动作**，并放进 `.react-sub{flex:1 1 100%;justify-content:space-between}` 独占一行。<br>**修复后实测**：第一排三个胶囊等高 38.1px，第二排 `.react-sub` 344×39.7px，分享在左、举报在右；放大截图 `/tmp/r2-pd-crop2x.png` 里五个图标同色同粗同基线。<br>⚠ 两点如实记下：① `button` 的 UA 默认宽度（实测仍是 184px，`min-width:0` 压不动）现在**不再影响布局**，因为分布改由 `.react-sub` 决定；② 顺带发现「赞」的图标 `.ricon-heart` 是 `border-radius:50%` 的**空心圆**，看着不像心——属设计选择不是缺陷，留给 R3 台账记一笔。 |
| 首页 hero 的「买」「谱」两个字符按钮 | ⬠ 判定为**保留**（与计划相反，理由在此） | 计划把它列成"文字当图标"的违规。放大截图（`/tmp/r2-home-crop2x.png`）：白色粗体汉字在半透明深圆 + 浅色描边里，还带一个红点角标（买菜清单有待买项）。它是**单色、可被 CSS color 着色、跟大字模式缩放**的，且对中文用户比一个抽象购物车更好认（"买"=买菜、"谱"=菜谱库）。<br>换成 CSS 画的购物车/书本属于**视觉重做**，风险大于收益，所以本轮不动。<br>⚠ 这是 agent 的判断，不是既成事实——owner 若要换图标，改 `pages/home/index.wxml:50,53` 与 `.mh-ico-glyph` 即可，门禁第 20 项不会拦（汉字不在 Emoji_Presentation 清单里）。 |
| 四条前端门禁 | ✅ 全绿 | `static-check`（现 20 项）/ `dish-logic.test` / `kitchen-logic.test` / `interaction-audit`（A/B/C 均 0）全部 `exit 0`。 |

### 第六轮 R3（2026-09-19）：UI 台账 v1 + 图块/头像规格表 + 新门禁 21

| 项 | 结果 | 证据：怎么量的 / 修复前测到什么 / 修复后测到什么 |
| --- | --- | --- |
| `miniapp/test/ui-ledger.js`（生成物，已挂 CI） | ✅ | 零依赖，扫 48 个页面/组件模板 + WXSS，产出 `artifacts/ui-ledger/ledger.{md,json}`，按四条主线逐页给：图块边长、圆角取值、加载态、空态、裸 rpx/px、emoji 数、CSS 图标数、未声明组件、置了没人读的状态位。<br>`.github/workflows/miniapp-ci.yml` 加第 5 个 run 步骤（恒 exit 0，跑挂了才算红），改完用 `ruby -ryaml` 解析过、steps=7。<br>⚠ **主指标中途换过一次**：第一版把"同一角色的实现数"按**去重后的取值/写法**计，于是我把 9 个裸值换成 5 个 token 之后，指标反而从 12 涨到 13——它在给规格表改名，不是在收敛。现在只数**还没进 token 表的裸值种数**（归零才算管住），另报 token 种数（防止表长私人偏方）。<br>当前读数：四条主线 图块裸值 **4**、圆角裸值 32、加载态 3 种、空态 2 种；全站 17 / 54 / 4 / 3。 |
| 图块与头像收进一张规格表 | ✅ 11 处裸值 → 6 个命名角色 | 台账量出"行里那道菜的缩略图"同一角色有 **96 / 104 / 112 / 120 / 146** 五种值、行内小标记 **82 / 88** 两种。逐个看过后**不是一件事**（周菜单一天两道、买菜清单一行一料，密度本就不同），所以不强行并成一个数，改成**每个角色有名字**：`--dish-thumb`(146) / `--tile-row-sm`(104) / `--tile-chip`(88) / `--tile-cover`(168) / `--tile-grid`(177) / `--tile-pick`(148)。<br>换进去的 11 处：weekly-menu `.wm-thumb`、shopping `.mkt-thumb`、kitchen `.k-img`、favorites `.fav-pthumb`、recipe-edit `.rc-pick-cell`（这 5 处**数值没变**，只是有了名字）；me `.mag-thumb` 120→104、me `.mag-skel-thumb` 96→104、import `.r-thumb` 112→104、notifications `.thumb-dish` 82→88、community `.precipe .rthumb` 104→token（这 5 处有 ≤16rpx 的实际变化，已逐页截图核过没有破版：`/tmp/r3-pages-me-index.png`、`/tmp/r3-pkg-extra-import-index.png`）。<br>**顺带修掉一个真缺陷**：「我的」页做菜记录的骨架块是 96rpx、替身的真卡是 120rpx——**骨架和它替身的内容不同尺寸**，数据回来那一瞬整行会跳。两处统一到 104。<br>**同一个作者在两处不同大小**：社区列表头像 84rpx、帖子详情头像 92rpx、评论行 72rpx → 补 `--ava-row` / `--ava-head` / `--ava-cmt` 三个角色名（数值不变，先止住"下一页写第四个数"）。 |
| 新门禁 21：类名带 `thumb` 的图块边长必须走规格表 | ✅ 已钉，落地 0 命中 | **反向验证**：把 `.wm-thumb` 改回 `104rpx` → `exit 1` 点名 `pkg-extra/weekly-menu/index.wxss:257 .wm-thumb -> width/height 是 104rpx / 104rpx，没走 --dish-thumb / --tile-* 规格表`；还原 → `exit 0`。<br>⚠ 判据第一版按 `thumb|cover|pic|img` 扫，报 **48 条**，其中 34 条是误报（`*-hero-img`、`*-cover`、骨架块本来就是 `100%` 或另一个角色）；收窄到"类名含 thumb 且宽高是裸 rpx 的正方形"，并放过 `border-radius:50%` 的圆头像，才是现在这 6 条真命中。 |
| 计划里的门禁 22（裸圆角一律禁止） | ⬠ **判定不做**，理由记下 | 实测：全站 `border-radius:<n>rpx` 裸值 **168 条**，其中数值恰好等于某个现有 `--r-*` token 的只有 **8 条**；而这些 token 是按**用途**命名的（`--r-sheet` = 上推 sheet、`--r-card` = 卡片），把一处图片圆角写成 `var(--r-sheet)` 比 `20rpx` 更难读。众数还落在 2/3/4/6/12rpx 这些描边与小标签上，压根不该有 token。<br>这和当初放弃 `--fs-*` 改名是同一个形状：收益是命名一致，代价是 168 处视觉回归风险。**只做了有道理的那一条**：`pages/menu/index.wxss` 的 `.m-week-card` 从 46rpx 归到 `--r-xl`(42rpx)——一个没有出处的数，差 4rpx 看不出来，但回到刻度上才不会又漂出 45/47。 |
| 台账报的 4 处裸 px | ✅ 逐个核过，全部保留 | `pages/recipes/index.wxss:24 right: 96px` 与 `pkg-extra/vip/index.wxss:42 padding: 51px`——看着像"该写 rpx 写成了 px"，实际前者是**胶囊避让的兜底值**：`utils/capsule.js:24` 算的就是 `windowWidth - menuButton.left + 8` 再拼 `'px'`，而页面 WXML 本来就绑了 `style="right: {{capsuleRight}}"`（`pages/recipes/index.wxml:9`），胶囊是各机型定宽的控件，**用 px 才对**；后者是 VIP 页（不在四条主线、也不在上线范围）。<br>另两处 `backdrop-filter: blur(6px|18px)` 本来就是 px（模糊半径不该随屏宽缩放）。<br>台账已改成**只数几何属性上的 px**，不再把 blur 算进来（否则每次都是噪音）。 |
| 周菜单一个加载态都没有 | ✅（台账抓出来的，不是猜的） | 逐页读数里 `pkg-extra/weekly-menu` 的加载态是「**无**」：首屏直接渲染统计卡的「0 天 / 0 道 / 0 个」，等数据回来才跳成真实数字——和 R1 那批"把没加载完说成没有"同一类。<br>改法：加 `<state-loading visible="{{loading}}" text="正在排本周的桌…" />`，并把内容块条件从 `!loadError` 收紧成 `!loadError && !loading`；`index.json` 同步补 `state-loading` 声明（漏了就会被门禁 18 抓住，等于自测）。<br>四条主线加载态因此从 4 种降到 3 种（骨架屏 / state-loading / 手写 spinner）。 |
| 四条前端门禁 + YAML | ✅ 全绿 | `static-check`（现 21 项）/ `dish-logic.test` / `kitchen-logic.test` / `interaction-audit` 全部 `exit 0`；`ruby -ryaml` 解析改过的 workflow。 |
| 台账留下的下一步靶子（不是待办清单，是**读数**） | ⬠ 未做 | 四条主线还剩 4 个裸图块值（社区发帖选图格 132、详情图 138、recipe-edit 小图标 48/88）；圆角裸值 32 种；头像在非主线页还有 200 / 208 两个值；全站裸 rpx 3717 处（**已接受**，理由见台账末尾「已接受的债务」）。 |

### 第六轮 R4（2026-09-19）：做菜主线按成熟做法补齐

| 项 | 结果 | 证据：怎么量的 / 修复前测到什么 / 修复后测到什么 |
| --- | --- | --- |
| 每步计时槽落盘，跨"关掉再进"存活 | ✅（实测倒数继续走） | 原来 `_slots` 只挂在页面对象上（`cook-mode/index.js:78`），厨房总控页却按 `menuItemId` 把计时存进 storage——**同一个"炖着 20 分钟"，一个入口跨路由活着、另一个重进就没了**。<br>改法：不发明新机制，复用厨房页那套四元组 `{total, baseAt, baseLeft, running}`，键 `cook_timers_<recipeId>`；落盘点 = 起/停/重置/换时长/换步/到点/`onUnload`；完成时连同键一起删。<br>**量法**（模拟器真跑）：第 2 步铺 20:00 起跑 → 重进前读到 **19:32**（`left=1172`）→ `simulator_refresh` 整页重启 → 重新进入本页 → **19:04**（`left=1143`），且 `left === 由 baseAt 反算的值`（说明不是重新铺满 20:00，也不是归零，是按墙钟续跑）；`current=1` 说明步骤进度也一起续上了。<br>落盘内容实测：`cook_timers_101 = {"1":{"total":1200,"baseAt":1789831183719,"baseLeft":1200,"running":true}}`。<br>⚠ 中途一次**假警报**：我拿 `Object.keys(wx.getStorageInfoSync().keys)` 去筛键名，`keys` 本来就是数组，取 `Object.keys` 得到的是下标字符串，于是筛出空集、差点记成"没落盘"。判据：**读 storage 键名直接用 `.keys`，别再套一层**。测完已清掉这两条键。 |
| 恢复算法与厨房页共用一份 + 钉测试 | ✅ | 算法挪到 `utils/kitchen.js` 的 `restoreTimerSlots(saved, stepCount, now)`（`now` 由调用方传，测试才能钉住时钟），`cook-mode` 只负责读写存储。<br>`kitchen-logic.test.js` 加 7 条断言：15 分钟前的 20 分钟计时**剩 5 分钟且仍在跑**；暂停的槽原样回来不许自己续跑；离开期间到点的槽**落在 00:00 而不是整槽消失**（用户回来要知道那 20 分钟过了）；越界 / `total=0` / `null` 脏数据全丢；`null` 与字符串脏值都不炸。 |
| 进度段可点，直接跳到那一步 | ✅（实测点段跳步） | 原来只能线性 `上一步 / 下一步`，回头看第 3 步要连点 5 次往回退。<br>改法：`.dots` 每段 `catchtap="onDotTap"`，**视觉一点没动**——热区靠 `.dot::after` 撑到 88rpx（段本身只有 8rpx 高，手指点不准），左右各留 6rpx 防误触相邻段。<br>**量法**：`automation_element_action --action tap --selector .dot` → `current` 由 1 变 **0**、`dots` 变 `now|`、正文换成第一步、`cook_progress_101` 同步写成 `{i:0,total:2}`。<br>截图 `/tmp/r4-cookmode.png` 同时确认并行场景没退化：顶栏下方那枚「第二步还剩 18:03 · 回去 ›」小条在跑、点它跳得回去。<br>⚠ 遗留（留给 owner 定，不是 bug）：**可点没有任何可见可供性**——截图上就是两根条。要加数字或"点段跳步"提示都是观感改动，不该在上线前替 owner 决定。 |
| 屏幕常亮 | ✅ **早就实现了**（计划写错了） | 计划把"做菜期间屏幕常亮"列成要补的三项之一。读代码发现 `cook-mode/index.js:94-97` 已 `onLoad` 开、`:108-113` 已 `onUnload` 关，**这条是空枪**。<br>⚠ 但"设了 `keepScreenOn` 真机就不熄屏"这件事模拟器证不了（模拟器不睡眠），**仍需真机确认一次**。 |
| 常驻底栏显示已用/剩余 | ⬠ **判定不加** | 成熟应用确实常见一条常驻计时条。但本页实测已有三处覆盖同一信息且各有分工：顶栏「计时」按钮（`running` 时高亮）、离开那步的 `bgchip` 小条（带剩余 + 一键回去）、当前步的计时面板。<br>再加一条会把同一数字显示四遍，在小屏（667px）上挤掉步骤正文。记为"看过、比较过、不做"，不是漏做。 |
| 交互体检 A 类撞到新元素，顺带修掉检核器一个盲区 | ✅ 已反向验证 | 新加的 `.dot` 被 A 类点名（好门禁该有的样子）。但我的反馈写法是 `.dot:active { background: 提亮 }`——**进度条做 `scale` 会让相邻段看着在抖**，不该用 `.tap-scale`。<br>根因是 `interaction-audit.js:37` 的 `FEEDBACK` 只认 `tap-scale / tap-dim / hover-class` 三种写在标签上的写法，看不见同页 WXSS 里的 `:active`。补成第四种合法写法（只认紧贴 `:active` 的那个类名，`.a .b:active` 算 `b` 不算 `a`），并**反向验证**：删掉 `.dot:active` 那条规则 → A 类重新报 1 处；还原 → 四条门禁全 `exit 0`。 |
| 四条前端门禁 | ✅ 全绿 | `static-check`（21 项）/ `dish-logic.test` / `kitchen-logic.test`（含新增 7 条断言）/ `interaction-audit`（A/B/C 均 0）全部 `exit 0`；console 宽 grep 无 error/warn。 |

### 第六轮 R5（2026-09-19）：做菜收尾端到端 + 弹层可达性 + 深色对比度成表

| 项 | 结果 | 证据：怎么量的 / 测到什么 |
| --- | --- | --- |
| 做菜 → 记一笔 → 回写菜单 → 扣冰箱 → 记录页可见 | ✅ 全链路通（测完已还原） | **量法**：先给开发库拍快照（家庭 3：菜单项 1013 `todo`、鸡蛋 `8 个`、`cook_history` 116 行 / max id 1121）→ 模拟器打开 `cook-mode?recipeId=101&menuItemId=1013` → 跳到末步 → 调页面对象自己的 `onFinish()`。评分面板是 `wx.showActionSheet`（**原生面板，自动化够不到**，属真机项），所以只把这一个函数换成"选第 1 项＝5 分"的替身，其余全走真实路径。<br>**实测到**：① `daily_menu_item 1013` → `done`（菜单联动在弹面板之前就同步回写）；② `cook_history` 新增 `id=1122, recipe_id=101, family_id=3, score=5`；③ 冰箱 `鸡蛋 8 个 → 6 个`（菜谱用量 2 个），`紫菜 1 包` **不扣**（菜谱要 8g、库存单位是"包"，单位不符按设计不扣），菜谱里的"香葱 1 根"库存没有 → 不凭空建行；④ 页面栈变成 `cook-mode → cook-log`，记录页**无需手动刷新**就显示新条目（截图 `/tmp/r5-cooklog.png`：紫菜蛋花汤 · 家人 掌勺 · 09.19 晚 · 五星 · 共 11 条）。<br>**还原**：`DELETE cook_history id=1122`、`鸡蛋` 改回 `8`、菜单项改回 `todo`，`simulator_refresh` 后 `typeof wx.showActionSheet === "function"`（替身没留下）。<br>⚠ 我一度把活跃家庭当成 family 1（快照查询第二列就是 family_id=3，是我读错），差点把"鸡蛋没扣"记成缺陷。判据：**跨家庭数据先看 family_id 再下结论**。 |
| 弹层可达性（小屏逼近） | ⬠ 844 档实测通过；667 档只能算，键盘态仍属真机 | 模拟器 CLI **没有换视口的能力**（`automation_viewport_action` 只有 pageScrollTo/screenshot/remote/close），所以分两步：<br>① **实测 390×844**：社区发帖弹层打开，「取消 / 发布」两颗按钮完整可见、压在 tabBar 之上（`/tmp/r5-postsheet.png`）——`state-sheet` 的 `lift` 生效。<br>② **667 档用 CSS 算**：弹层内容实测高约 460pt（截图量得），可用高 = `80vh − --tabbar-h` = `0.8×667 − 64 ≈ 469pt`（`--tabbar-h = 128rpx + 安全区`，`app.wxss:102`）→ **只剩约 9pt 余量**；`.ss-sheet` 是 `overflow-y:auto`，超出即可滚，所以"够不够得着"在小屏上取决于**键盘弹起后**的行为。<br>⚠ 键盘把 fixed 弹层顶上去这件事模拟器复现不了（软键盘不占视口），**仍列真机项**：真机 SE 档点标题/正文输入框，看「发布」还在不在。<br>顺带核对：只有 tab 页（社区）的两个弹层挂了 `lift`，`recipe-edit`/`family/members` 三个在非 tab 页、不需要抬——**没有漏网**。 |
| 深色模式对比度成表（能逼近的那半） | ✅ 算完，撞出浅色档一处不达标 | 直接按 `theme.json` 的 light/dark 两套值算 WCAG 对比度（像素级观感仍属真机）：<br>`paper/ink` 14.41 → 14.82；`paper/mut` 4.70 → 6.04；`paper-2/ink` 12.86 → 13.16；`surface/ink` 15.27 → 13.50；`surface/mut` 4.98 → 5.50；`paper/pop` 3.69 → 6.02；**`paper/gold-deep` 3.04 → 7.20**。<br>→ **深色档全线比浅色档更好**（金色从 3.04 跳到 7.20），没有新缺陷。<br>→ 浅色档暴露一个问题：`--gold-deep` 作小字（眉标题、`粤菜 · 28 分钟` 这类元信息）在**三块底上分别是 3.04 / 2.71 / 3.22**，其中 `--paper-2` 上 **2.71 连"大字号/UI 组件 3.0"这条底线都没到**；全站 `color: var(--gold-deep)` 共 **73 处**。<br>保持色相压暗到：≥3.0 需 `#a58145`（明度 48.8→45.8，几乎看不出）；≥4.5（AA 正文）需 `#836636`（明度→36.3，明显变深铜色）。<br>⚠ **这是品牌观感决定，不替 owner 做**：改一个 token 就影响 73 处，列进 §8 待决。`--pop` 那条 3.69 查过**没有实际文字用它**（`color: var(--pop)` 0 处声明，只出现在 hero 大标题的 `.pop` 上，属大字号），所以不动。 |
| 组件内部量不到（本轮的取证边界） | ⚠ 已知限制，用替代法 | `automation_element_action --selector ".ss-sheet"` 取不到值——自定义组件的内部树对自动化**不开放**（与 `wx.createSelectorQuery` 在 eval 上下文里失效同源）。所以弹层那一项改成"截图量高 + CSS 算术"，而不是 `scrollHeight/clientHeight` 直读。 |

### 第六轮 R6（2026-09-19）：后端读路径与执行计划

取证方法：`SET GLOBAL general_log='ON' / log_output='TABLE'` → 打接口 → 从 `mysql.general_log` 取**代码里那条原句**再 EXPLAIN（不用简化过的谓词，避免量出假绿）。
第二实例起在 **9089**（不动 owner 在用的 9088），测完 `kill`、`general_log='OFF'`、`TRUNCATE mysql.general_log` 复原。

| 项 | 结果 | 修复前 EXPLAIN（真实 SQL）→ 修复后 |
| --- | --- | --- |
| 社区 feed 每请求做一次**全表收藏聚合** | ✅ 已修 | 修复前（原句含 `LEFT JOIN (SELECT post_id, COUNT(*) FROM community_post_favorite GROUP BY post_id) fav`，**没有按本页 post 收敛**）：<br>`1 PRIMARY p range idx_post_audit rows=4 Extra: Using index condition; Using where; Using filesort`<br>`2 DERIVED community_post_favorite index uk_post_user → 整张收藏表扫一遍再物化`<br>修复后：改成按行相关子查询 `(SELECT COUNT(*) ... WHERE f.post_id = p.id)` → `5 DEPENDENT SUBQUERY f ref uk_post_user Using index`，**每页只数 20 次**，派生表物化消失。 |
| feed 的 OR 让 `idx_post_audit` 退化成 filesort | ✅ 拆成 UNION ALL 两段 | 语义不能丢（作者要看得见自己待审的帖），所以拆两段：`APPROVED` 一段、`PENDING AND author=?` 一段，各取 `offset+size` 条再合并排序。<br>修复后 EXPLAIN：`2 DERIVED p ref idx_post_audit Using where`——**帖子扫描本身不再 filesort**，只剩外层对 ≤2×(offset+size) 行做一次合并排序（`<derived2> Using filesort`，行数是个位数）。<br>⚠ **改完第一版 6 个用例全 500**：UNION 分支里的 `ORDER BY ... LIMIT` 不加括号会被当成作用于整个 union，MySQL 直接 1064（`error near 'UNION ALL'`）。已在代码注释里钉住这条。 |
| 菜谱列表的派生表 + 哈希连接 | ✅ `Using temporary` 消失 | 修复前：`1 PRIMARY recipe ALL ... Extra: Using where; `**`Using temporary; Using filesort`**` + `1 PRIMARY <derived2> ALL Using join buffer (hash join)`。<br>修复后：两个相关子查询取 `cook_count` / `last_cooked_at`，走 `idx_cook_history_family` 的 `ref`，`Extra` 只剩 `Using where; Using filesort`——**临时表没了**。<br>⚠ 如实记下没赢的部分：`recipe` 上仍是 `type=ALL`。可见范围那一长串 OR（`community OR family_id=? OR is_public=1 OR family_id IS NULL OR owner_user_id=?`）本来就非 sargable，**加任何复合索引都用不上**，所以计划里说的 `idx_recipe_visibility(status, source_type, family_id, rating, id)` 我**没有建**——建了优化器也不会选，白付写放大。当前 dev 库 18 行、`/api/recipes` 8ms。 |
| 新测试：合并分页不重不漏 | ✅ 2 条，且验过有牙 | `CommunityFeedUnionTests`：① 造 6 条已过审（含两组并列赞数，逼出 `id DESC` tiebreak）+ 1 条作者待审且 999 赞，逐页走完断言**无重复、无遗漏、相对顺序 = like_count DESC → id DESC**，且待审帖**只对作者可见**；② 收藏数改成按行子查询后，值仍等于实际行数（2）。<br>不断言总条数——测试库里有别的用例留下的帖子，判据改成"我这批帖子的相对次序"才与全库数据无关（第一版断 `hasSize(7)` 就是这么误红的）。<br>**反向验证**：把第二段的 `audit_status='PENDING' AND author=?` 去掉 `audit_status` 条件让两段重叠 → 测试点名「第 3 页出现重复条目 102（UNION 两段没互斥）」→ 还原。 |
| 顺带看到的一条（未改，记账） | ⚠ 待评估 | general_log 按形状聚合时看到**每个 API 请求都带 3~5 次鉴权链查询**（`user_membership` 有效期、`family_member` 归属、`user_account` 全字段），量级是业务查询的好几倍。这是拦截器逐请求查库，不是某个接口的缺陷；当前 QPS 下无感，**上线后要真出问题再动**（缓存会话→用户→家庭三元组即可），本轮不碰。 |
| 门禁 | ✅ 全绿 | `mvn test` **183 项 0 失败**（181 + 新增 2），并且 `-Dsurefire.runOrder=reversealphabetical` 反序全量同样 0 失败。 |

### 第六轮 R7（2026-09-19）：三处写路径竞态 + 社区"不存在"改 404

| 项 | 结果 | 证据：怎么量的 / 修复前测到什么 / 修复后测到什么 |
| --- | --- | --- |
| 并发点赞不再 409 | ✅ | 修复前：先 `SELECT 1 FROM community_post_like` 再决定 INSERT/DELETE，两条同时到达都读到"没点过"，第二条撞 `uk_post_user` → 409「记录已存在，请勿重复操作」。<br>**量法**：`CommunityWriteRaceTests` 用 `CyclicBarrier(2)` 把两个请求对齐到同一瞬间。**修复前实测 `[200, 500]`**（第二条不是 409 就是死锁 500），**修复后 `[200, 200]`** 且 `like_count == COUNT(community_post_like)`。 |
| ⚠ 两个失败的第一版（都记下来，别再踩） | 已推翻重做 | ① **`INSERT IGNORE` 更糟**：它撞唯一键时取的是**共享锁**，两个线程各持一把 S 锁再去 DELETE → InnoDB 死锁，实测 `CannotAcquireLockException: Deadlock found when trying to get lock; try restarting transaction`，接口 500。② **`ON DUPLICATE KEY UPDATE` 的受影响行数判方向也不可信**：Connector/J 默认 `useAffectedRows=false`（按**匹配行数**报），"行存在且值没变"照样返回 1，于是"取消点赞"被错判成"新点赞"——`CoreFlowTests.communityPostLikeTogglesAndKeepsCountInSync` 当场抓到（`Expecting value to be false but was true`）。<br>最终写法：回到"先探后写"，把 `DuplicateKeyException` 与 `ConcurrencyFailureException` 一起纳入**事务外重试**。 |
| 事务外重试（`inTxWithDeadlockRetry`） | ✅ 实测被触发 | MySQL 对死锁给的建议原文就是 "try restarting transaction"，而 `@Transactional` 自己没法重试自己（回滚后方法内状态不可信）。做法：注入 `PlatformTransactionManager` 建 `TransactionTemplate`，写入口改成 `inTxWithDeadlockRetry(() -> ...)`，冲突时最多重启 2 次。<br>**证据**：测试日志里能看到 `WARN ... 并发冲突，重启事务（第 1 次重试）`，分别出现在 `UPDATE community_post p SET like_count=...`（点赞）与 `冰箱库存被同时改动，本次扣减需要重试`（扣库存）上——**重试路径是真被走到的，不是摆设**。 |
| 两人同时做完同一道菜，两次扣减都在 | ✅ | 修复前：把库存读进 Java、算完写**绝对值**，两边都算出 6 → 后一次的扣减凭空消失（实测断言 `6.0 isBetween [2.0, 4.0001]` 失败，正是旧行为）。<br>改法：`UPDATE ... WHERE id=? AND family_id=? AND amount <=> <读到的原值>`（乐观条件），0 行即冲突。<br>⚠ **第一版在同一事务里"重读一次"是无效的**：REPEATABLE READ 的快照停在第一次读那一刻，重读还是 8 → 又算出 6。改成**抛 `OptimisticLockingFailureException`** 让外层开新事务（新快照）重来，才真的扣到 4。<br>`amount` 仍是 VARCHAR（改 DECIMAL 属另一件事，本轮不动），所以比较用 `<=>` 带原始字符串。 |
| 并发评论不再回显成别人的文字 | ✅ | 修复前 `addCommunityComment` 回显用 `WHERE post_id=? ORDER BY id DESC LIMIT 1`（该帖最新一条）→ A 发完看到的可能是一毫秒前插进来的 B 的评论。<br>改法：`PreparedStatement(…, RETURN_GENERATED_KEYS)` 拿自增 id，按 id 回显；拿不到 id 时才退回"最新一条"（并写明这条兜底可能回显错、但好过把接口打成 500——第一版我写的 `WHERE c.id = ?` 传 null 就是这个坑，`EmptyResultDataAccessException` 直接 500，已改成两条明确路径）。<br>**量法**：两线程各发两条不同文案，断言每次响应 `content` 等于自己发的那条 → 4 条全对。 |
| 社区"资源不存在"从 400 改成 404 | ✅（一处刻意保留 400） | `ensureCommunityPostExists` 等三处 `IllegalArgumentException("community post not found")` → `ResponseStatusException(NOT_FOUND, ...)`，与菜谱详情（`:767`）同一语义；作者看自己被下架的帖仍带中文原因（`该分享因违规已被下架`），客户端 `api.js` 读的是 `data.error`，状态码变了文案没变。<br>⚠ **删除接口重复删除故意留 400**：那条 SQL 把"已经删了"和"不是你的帖"合并成一句文案，就是为了不让外人用状态码探测某条帖是否存在——改它等于把这个反探测设计拆掉。测试注释里写明了。 |
| 门禁 | ✅ 全绿 | `mvn test` **186 项 0 失败**（183 + 新增 3）；反序全量同样 0 失败；**竞态类连跑 3 次都过**（这类测试必须测稳定性，不然 CI 上会随机红）。 |

### 第六轮 R8（2026-09-19）：购物清单的每行一次四表连接 + "今天"的时钟口径 + 前端超时

| 项 | 结果 | 证据：怎么量的 / 修复前测到什么 / 修复后测到什么 |
| --- | --- | --- |
| 清单"来自哪道菜"改成两条查询 + Java 分组 | ✅ | **修复前**（拿代码里那条原句 EXPLAIN）：`1 PRIMARY` + **4 个 `DEPENDENT`** —— 那个 `GROUP_CONCAT(... FROM daily_menu_item JOIN recipe JOIN recipe_ingredient JOIN shopping_list)` 相关子查询**每行条目都要重跑一遍四表连接**。加 3 道菜的清单就是 3 次。<br>**修复后**：条目一条 SQL、来源映射一条 `SELECT DISTINCT ri.ingredient_name, r.title ... WHERE sl.id = ?`，在 Java 里按食材名分组。实测一次 `GET /api/shopping-list/today`（新会话、菜单里 1 道菜、清单 3 条）总共 12 条 SQL，其中 `shopping_list_item` 只出现 **1 次**、`GROUP_CONCAT` **0 次**。<br>顺带解掉 `GROUP_CONCAT` 受 `group_concat_max_len`（实测默认 **1024 字节**）静默截断的问题——两道菜共用"生抽"时来源菜名可能被砍掉一半，Java 侧拼接没有这个上限。<br>⚠ 顺序保持：原来 `GROUP_CONCAT(... ORDER BY r.title)` 是按菜名排，Java 侧也照排，否则清单上来源的顺序会在两个版本之间跳。 |
| 补上"来源"的测试（改之前没人管这块） | ✅ 2 条 | `grep sourceRecipes src/test` 是**空的**——既有测试只验清单条目数量，恰好我改的就是来源那一段，所以单独钉：① 加菜谱 101 → 清单里"鸡蛋"的 `sourceRecipes` 必须含"紫菜蛋花汤"；② 每条都必须带 `sourceRecipes` **数组**（前端按 `.length` 决定要不要显示来源，给 null 会让那一行整个消失）。 |
| `loadPreviousPurchasedMap` 不再顺带跑来源回溯 | ✅ | 它只要"名字/单位/买没买"三样，原来却调 `loadShoppingItems`（连带把上面那条四表连接再跑一遍）。改成一条只读三列的 SQL。重建清单每次都会调它，等于白付一次。 |
| "今天"统一到数据库时钟 | ✅ | `WishService.parseDate` 的兜底原来是 `LocalDate.now()`（JVM 时钟），而菜单侧用 SQL `CURRENT_DATE`。JDBC 连接钉了 `serverTimezone=Asia/Shanghai`，JVM 可能是 UTC —— 夜里许愿会落到菜单看不到的那天。<br>改成 `dbToday()` = `SELECT DATE(NOW())`，与 `AdminService.metrics`（同一个坑，注释里写着"日期锚点取自数据库 NOW()"）一致。 |
| 前端超时按方法分档 | ✅ | `utils/api.js` 原来读写都是固定 10s。改成 GET 15s、写请求保持 10s：读慢了用户宁可多等（页面本来有加载态），写请求等太久会让人以为没戳上再来一次——那才是重复提交的来源。游客重取 token 那条 POST 保持 10s 没动。 |
| 刻意没做的一条 | ⬠ 记为待决 | `ensureTodayMenu` **在 GET 里写库**（`TodayService:44-47 / 102-106 / 217-252`，靠唯一键兜底才没写重）。改它要动 4 个端点的语义，而它现在没有用户可感知的症状 —— 属"另开一轮"的活，不在上线前等修。 |
| 门禁 | ✅ 全绿 | `mvn test` **188 项 0 失败**（186 + 新增 2）；四条前端门禁（含 21 项静态检查）全部 `exit 0`。取证用的第二实例（9089）已停、`general_log` 已关并清空、9088 上的开发服务没动过。 |










## 3b. 后端 / 数据库上线前审计（2026-09-19 三轮，逐条实测过才写）

方法：全量读 13 个 controller + 18 个 service/config + `schema.sql` + 两份 profile + compose/Dockerfile/nginx 样例，
再用本地 MySQL 的 `EXPLAIN` / `information_schema` 复核。**结论里凡是「实测」二字都对应一条可重跑的查询**。
dev 库行数极少（cook_history 26 行、community_post 3 行），所以 `rows=` 数字没有意义，
判断一律建立在**索引定义 + plan 形状**（`type=ALL` / `Using filesort` / `DEPENDENT SUBQUERY`）上，这两者不随基数变。

### 本轮已修（都有测试或 EXPLAIN 证据）

| 项 | 证据 |
| --- | --- |
| **生产上所有用户图片会在上传满 7 天后集体 404** | 链路：`UploadSigner.sign()` 把 `/uploads/x.png` 签成带 `e=<过期>&k=<签名>` → 小程序展示网络图必须用完整 URL，于是 `utils/upload.js:53` 自己拼上 API 域名 → 编辑菜谱/发帖时把这个**绝对**值原样回传 → `UploadPathNormalizer` 旧实现只认 `startsWith("/uploads/")`，绝对形态整个漏网 → 库里存进带过期的链接。本地签名默认关着，所以这条只在生产成立、走查看不出来。已改为把相对/绝对、签名/未签名四种形态统一剥成相对裸路径，外链一律不碰；补 `UploadPathNormalizerTests` 5 条形状断言（含 `/assets/uploads/` 这种伪装外链） |
| **`docker compose up -d`（清单推荐的部署方式）根本起不来** | prod profile 下 `UploadSigner` 构造期强制要求 `UPLOAD_ACCESS_SECRET`（实测 `application.yml` + 代码 `:64-71`），而 `docker-compose.yml` 只给了 `UPLOAD_DIR`、`.env.example` 里也没这个键 → 容器抛异常退出 → `restart: unless-stopped` 无限重启。已在 compose 用 `${UPLOAD_ACCESS_SECRET:?…}` 让 compose **当场报错并给出这句话**，`.env.example` 补键与生成方法 |
| **做菜记录页 + 每个菜谱列表请求都在全扫 `cook_history`** | 见 §7 新增的 `migrate-cook-history-family-index.sql`：改前 `type=ALL, possible_keys=NULL, Using where; Using filesort`，改后 `type=ref, Extra=Using index`（本地库实测，脚本重复执行安全） |
| **通知角标长期少报** | `SupportService.listNotifications` 的 `unread` 是数出来的：`(int) items.stream().filter(unread).count()`，而 `items` 只有最近 50 条。社区点赞/评论每条写一行通知，攒过 50 条后第 51 条之前的未读永远进不了这个 stream。改成单独 `COUNT(*) WHERE user_id=? AND unread=1`（正好走 `idx_notification_user` 的 `(user_id, unread)` 前缀） |
| **日志会写进手机号 / openid / 邀请码** | `GlobalExceptionHandler` 对 `DuplicateKeyException` / `DataIntegrityViolationException` 记的是 `ex.getMessage()`，而 Spring 的 DataAccessException 消息带着失败 SQL 和 MySQL 原文，`Duplicate entry 'xxx' for key 'user_account.uk_user_phone'` 里的 xxx 就是用户填的值。改为只记 `方法 + URI`（每个唯一键只属于一个接口，定位够用） |
| **没有存活探针** | 全站没有 actuator 也没有 `/healthz`（实测 `curl :9088/api/health` → 404），部署侧无法判断服务是否活着。新增 `GET /healthz`（挂在 `/api/**` 之外所以天然免鉴权、不用动白名单），返回 `{"status":"UP","db":"UP"}`、库连不上时 503；因为匿名可访问且每次打一次库，同步给它加了 60 次/分钟/IP 的限流规则。契约钉在 `HealthEndpointTests`（免鉴权可达 / 必须真打库 / 只允许这两个字段） |

后端测试从 153 → **164 条，全绿**（`./mvnw -o test`，跑前 `DROP DATABASE family_menu_daily_test_db` 以对齐 CI）。

### 已查清、本轮**故意没改**（等 owner 定，别当成漏网）

- `[MED]` **四个列表端点没有 LIMIT**：`GET /api/recipes`、`/api/recipes/filter`、`/api/me/favorites`
  都是把可见集合整张返回（`MysqlKitchenStore:155-187 / 796-848 / 322-381`），`/api/home/dashboard`
  更是「取全量菜谱 + 取 100 条帖子只展示 4 条」（`:85-119`，那个 100 是写死的，controller 的 clamp 管不到它）。
  **为什么没顺手改**：菜谱库现在是人工整理的 16 条 + 家庭自建，前端「菜谱」页是把整份列表拿去做本地搜索/筛选的，
  直接加 LIMIT 会把筛选功能改坏。要做得连着前端分页一起改，属于功能改动不是加固。
  **【2026-09-19 更新】四条里最没道理的那条已改掉**：`/api/home/dashboard` 的社区精选原来是
  `communityPosts(userId).stream().limit(4)`（捞 100 条 + 每条 JOIN 菜谱/收藏/点赞，只为展示 4 条），
  改成 `communityPosts(userId, null, 1, 4)`。
  **不是推断，是量出来的**：临时打开 MySQL 通用查询日志（`general_log`，原值 0、`log_output` 原值 FILE，
  测完都还原并清空日志表），打一次 dashboard 后从 `mysql.general_log` 里读回那条 SQL，
  结尾已是 `LIMIT 4 OFFSET 0`（改之前是 `LIMIT 100`）。
  等价性由 `CoreFlowTests#dashboardFeaturedPostsMatchTheFeedHead` 锁住：造 6 条帖子后断言
  首页 `featuredPosts` 与 `GET /api/community/posts` 的**前 4 条逐条同 id**
  （feed 排序是 `like_count DESC, id DESC`，所以"第 1 页 4 条"恒等于"整张列表前 4 条"）。
  ⚠ 这条用例锁的是**结果等价**，不是行数——行数是由 SQL 里的 `LIMIT 4` 直接保证的（已按上面办法核过）。
  另外三条（recipes / filter / favorites）仍按上面的理由不动，要连着前端分页一起做。
- `[MED]` **三条硬截断没有翻页入口**：做菜记录 `LIMIT 50`、帖子评论 `LIMIT 20`、通知 `LIMIT 50`
  —— 页面上都没有「看更多」，评论数角标会和列表不一致。同上，要连着 UI 改。
- `[部分已修]` **图片缓存此前完全失效**：`/uploads/**` 的自定义资源处理器只发 `Last-Modified`
  （自定义处理器不继承 `spring.web.resources.cache.*`），而签名 `exp = now + TTL` 每次响应都不同
  → 每次接口返回都是一个新 URL → 小程序按完整 URL 建缓存键 → **同一张菜图每进一屏重下一遍**。
  已修：`UploadSigner.bucketedExpiry()` 把 `exp` 按 TTL 分桶（取「下下个桶边界」，保证剩余有效期仍 ≥ TTL），
  同一周期内链接字节级稳定；`/uploads/**` 补 `Cache-Control: private, max-age=<同一个 TTL>`
  （文件名是 UUID、内容永不覆盖，可放心缓存）。钉成 `UploadSignerTests`，**已反向验证**：
  把 `exp` 改回 `now + TTL` → 测试点名「exp 落在 TTL 边界上（分桶）」并 BUILD FAILURE。
  **没做的那半**：服务端不压缩/不缩放（`UploadController:66` 是裸 `transferTo`，全站没有 ImageIO，
  上限 20 MB 三处一致）。故意不顺手加：手机 JPEG 带 EXIF 方向，`ImageIO.read` 会**丢掉 EXIF**，
  重编码后竖拍照片会横过来——这是会把好功能改坏的那种"优化"，要做必须连带读 EXIF 方向并旋转，
  得引 `metadata-extractor`/`commons-imaging`。而且小程序侧 `chooseImage` 已经传 `sizeType: ['compressed']`，
  常见路径进来的本来就是压缩图，所以这条的实际收益远没有上面那半大。留作上线后的独立改动。
  ⚠ 视频没有走压缩（`utils/upload.js` 只对图片请求 compressed），60s 教学片段是原样上传的。
- `[已修]` 发帖时同步调最多 7 次微信外部 HTTP（1 次文本机审 + 每张图一次），而三处
  `RestClient.create()`（`ContentSecurityService`、`WechatClient`、`AuthService`）默认**没有任何超时**
  —— 微信接口一慢就把 Tomcat 线程永久挂在 socket 上，且 `WechatClient.accessToken()` 整段在
  `synchronized` 里，一个卡住的 token 请求会连带拖死所有并发发帖。
  现统一走 `config/WechatHttp.create()`（建连 3s / 读取 8s），最坏情况降级成「这次机审失败 → 内容进人工队列」，
  而不是全站不可用。两处调用点本来就 `catch (Exception)`，所以超时是被接住的、不会变成 500。
- `[LOW]` `user_session` / `phone_otp` / `uploaded_file` / `admin_audit_log` 只增不清（有合适的索引却没有 `@Scheduled` 清理）。
- `[LOW]` `upload.dir` 默认是相对路径 `uploads`，jar 直跑时落在「当前工作目录」，换 CWD 重启会让已有图片 404。
- `[LOW]` `application-prod.yml` 的 JDBC URL 写死 `useSSL=false` + `allowPublicKeyRetrieval=true`：
  compose 内网拓扑下没问题，但把 `DB_HOST` 指向远程托管 MySQL 时等于凭据走明文。
- `ADMIN_BOOTSTRAP_TOKEN` 一旦设置就是**永久有效的单因子后台入口**（跳过验证码，只认服务端配的手机号），
  而 `deploy/nginx.conf.example` 里 `/admin` 的 IP 白名单是**注释掉的**。清单 §6 已写「用完立刻删」，
  部署时请真的删。

### ⚠ 提审当天会被审核员撞上的一个坑（值得先决定）

游客的 openid 是 `guest-xxx` 自造标识，而微信 `msgSecCheck` 只认真实 openid
（`WechatClient.realOpenid` 显式把 `guest-` / `phone-` / `invite-` 前缀判为 null），
所以**游客发的帖子/评论一律落 `PENDING` 人工队列**（`ContentSecurityService:87-91`）。
而 §4 的提审备注打算写「点击游客浏览即可体验全部功能」—— 审核员以游客身份发帖后会一直停在「审核中」，
且 §6 说明 `/admin` 在接真实短信网关前登不进去，等于**没人能当场放行**。
三个选项：(a) 提审备注里明确写「社区发帖需微信登录后才走机审，游客内容进人工审核队列」；
(b) 给游客发帖加一句可见说明（现在是静默 pending）；(c) 先接短信网关或临时开 `AUTH_DEV_OTP_ENABLED` 完成首绑再关。
本轮没动代码，等 owner 选。

---

## 4. 提审注意事项

> **LICENSE 的决定（2026-09-19 已问过 owner）：先不加。** 仓库是 public 但没有任何许可证文件
> （GitHub API 实测 `license.spdx_id` 为空），法律上等于「保留所有权利」，别人不能合法复用。
> 这是 owner 的显式选择，**别再自作主张补一个 LICENSE**；将来若要开源复用，再单独决定条款。

- [ ] 提审时勾选「用户隐私保护指引」已配置
- [ ] 审核备注里说明：本小程序为家庭菜谱管理工具，无付费功能、游客可直接体验；
      社区内容已接入微信 msgSecCheck 机审 + 站内举报人工审核
- [ ] 准备一个测试账号说明（游客模式免登录，可写"点击游客浏览即可体验全部功能"）
- [ ] 首次提审预计 1~7 天，被拒后按驳回意见修改重提

## 5. 日后功能解锁路径（代码已保留，改开关即可）

| 功能 | 开关位置 | 解锁前提 |
| --- | --- | --- |
| VIP / 微信支付 | [miniapp/utils/features.js](../miniapp/utils/features.js) `PAYMENT` | 主体升级为企业/个体工商户 + 开通微信支付商户号 + 配置 `WECHAT_MCH_ID` 等 + 配置 `WECHAT_PAY_PLATFORM_CERT_PATH`（回调 RSA 验签已实现，未配置证书时回调一律拒绝） |
| 手机号登录 | 同上 `PHONE_LOGIN` | 接入真实短信服务商（application.yml `sms.provider`，当前 noop） |

已上线功能备注：社区 UGC（`COMMUNITY: true`）文本机审已接 msgSecCheck；
图片机审（mediaCheckAsync 异步接口）暂未接，依赖举报队列人工兜底，后续可补。

---

## 6. 运营管理台（已实现）

管理台部署后访问 `https://<你的域名>/admin`，**仅管理员账号可登录**（手机号 + 验证码）。

### 6.1 首个管理员怎么来

`is_admin` 只能由环境变量白名单播种，代码不硬编码任何 openid：

1. 先用小程序登录一次，查库拿到该账号的 openid：
   `SELECT id, nickname, openid FROM user_account ORDER BY id DESC LIMIT 5;`
2. 部署时设置 `ADMIN_OPENIDS=<该 openid>`（多个用逗号分隔）。
3. 重启应用即自动升权（**只升权、不降权**，白名单为空则什么都不做）。
4. 该管理员须已绑定手机号才能登录后台（手机号在「我的 → 编辑资料」绑定，走验证码）。

> 💡 **本地开发怎么拿到验证码**：建 `server/config/application.yml` 写入 `auth.dev-otp-enabled: true`
> （该路径已被 gitignore，不进仓库也不进构建产物，对生产无影响）。之后验证码固定 `246810`，
> 并在点「获取验证码」后直接显示在登录页上。不配置的话该接口返回 503 并提示去开这个开关——
> 因为短信网关是 noop，码根本发不出去。

> ⚠️ **前置依赖：短信网关**。后台登录与手机号绑定都走验证码，
> 而当前短信实现是 `NoopSmsGateway`（只打 WARN，不真发短信）。
> 也就是说：**没接真实短信供应商之前，谁也绑不了手机号、进而谁也登不进 `/admin`**。
> 上线前必须接入真实网关（`SMS_PROVIDER`），或临时用 `AUTH_DEV_OTP_ENABLED=true`
> 完成首个管理员绑定后**立刻改回 false 并重启**（固定验证码 246810 期间任何人可登录任意手机号，风险自担）。

后续管理员之间的授予/回收在后台「用户管理」里操作，**不能修改自己的管理员状态**（不能修改自己的角色，也不能降级系统里最后一名超管）。

### 6.1.1 角色分级（RBAC）

后台权限分三个角色，在「用户管理 → 设为管理员/调整角色」里指定。权限点由后端逐接口校验，
前端只是按权限隐藏菜单和按钮——**改前端绕不过后端**。

| 能力 | 超级管理员 SUPER | 内容审核员 MODERATOR | 客服 SUPPORT |
| --- | :---: | :---: | :---: |
| 数据看板 | ✓ | ✓ | ✓ |
| 内容 / 评论 / 举报 / 导入 / 菜谱 | ✓ | ✓ | ✗ |
| 查询用户 | ✓ | ✗ | ✓ |
| 授权 / 封禁 / 开会员 / 改角色 | ✓ | ✗ | ✗ |
| 查询订单 | ✓ | ✗ | ✓ |
| 关单 / 退款 | ✓ | ✗ | ✗ |
| 反馈工单 | ✓ | ✗ | ✓ |
| 审计日志 | ✓ | ✗ | ✗ |
| 导出 xlsx | ✓ | ✓ | ✓ |

- 历史数据兼容：升级前 `is_admin=1` 的账号角色为空，代码按 **SUPER** 处理，不会突然失去权限。
- 两条防锁死约束：不能改自己的角色；系统里至少保留一名可登录的超管。
- 越权返回 403 并打 `WARN` 日志，审计日志里能看到谁尝试了什么。

### 6.2 管理台能力

| 模块 | 能做什么 |
| --- | --- |
| 数据看板 | KPI（用户/帖子/订单/累计收入，含近 7 天增减与迷你走势）+ 待办（待审帖子/评论/举报/导入、待处理反馈，有积压标红，点击直达列表）+ 近 14 天内容趋势折线图与收入柱状图 + 热门内容 Top5 + 最近注册 + 最近管理操作 |
| 举报审核 | 处理用户举报：下架 / 忽略；可按待处理/已下架/已忽略筛选；多选批量处置 |
| 内容治理 | 帖子审核与下架：待审核 → 通过 / 下架；已下架可恢复；多选批量通过/下架 |
| 评论管理 | 评论审核：待审核 → 通过 / 驳回；软删除与恢复；可按帖子 ID 过滤；多选批量通过/驳回，服务端分页 |
| 反馈工单 | 工单列表、受理、关闭、回复，服务端分页 |
| 导入审核 | 导入源待审队列：通过 / 驳回（带原因） |
| 菜谱治理 | 菜谱下架与恢复、按标题搜索 |
| 用户管理 | 检索用户、设置角色（超管/审核员/客服/取消）、人工开通会员、封禁/解封，服务端分页 + 按注册时间排序 |
| 订单管理 | 订单查询（金额、状态、支付方式）、关单、退款；按下单日期区间筛选、按金额/时间排序、服务端分页 |
| 审计日志 | 所有管理写操作留痕：谁、何时、对什么、做了什么、结果；服务端关键字搜索 + 日期区间 + 排序 + 分页 |

所有列表都能导出 **真正的 .xlsx**（不是改后缀的 CSV）：服务端用 JDK 自带的 `ZipOutputStream`
手写 OOXML，零第三方依赖；表头加粗配色、冻结首行、金额列带两位小数格式，
导出的是**当前筛选条件下的全量数据**（逐页取到 5000 行上限），每次导出都写审计日志。

> **提审口径**：微信审核问到 UGC 人工审核时，可直接说明——发布接 `msgSecCheck` 文本机审，
> 违规内容进站内举报队列，由运营在 `/admin` 人工下架，操作全程留审计日志。

### 6.3 安全须知

- `/admin` 建议在 nginx 加来源 IP 白名单（样例见 `server/deploy/nginx.conf.example`），不要裸对公网。
- 管理员登录**复用普通会话 token**（`user_session` 表，无独立有效期/独立类型），
  区别只在浏览器端存在 sessionStorage。因此：管理员在手机小程序里的 token 同样具备后台权限，
  后台权限由 `is_admin` + `admin_role` 共同决定（角色为空视为 SUPER）。如需强隔离，后续要加独立的管理员会话类型。
- 生产**严禁**设置 `AUTH_DEV_OTP_ENABLED=true`（固定验证码）和 `WECHAT_PAY_MOCK_ENABLED=true`（免付款开通）。
  这两个开关现在已在 `application-prod.yml` 里硬钉为 false，环境变量覆盖不了。

---

## 7. 部署方式

> **部署完第一件事：`curl https://<你的域名>/healthz`** → `{"status":"UP","db":"UP"}` 才算真的活着。
> 它匿名可访问（挂在 `/healthz` 而非 `/api/**`，因此不吃鉴权拦截器，也不用往白名单里加东西），
> 每次请求会打一次 `SELECT 1`——所以 `RateLimitFilter` 给它配了 60 次/分钟/IP，库连不上时返回
> **503** + `{"status":"DOWN","db":"DOWN"}`。uptime 监控、容器 healthcheck、nginx 探活都指它。
> 契约已由 `HealthEndpointTests` 钉住：免鉴权可访问、必须真打库、响应只允许这两个字段（匿名端点勿外泄驱动/异常信息）。

### 方式一：Docker Compose（推荐）

```bash
cd server
cp .env.example .env      # 填真实凭据；.env 已在 .gitignore 中，不会入库
docker compose up -d
# 首次部署必须执行两步建库（容器启动不会自动执行 schema/data）：
docker compose exec -T mysql mysql -uroot -p"$DB_PASSWORD" < sql/create-database.sql
docker compose exec -T mysql mysql -uroot -p"$DB_PASSWORD" family_menu_daily_db < src/main/resources/schema.sql
# 可选：体验环境导入演示数据（生产别跑，会注入演示家庭 + 免费年卡）
# docker compose exec -T mysql mysql -uroot -p"$DB_PASSWORD" family_menu_daily_db < src/main/resources/data.sql
```

> ⚠️ 只跑第 1 步会得到一个**没有表的空库**：应用仍能启动成功，但每个接口都返回 500。
> 现在 `SeedRunner` 会在启动时自检核心表，缺失就**直接启动失败并打印明确错误**，不会再静默 500。

### 方式二：直接跑 jar

```bash
cd server
./mvnw clean package -DskipTests
SPRING_PROFILES_ACTIVE=prod \
DB_HOST=... DB_PASSWORD=... WECHAT_APP_ID=... WECHAT_APP_SECRET=... ADMIN_OPENIDS=... \
java -Duser.timezone=Asia/Shanghai -jar target/family-menu-daily-server-0.1.0-SNAPSHOT.jar
```

> jar 方式记得显式加 `-Duser.timezone=Asia/Shanghai`（或设 `TZ`）。JVM 跑 UTC 时，
> 日期文案、"今天/本周"这类按天分档会和 MySQL 的 `NOW()` 差 8 小时。
> Docker 方式已在 `Dockerfile` 里设好。
>
> ✅ **登录态与验证码已不再依赖这个开关**（2026-09-19 修复）。原先
> `user_session.expires_at` 和 `phone_otp.expires_at` 是**用 JVM 时钟写入、
> 却用 SQL 的 `NOW()` 校验**：两个时钟差 8 小时时会话与验证码"一建立就过期"，
> 忘加这个 JVM 参数就等于全站登录 401。两处现已改为 `DATE_ADD(NOW(), INTERVAL ?)`，
> 单一时钟。`server-ci.yml` 更把 job 的 `TZ` 故意设成 `Asia/Shanghai`
> 而 MySQL 服务是 UTC —— 专门把两侧拧开当防回归。
> 实测：拧开时 4 项 OTP/登录用例失败（`Status expected:<200> but was:<401>`），
> 修复后 153 项全绿；本机默认 +08:00 下同样 153 项全绿。

### 生产配置要点（`application-prod.yml` 已固定）

- `SPRING_SQL_INIT_MODE=never`：生产**不会**自动执行 schema.sql / data.sql。
- `AUTH_DEV_OTP_ENABLED=false` / `WECHAT_PAY_MOCK_ENABLED=false`：已硬钉，环境变量改不动。
- `app.seed-demo-data=false`：生产不注入任何演示用户/家庭/帖子（本地默认也已改为 false；
  演示数据在 `data-demo.sql`，由该开关控制，见 `server/CONTEXT.md` 的「演示数据」一节）。
- 公共菜谱库（`data.sql`）与演示数据（`data-demo.sql`）是两个文件：前者是产品能力，后者才是演示内容。
  生产如需自带示例菜谱，手动执行一次 `data.sql`。
- 建库/迁移：
  - 新库：`sql/create-database.sql` + `src/main/resources/schema.sql`（后者可重复执行）
  - 旧库补列：`sql/migrate-legacy.sql`（一次性，列已存在会报错，可加 `--force`）
  - 旧库补索引：`sql/migrate-import-source-index.sql`（一次性；`import_source` 建表时漏了审核队列索引，
    后台「导入审核」列表会随数据增长退化成全表扫。重复执行报 Duplicate key name，可加 `--force`）
  - 旧库升级信息流索引：`sql/migrate-post-feed-index.sql`（2026-09-19 新增；
    社区 feed 按 `like_count DESC, id DESC` 排序，旧索引只到 `like_count`，第二排序键不在索引里。
    脚本是「先 DROP 再 ADD」，**重复执行安全**（第二次只是重建），大表请低峰期跑。
    ⚠ `schema.sql` 用的是 `CREATE TABLE IF NOT EXISTS`，**改了它不会动已存在的表**，
    所以存量库（含本地测试库）必须单独跑这个迁移，否则新加的索引根本不会出现。）
  - ⚠ **本条下面原来那句「加 id DESC 后 filesort 消失」是错的，2026-09-19 复核已更正**：
    那个 0.084ms 是用**简化过的**单条件查询量的（`WHERE audit_status='APPROVED' ORDER BY like_count DESC, id DESC`
    → `type=ref, Extra=Using index`，确实无 filesort）。但 C 端真实查询为了「作者能看见自己审核中的帖子」
    把 WHERE 写成了 `(audit_status='APPROVED' OR (audit_status='PENDING' AND author_user_id=?))`，
    实测 EXPLAIN 是 `type=range, key=idx_post_audit, Extra=Using index condition; Using where; **Using filesort**`
    —— OR 让优化器扫两段索引再排序，第二排序键进不进索引都救不了。
    索引本身仍该保留（它让排序前的访问变成索引范围扫、并给出确定的 tiebreak），但别把它当成「排序问题已解决」。
    真要消掉：把该查询拆成 `UNION ALL`（已过审一页 + 自己待审一页，各自按索引序取），或让待审帖子改走
    单独的「审核中」区块、feed 只查 APPROVED。**当前流量（几个家庭）不构成瓶颈，故本轮只记录不改**。
- 旧库补做菜记录索引：`sql/migrate-cook-history-family-index.sql`（2026-09-19 新增；
    `cook_history` 原本只有 `(user_id, cooked_at)` 和 `(recipe_id)`，而两条热查询都以 `family_id` 打头：
    ① 做菜记录页 `WHERE family_id ORDER BY cooked_at DESC LIMIT 50` → 实测 `type=ALL, possible_keys=NULL,
    Using where; Using filesort`（全表扫 + 排序，且这是全站行数增长最快的表）；
    ② 菜谱列表/首页那个「我家做过几次」派生表 `WHERE family_id GROUP BY recipe_id` → 派生表用不上
    以 `recipe_id` 打头的索引，等于每个菜谱列表请求全扫一次。
    补 `(family_id, cooked_at DESC)` 与 `(family_id, recipe_id)` 后两条都变 `type=ref, Extra=Using index`
    （本地开发库跑完实测，脚本用 `information_schema` + `PREPARE` 判断，**重复执行安全**——
    MySQL 8.4 不支持 `DROP INDEX IF EXISTS`，实测 ERROR 1064，所以没沿用上面那份「先删后建」写法）。
    已钉成 `LaunchHardeningTests.cookHistoryHasFamilyLeadingIndexes`（同时校验 schema.sql 文本与库里的真实列序）。
- 老库如需清理历史演示数据（多个重名"周末厨房"、种子账号）：
  `mysql -u<user> -p <库名> < server/sql/cleanup-demo-data.sql`（先备份，脚本只删明确的演示账号）
- 老库如需清理废弃会员列，手动执行一次：
  `ALTER TABLE user_account DROP COLUMN vip_status;`
  `ALTER TABLE user_account DROP COLUMN plan_name;`

### CI 的真实状态（2026-09-19 查 GitHub API 实测，别再凭印象）

`https://api.github.com/repos/feng-qinxiang/family-menu-miniapp/actions/runs`（公开可读，无需 token）显示
最近 6 次运行里 **5 次 failure**，且都发生在已推送的 HEAD `b29c7df` 及之前：

| run | workflow | commit | 结果 |
| --- | --- | --- | --- |
| 34759427722 | server-ci | b29c7df | failure（step「Build and run tests」exit 1） |
| 34759427028 | miniapp-ci | b29c7df | failure（**jobs 列表为空**） |
| 34756731061 / 34756107655 / 34705526659 | miniapp-ci | b289d64 / d93859f / 5f2a7b5 | 同上，failure 且无 job |
| 34704940739 | miniapp-ci | b6d5e6d | **success**（最后一次真正跑过的前端门禁） |

已查清的与未查清的：

- **miniapp-ci 的失败原因已证实**：`git show HEAD:.github/workflows/miniapp-ci.yml` 用 ruby YAML
  解析报 `did not find expected key ... line 18 column 5`（`- name: Kitchen logic test` 少了一格缩进），
  而工作区里那份解析通过（`name="miniapp-ci"`、`jobs=["static-check"]`）。
  即：**修复只在未提交的工作区里，GitHub 上那份 YAML 至今仍是坏的**——
  所以「小程序四条门禁」在线上从未真正执行过，job 列表为空就是证据。
- **server-ci 的失败原因已定位并修复**（先前记的"本地复现不出来"是错的，已更正）：
  差的是**时区**，不是 MySQL/JDK 版本。数据源 URL 里钉了 `serverTimezone=Asia/Shanghai`，
  于是 MySQL 的**会话时区是 +08:00、`NOW()` 返回北京时间**；而 CI runner 的 JVM 跑在 UTC，
  `LocalDateTime.now()` 是 UTC 时间。过期时间用 JVM 时钟写入、却用 SQL `NOW()` 校验，
  两边差 8 小时 → 会话与验证码"一建立就过期" → 鉴权接口全 401。
  本机两边都是 +08:00，所以之前怎么跑都是绿的。
  **决定性复现**：把 `origin/master` 单独 `git worktree add` 出来（未修复版），
  用 CI 同款参数 + `TZ=UTC` 跑 `mvn -B verify` → **139 项 4 失败、BUILD FAILURE**，
  失败的正是 `PhoneBindSecurityTests` 3 项 + `CoreFlowTests.phoneOtpLoginFlowWorks`，
  与 CI 报的「Build and run tests exit 1」同一签名。
  修复见 `AuthService` 改用 `DATE_ADD(NOW(), INTERVAL ?)` 单一时钟：
  同样条件下 **153 项 0 失败**，默认 +08:00 下也 0 失败。
  所以**推上去之后 server-ci 大概率直接转绿**；若仍红，才需要去 Actions 拿日志
  （原始日志需鉴权：`gh auth login`，或把「Build and run tests」那一步的输出贴出来）。
- 顺带一条：HEAD 里的 `server/mvnw` **没有可执行位**（`sh ./mvnw` 才跑得动，直接执行 exit 126）；
  工作区已修好（`git status` 里的 `M server/mvnw` 就是那个 mode 变更）。CI 用的是 `mvn` 不受影响，
  但任何「克隆下来就 `./mvnw`」的人都会撞上。

### CI

`.github/workflows/server-ci.yml`：推送/PR 触发，起 MySQL service 容器，跑 `mvn verify`。
实测规模 **25 个测试类 / 153 项用例**（2026-09-19 本机连真实 MySQL 跑通，0 失败 0 错误；
且 job 里 `TZ` 故意设为 `Asia/Shanghai` 而 MySQL 服务是 UTC，把两侧时钟拧开当防回归——
正是这样才复现并修掉了「过期时间用 JVM 时钟写、用 SQL `NOW()` 校验」这个会导致全站登录 401 的 bug）；
`CoreFlowInvariantsTests` 锁住三条核心链路的不变量：待审帖仅作者可见、
邀请码加入后归属正确、同一菜谱连点三次菜单只留一条。
其中 `LaunchHardeningTests` 专门锁住本轮上线加固项：社区分页与 `size` 夹紧、
无家庭账号打家庭维度端点不得出现 5xx、`import_source` 审核索引存在、生产配置不留凭据默认值。
它只监听 `server/**` 的改动。

`.github/workflows/miniapp-ci.yml`：监听 `miniapp/**`，跑四条前端检查——
`static-check.js`（阻断：页面四件套、tabBar 与 utils/tabs.js 一致、JSON 可解析、
WXSS 配平与注释风格、图片/组件引用、事件处理函数存在性、跳转路径、数组解构、**第 8 项字号可缩放性**、
**第 9 项 border/color 禁写裸黑（深色档会看不见）**、
**第 10 项 require 相对路径的目标文件必须存在（挡住「新文件忘了 git add」→ CI 检出树缺文件）**、
**第 11 项 var(--token) 引用的名字必须有定义（拼错的 token 静默丢样式，深色档最明显；
带 fallback 的 `var(--x, y)` 放过**）。
第 10、11 项都做过反向验证：
第 10 项用「移走 capsule.js」触发 exit 1 并点名 5 个页面；
第 11 项用「塞一个 `var(--totally-undefined-token)`」触发 exit 1，删掉即恢复 0。
2026-09-19 全站实测：172 个 token 定义 / 122 个被引用 / **0 个未定义**，
所以第 11 项当前是纯防回归门禁，不是在报既有问题。

> **另：`static-check.js` 每次运行都会额外打印一节「提审前需部署方填写」**，
> 点名 `utils/legal-config.js` 的两个 `【】` 占位符与 `utils/env.js` 的 `trial`/`release`
> `example.com` 占位域名。**这一节不阻断 CI**（这些值只有部署方能给，
> 域名还要等 ICP 备案；提前判红只会淹没真正该看的失败），
> 但每次跑都会列出来，免得"忘了填"把提审退回来一次再等 1~7 天。
> 已双向验证：填上真实值后这 4 条警告消失，回退后又出现。
`dish-logic.test.js`、`kitchen-logic.test.js`，以及 `interaction-audit.js`
（A 类「绑了事件却没按下反馈」**阻断**——纯机械判定、无误报；B/C 类靠类名与尺寸启发式，只报告不判失败）。
**2026-09-18 之前该文件的最后一步缩进错误，整份 YAML 非法、GitHub 直接忽略，小程序实际处于零自动化把关状态**；
现已修正，推上去后请到 Actions 页面确认它真的跑绿一次。
本机无 `node`（PATH 里没有），但可直接用 Qoder 自带的 Node 运行时跑这四条：
`ELECTRON_RUN_AS_NODE=1 /Applications/Qoder.app/Contents/MacOS/Qoder miniapp/test/static-check.js`
（实测 v24.18.0，退出码可信）。注意重跑要先清 require 缓存，
否则脚本不会重新执行、输出为空，看起来像"通过"。

---

## 8. 上线前仍需人工确认

- [ ] `miniapp/utils/env.js` 的 `trial` / `release` 占位域名替换为真实备案域名（**唯一来源，别处不用改**）
- [ ] [miniapp/utils/legal-config.js](../miniapp/utils/legal-config.js) 第 13、15 行的
      `【请填写运营者名称】` / `【请填写联系方式】` 替换为真实主体信息（**带括号提交会被审核挑出来**）。
      ⚠️ 这里才是运营者信息的**唯一来源**——隐私政策页只 `require` 它、自身不存文案；
      （旧版本清单误写成 `miniapp/pages/legal/privacy/index.js`，该路径根本不存在，按它找会漏改）
- [ ] `server/sql/migrate-import-source-index.sql` 已在存量库执行一次（新库由 schema.sql 直接建出）
      > 本地开发库 2026-09-19 查证 `idx_import_source_audit` 已存在；**生产库仍需你在部署时执行一次**。
- [ ] `server/sql/migrate-post-feed-index.sql` 已在存量库执行一次（社区 feed 排序索引补 `id DESC`；
      > 本地开发库 2026-09-19 已执行并查证为 `(audit_status, like_count, id)`；**生产库仍需执行**。
      ⚠ 它并不能消掉 C 端 feed 的 filesort（WHERE 里的 OR 才是原因，见 §7 更正版说明），别当成已优化完。
      可重复执行，本地开发库已跑过）
- [ ] `server/sql/migrate-cook-history-family-index.sql` 已在存量库执行一次（2026-09-19 新增；
      > 本地开发库**已执行并实测**：`type=ALL + Using filesort` → `type=ref + Using index`，且重复执行不报错。
      **生产库仍需你在部署时执行一次**。不跑的话做菜记录页与每个菜谱列表请求都会全扫 `cook_history`。
      测试库 `family_menu_daily_test_db` 已重建，新库由 schema.sql 直接带出这两条索引）
- [x] 工作区已提交：2026-09-19 实测 `git status` 干净、本地领先 origin 18 个提交，
      `miniapp/utils/features.js`、`application-prod.yml` 等运行时必需文件均已入库。
      ⚠ 本条下面「仍未 push / 这台机器没有 GitHub 凭据」是旧状态，**2026-09-19 已作废**：
      `gh` 已登录（keyring），当轮已 push 且三条 workflow 全绿——以文件开头「接手须知」为准。
- [x] **提交时已 `git add -A` 全量纳入未跟踪新文件**（`3d1a4bf`，85 文件、9 个新文件全进）。
      原警告如下，保留以免以后有人只 `-am`：
      2026-09-19 实测：工作区有 9 个未跟踪文件，其中 7 个被**已跟踪代码**依赖，
      只提交改动文件会得到一个「编译即失败」的 commit：
      - `miniapp/utils/capsule.js` ← `pages/home`、`pages/menu`、`pages/recipes`、`pages/me`、
        `pkg-extra/recipes/search` 五个页面首行 require（缺了这五页整块白屏、console 干净）
      - `miniapp/utils/ingredients.js` ← `pages/pantry`、`pages/shopping`
      - `server/.../config/UploadSigner.java`、`UploadPathNormalizer.java` ← 被已跟踪的
        `WebCorsConfig.java` 引用（缺了 `mvn compile` 直接失败）
      - `server/sql/migrate-import-source-index.sql`（本清单 §7 要求的存量库迁移）
      - `CoreFlowInvariantsTests` / `LaunchHardeningTests` / `UploadSignedAccessTests`
        （§7 所称「152 项测试」的证据来源本身还没入库）
      - `.github/workflows/workflows-ci-lint.yml`
      现已由 `static-check.js` 第 10 项兜住：CI 只检出已提交内容，漏 add 的 require 目标
      在检出树里不存在 → 检查失败并点名受影响页面（已用「临时移走 capsule.js」实测，
      exit 1 且准确列出上述 5 个页面）。后端这一类由 `mvn verify` 的编译器兜住。
- [ ] **用开发者工具打开本项目要开仓库根目录，不要开 `miniapp/`**。
      仓库根 `project.config.json` 的 `miniprogramRoot=miniapp/` 且 `urlCheck:false`；
      而 `miniapp/project.config.json` + `miniapp/project.private.config.json`（两者都被 gitignore）
      里 `urlCheck:true`。从 `miniapp/` 打开时 `http://localhost:9088` 会被判
      `request:fail url not in domain list` → 游客 token 取不到 → **全站空白**，
      看起来像代码坏了（2026-09-19 实际踩过一次，误判为回归）。
- [ ] `ADMIN_OPENIDS` 已配置，且能用管理员手机号登录 `/admin`
- [ ] nginx 已加 `/admin` IP 白名单，HTTPS 证书就绪
- [ ] 已设置 `UPLOAD_ACCESS_SECRET`（生产留空会启动失败，这是有意的），并确认小程序里图片仍能正常显示
      > 2026-09-19 已用**第二个实例 + `UPLOAD_ACCESS_SECRET` 打开**（9099，不动开发实例）实测完这套契约：
      > 上传返回的是带签名的 `/uploads/x.jpg?e=&k=`；**不带签名直接 GET → 403**，带签名 → 200；
      > 把带签名的值原样 PUT 回 `coverImage` 后，**库里存的是裸路径** `/uploads/x.jpg`
      > （`UploadPathNormalizer` 在 Jackson 入口剥签名），再读出来时服务端**重新签了一个新过期时间**。
      > 也就是说「签名到期图片集体 404」和「签名串逐次编辑叠加」这两个坑都不会发生。
      > 仍需真机确认的只剩：相册选图那一步的原生授权弹窗。
      > （顺带证伪了一次误判：`/api/recipes/2` 改封面返回 `not your recipe` 是**归属校验正常**，
      > 不是 bug；请求头是 `X-Auth-Token`，不是 `Authorization: Bearer`。）

- [ ] **邀请码有效期：留给你定的产品决策**（本轮已把文案改成与实现一致，实现本身没动）。
      实测事实：`family` 表只有 `invite_token`，**没有任何过期列**，
      `FamilyService.toInviteCode()` 取到已有 token 就一直复用 —— 即邀请码**永久有效**，
      而且页面上也没有"重置/重新生成"入口，只有复制。
      原来邀请页写着「邀请码 24 小时内有效」，这是**对用户的假承诺**：
      信了这句话的人可能把它丢进后来混进陌生人的群聊、或截图外传，而它永远不会失效。
      现已把文案改成「邀请码长期有效，请只发给自己信任的家人」。
      两条可选的后续路线（都需要你选，别默认做）：
      ① 保持永久码（家庭场景更省事），但补一个「重置邀请码」按钮——老码立刻作废；
      ② 真的实现过期：加 `invite_expires_at` 列 + 迁移 + 过期后自动换码 + 前端展示剩余时间。
      注意 ② 会让家人每天都要重新输码，对家庭产品是体验倒退。
- [ ] **浅色档的金色小字要不要压暗：留给你定的观感决策**（R5 算出来的，本轮没动）。
      实测：`--gold-deep` 用在眉标题与"粤菜 · 28 分钟"这类元信息上，全站 `color: var(--gold-deep)` **73 处**；
      它在三块浅底上的 WCAG 对比度是 `paper 3.04 / paper-2 2.71 / surface 3.22`——
      **`--paper-2` 上连"大字号与 UI 组件"的 3.0 底线都没到**，正文级文字应当 ≥4.5。深色档反而没问题（6.40~7.20）。
      保持现有色相压暗到：≥3.0 → `#a58145`（明度 48.8→45.8，几乎看不出）；≥4.5（AA 正文）→ `#836636`（明显变深铜）。
      只改 `app.wxss` 一个 token 就覆盖全部 73 处，但这是**品牌色观感**，不替你定。
      （同一次计算里 `paper/pop` 是 3.69，但 `color: var(--pop)` 全站 0 处声明——它只出现在 hero 大标题的
      `.pop` 上属大字号，所以不构成问题，别顺手去改。）
- [ ] 微信支付若开启：已配置 `WECHAT_PAY_PLATFORM_CERT_PATH`，并用真实支付回归一次回调

- [ ] 真机回归：微信登录、游客模式、社区发帖/评论、图片上传、举报下架闭环
- [ ] 短信网关仍为 noop（`PHONE_LOGIN=false`），若开启手机号登录须先接真实网关

`.github/workflows/workflows-ci-lint.yml`：改动 `.github/workflows/**` 时用 ruby 逐份解析工作流 YAML，
并校验每个 job 有 steps、每个 step 有 `run` 或 `uses`。它存在的唯一理由就是上面那条
「缩进坏掉 → 工作流被静默忽略」的事故不再重演。

> **这道守卫本身已用事故原件验证过（2026-09-19）**：把 `origin/master` 上那份坏掉的
> `miniapp-ci.yml` 放进同目录跑同一段 ruby → **exit 1**，报的正是
> `did not find expected key while parsing a block mapping at line 18 column 5`；
> 换成修好的那份 → 三份全 OK、exit 0。所以它不是装饰，是真能挡住那次事故的。
> 另：脚本里的报错信息含中文，ruby `-e` 的源码编码跟随 locale，`LANG` 未设时默认
> US-ASCII 会连脚本都解析不了（GitHub runner 是 `C.UTF-8` 不受影响，但本地跑会踩）。
> 已在该 step 显式钉 `LANG/LC_ALL=C.UTF-8`，本地与 CI 行为一致。
> 顺带确认：三份 workflow 里**没有任何 `${{ }}` 插值**进 `run`，
> 不存在把 event 载荷拼进 shell 的注入面。

### server-ci 剩余失败的真实原因（2026-09-19 push 后首次拿到日志）

push 成功后 CI 结果：`miniapp-ci` **success**（四条门禁历史上第一次真正执行）、
`workflows-ci-lint` **success**、`server-ci` **failure**：`Tests run: 153, Failures: 1, Errors: 8`。

**不是时区**（那个修复解决的是另一个真实存在的跨时区登录 401 bug，已在 CI 里生效：
日志时间戳已是 +08:00）。剩下的 9 个失败全是**测试自己依赖库里已有社区帖子**：

- `AdminModulesTests.postId()` 的实现是
  `SELECT id FROM community_post ORDER BY id LIMIT 1` —— 它**不创建数据，只假设已有**；
  空库上 `queryForObject` 抛 `EmptyResultDataAccessException: expected 1, actual 0`，
  连带 8 个用例失败。
- `CoreFlowTests.communityPostLikeTogglesAndKeepsCountInSync` 断言公开 feed
  `posts.size() > 0`，同样假设已有帖子。
- 而 `data.sql`（生产/CI 都会执行的公共菜谱库）里 `community_post` 插入数是 **0**，
  帖子只存在于 `data-demo.sql`，后者被 `app.seed-demo-data=false` 挡掉。
  本机测试库因为历次跑动已经攒了帖子，所以本地一直是绿的——**这是本地漂移，不是代码正确**。

**正确修法**（下次做，别用"给 CI 打开演示种子"糊过去，那会把假数据带进测试语义）：
让这 9 个用例自带 fixture —— 参照已经通过的 `CoreFlowInvariantsTests`（它自己发帖再断言），
在 `@BeforeEach` 里建帖/建评论，而不是依赖库里恰好有。

`gh` 已登录且 token 带 `workflow` scope；push 需走代理且必须清空凭据助手列表：
`git -c credential.helper= -c http.proxy=http://127.0.0.1:7897 -c https.proxy=http://127.0.0.1:7897 -c http.version=HTTP/1.1 -c credential.helper='!gh auth git-credential' push origin master`
（git 全局 `credential.helper=osxkeychain` 会优先返回 keychain 里的旧 token，导致补过 scope 仍被拒。）

### 跨家庭数据隔离（IDOR）实测结论（2026-09-19）

拿两个独立游客（**必须带不同的 `X-Device-Id`**，否则后端按同一台设备折叠成同一个账号，
测出来会是"两个人家庭 id 相同"的假象）做交叉写探针：

- B（family 12）新增菜单项 → `itemId=1054`；A（family 11）用**自己的 token** 去
  `PATCH /api/daily-menu/today/items/1054/status`。
- 结果：**B 的行纹丝不动**（仍是 `todo`），A 收到的是 A 自己家庭的菜单视图（`familyId:11`）。
  即没有越权写入、也没有读到别人的数据。
- 机制：`TodayController` 只把 `user.familyId()`（取自 token）传给
  `todayService.updateItemStatus(familyId, itemId, status)`，`itemId` 是被 family 条件约束的，
  外家庭 id 命中 0 行。用户侧控制器里 `familyId` **一律来自 token**（29 处 `user.familyId()`），
  所有从请求里取 `familyId`/`postId` 的端点都在 `AdminController` 内，由 RBAC 覆盖。
- ⚠ 唯一的小毛病：越权写返回的是 **200 + 自己的视图**，而不是 403/404。
  安全上无害，但客户端真写错 id 时会"看起来成功了"，不利于排查。
  **本轮刻意不改**：小程序的乐观回滚依赖拿回一个视图对象，临上线改响应语义风险大于收益。
  要改的话应当连同前端一起改，别单独动后端。
- 另测：`PUT /api/recipes/{别人的}` 返回 `not your recipe`（归属校验正常，不是 bug）。

### 新账号演示数据：已查证是「有门控的」，别再误报（2026-09-19）

排查过程中发现 `cook_history` 一夜之间多了 24 行（同一个 `user_id=52 / family_id=10`、
`cooked_at` 被回溯到过去若干天），一度怀疑是"新建家庭就伪造做菜历史"。
**结论：不是缺陷。** `AuthService:545` 有 `if (!seedDemoData) return;` 门控，
`seedDemoDataForFamily()`（ pantry + daily_menu + cook_history 那套）只在
`app.seed-demo-data=true` 时才跑；`application.yml` 默认 false，
`application-prod.yml` 硬钉 false。会看到这些行，是因为**本机这个开发实例
是开着演示种子跑的**，与生产无关。
判断这类问题的正确顺序：先看新行的 user_id/family_id 是否同属一个家庭、
时间是否被批量回溯（种子特征），再去找门控开关，别直接下结论。

### 深色模式的两条实测约束（2026-09-19 验证）

- `app.json` 的 `window.navigationBarBackgroundColor` / `backgroundColor` **不能**写成 `$xxx` 主题引用：
  当前基础库会直接判 `app.json` 非法，模拟器报
  `"$navigationBarBackgroundColor" is not hexColor` 并**整app启动失败**。
  深色下的原生窗口底色只能保持字面量，页面内深色靠 `app.wxss` 的 `@media (prefers-color-scheme: dark)`。
- `backgroundTextStyle` 同样不支持主题化，只能在 `light`/`dark` 里选一个。
  已按「默认浅色主题」取 `dark`（原来是 `light`，浅色底上浅色三点根本看不见）。
  深色模式下的下拉刷新指示点仍需真机复核，必要时改自定义下拉刷新。
- 自定义 TabBar 不在 `page` 子树内，拿不到挂在 `page{}` 上的 token，
  已在 `custom-tab-bar/index.wxss` 内自带深浅两套值（改色需同步 theme.json 与该文件）。

### 会话过期：已验证的行为（2026-09-19 运行时实测）

登录态会话过期（401）时不再静默换成游客：清掉 `auth_token` 与 `session_kind`，并提示需要重新登录。
并发场景实测过——同时发 3 个会 401 的请求（`/api/auth/me`、`/api/daily-menu/today`、`/api/pantry`），
最终存储状态仍是"两者都已清除"，说明屏障生效、没有哪个在途请求偷偷写回游客身份。
要区分的是：清态之后**冷启动**应用时，`app.js` 会按设计为无会话状态取一个游客会话（游客可浏览是产品设定），
那不是降级 bug。

### 社区信息流分页（2026-09-19 补）

`GET /api/community/posts` 现支持 `page`（从 1 起）/ `size`（默认 20，服务端夹紧到 1~50），
排序为 `like_count DESC, id DESC`。此前该接口只有 `LIMIT 100` 护栏、一次返回全量，
帖子过百后每个用户进首页就要拖全表。小程序端滚到列表底部自动取下一页并按 id 去重。
不传参数时行为与旧版一致（第 1 页 20 条），老客户端不受影响。

### 社区审核现在是"先审后发"

发帖/评论会先过微信 `msgSecCheck`：

| 情况 | 结果 |
| --- | --- |
| 机审判定违规 | 直接 400 拒绝发布 |
| 机审通过（作者有真实微信 openid） | `APPROVED`，立即公开 |
| 无法机审（未配 AppID/Secret、游客/手机号账号无真实 openid、微信接口异常） | `PENDING`，**作者本人可见，其他人看不到**，等管理员审核 |

因此：**配好 `WECHAT_APP_ID`/`WECHAT_APP_SECRET` 之前，游客发的帖子和评论都会进待审队列**，
需要在 `/admin` → 帖子治理 → 「待审核」里点「通过」才会公开。
这是为了满足微信对 UGC 的审核要求，不是 bug。

举报处置与内容审核**只在运营后台**（`/admin`）：小程序里的「社区审核」入口已下线，
对应的 `/api/community/reports**` 也已迁到 `/api/admin/reports**`。运营的日常动线是
`/admin` → 举报审核 / 内容治理 / 评论管理（另见 `server/CONTEXT.md` 的「举报处置入口唯一」）。

