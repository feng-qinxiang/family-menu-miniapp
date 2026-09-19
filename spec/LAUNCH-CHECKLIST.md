# 上线清单（个人主体版）

> **当前就绪度（2026-09-19 自动走查 + 加固后）**
>
> 已验证：37 个注册页面全部在模拟器实际打开过；点菜→清单、做菜（详情→步骤→记一笔→记录）、
> 社区（发帖/待审隔离/举报入口/分页）、家庭（创建/邀请码/加入/成员）、导入、周菜单、反馈、通知
> 均端到端跑通；后端 152 项测试 0 失败；三份 workflow YAML 经自检脚本校验。详见 §3 走查结论表。
>
> 同日二次复核（对着**当前工作区**重跑，非引用上次结论）：后端 `mvn test` 25 类 / 152 项 / 0 失败 0 错误
> （连真实 MySQL，surefire 报告为准）；四条前端门禁全绿（static-check 285 文件、交互体检 A/B/C 均 0）；
> 做菜链路再走一遍并落库验证（`cook_history` 新增行含 recipe/user/family/score，验完已删）；
> `utils/capsule.js` 的运行时覆盖已实测生效（菜单 hero 顶距由 CSS 兜底 136px 被改为胶囊下缘 91px）。
> 本轮新增：`static-check` 第 10 项「require 目标必须存在」，并用移走 capsule.js 的方式实测其能阻断 CI。
>
> **仍未过的那道门：这些改动全部只存在于工作区。** 未提交 → GitHub Actions 从未在本轮代码上跑过，
> 且 §8 的「工作区已提交」是硬项；另有 9 个未跟踪文件被已跟踪代码依赖（详见 §8 第一条），
> 只 `git commit -am` 会得到一个编译即失败的 commit。
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
| 新建菜谱 | ✅（修复后） | 曾前后端校验不一致：后端 `tasteTags @NotEmpty`、前端不校验且把 400 吞成「创建失败，请重试」→ 已修，实测创建成功 |
| 家庭邀请 → 加入 | ✅ | 输码预览「周末厨房」→ 申请加入 → `familyId` 变更、成员表新增 ACTIVE 行、跳转成员页 |
| 导入配方 → 解析 → 存入菜谱 | ✅ | 点「填入示例」→「开始解析」得 5 食材/4 步骤 → 「存入我的菜谱」：菜谱 17→18（`id=110, sourceType=imported`），并在 `import_source` 落一条 `PENDING` 进后台待审队列 |
| 周菜单重新生成 | ✅ | `POST /api/weekly-menu/generate` 返回 7 天、每天 2 道不重复；页面确认框文案如实说明"覆盖当前这一版" |
| 意见反馈提交 | ✅ | `feedback_ticket` 落库：`user_id/family_id/types_json=["feature"]`、内容原样、`status=OPEN`，后台工单队列可见 |
| 通知全部已读 | ✅ | 点「全部已读」后 `/api/notifications` 3 条未读归零 |
| 上传→展示闭环 | ✅（服务端侧） | 用接口真实上传一张 PNG（`/uploads/xxx.png` 直接 200）→ PUT 设为菜谱封面 → 详情页显示的正是这张上传图。**注意**：修 `recipeDishImg` 之前，菜名含「番茄/紫菜/土豆」等关键词的菜谱会永远显示库存图而非用户实传封面 |
| 相册选图与隐私弹窗 | ⬠ 未验 | `wx.chooseImage`/相册授权是原生面板，模拟器自动化够不到，仍需真机点一遍 |
| 深色模式 | ⬠ 部分 | 已修自定义 TabBar 变量作用域、两处硬编码色，及 4 处「前景/底色只在一档成立」：<br>厨房总控两个幽灵按钮 + 社区加图虚线（裸黑描边，深色档看不见）、<br>菜谱详情视频播放三角（恒定白圆上用了会翻转的 `--ink-deep`，深色档变白上白）。<br>`static-check` 第 9 项已禁止 border/color 再写裸黑。**整站深色观感仍需真机复核** |


## 4. 提审注意事项

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
> 验证码/会话过期时间会比 MySQL 的 `NOW()` 差 8 小时，可能"一生成就过期"。
> Docker 方式已在 `Dockerfile` 里设好。

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
- **server-ci 的失败原因本地复现不出来**：把 HEAD 单独 `git worktree add` 出来
  （确认过 HEAD 树里没有 `UploadSigner.java` 等未跟踪文件），
  用 CI 同款参数（空测试库 + `SPRING_SQL_INIT_MODE=always` + `AUTH_DEV_OTP_ENABLED=true`）
  跑 `mvn -B verify`：**139 项 0 失败、BUILD SUCCESS**；工作区那份跑同一条是 **152 项 0 失败**。
  本机是 MySQL 8.4 + JDK 21，CI 是 mysql:8.0 + temurin JDK 17，
  差异只可能出在这两处（或 CI 日志里那条本机看不到的信息）。
  原始日志需要鉴权（未装 `gh`、无 token），**要定位就得先拿到日志**：
  装 `gh` 并 `gh auth login`，或在 Actions 页面把「Build and run tests」那一步的日志贴出来。
- 顺带一条：HEAD 里的 `server/mvnw` **没有可执行位**（`sh ./mvnw` 才跑得动，直接执行 exit 126）；
  工作区已修好（`git status` 里的 `M server/mvnw` 就是那个 mode 变更）。CI 用的是 `mvn` 不受影响，
  但任何「克隆下来就 `./mvnw`」的人都会撞上。

### CI

`.github/workflows/server-ci.yml`：推送/PR 触发，起 MySQL service 容器，跑 `mvn verify`。
实测规模 **25 个测试类 / 152 项用例**（2026-09-19 本机连真实 MySQL 跑通，0 失败 0 错误）；
`CoreFlowInvariantsTests` 锁住三条核心链路的不变量：待审帖仅作者可见、
邀请码加入后归属正确、同一菜谱连点三次菜单只留一条。
其中 `LaunchHardeningTests` 专门锁住本轮上线加固项：社区分页与 `size` 夹紧、
无家庭账号打家庭维度端点不得出现 5xx、`import_source` 审核索引存在、生产配置不留凭据默认值。
它只监听 `server/**` 的改动。

`.github/workflows/miniapp-ci.yml`：监听 `miniapp/**`，跑四条前端检查——
`static-check.js`（阻断：页面四件套、tabBar 与 utils/tabs.js 一致、JSON 可解析、
WXSS 配平与注释风格、图片/组件引用、事件处理函数存在性、跳转路径、数组解构、**第 8 项字号可缩放性**、
**第 9 项 border/color 禁写裸黑（深色档会看不见）**、
**第 10 项 require 相对路径的目标文件必须存在（挡住「新文件忘了 git add」→ CI 检出树缺文件）**）、
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
- [ ] 工作区已提交：`git status` 干净，尤其 `miniapp/utils/features.js`、`miniapp/components/back-top/`、
      `server/src/main/resources/application-prod.yml` 等运行时必需文件必须入库（否则干净克隆跑不起来）
- [ ] **提交时必须 `git add` 全部未跟踪新文件，不能只 `git commit -am`**。
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

- [ ] 微信支付若开启：已配置 `WECHAT_PAY_PLATFORM_CERT_PATH`，并用真实支付回归一次回调
- [ ] 真机回归：微信登录、游客模式、社区发帖/评论、图片上传、举报下架闭环
- [ ] 短信网关仍为 noop（`PHONE_LOGIN=false`），若开启手机号登录须先接真实网关

`.github/workflows/workflows-ci-lint.yml`：改动 `.github/workflows/**` 时用 ruby 逐份解析工作流 YAML，
并校验每个 job 有 steps、每个 step 有 `run` 或 `uses`。它存在的唯一理由就是上面那条
「缩进坏掉 → 工作流被静默忽略」的事故不再重演。

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

