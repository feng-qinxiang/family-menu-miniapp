# 点菜小程序-家庭版

家庭点菜 + 菜谱社区 + 导入配方 + VIP/广告 的微信小程序项目。

## 截图

首页与各页真机截图在 `spec/launch-shots/`、`spec/archive/*/` 下（历史评审产物 `artifacts/` 已清理）。

## 技术栈与架构

- 后端：Spring Boot 3.2 / Java 17 / Spring JDBC / MySQL 8（Maven Wrapper 自举，无本机 Maven 依赖）
- 前端：微信小程序原生（**37 个页面**：主包 7 + 分包 `pkg-extra` 30；自定义 TabBar、设计 token 主题化、深色模式）
- 测试：`@SpringBootTest` 集成测试连真实 MySQL，覆盖登录→菜单→清单→家庭协作主链路
- 架构：小程序 ⇄ REST API（`AuthInterceptor` 统一鉴权）⇄ Spring Boot ⇄ MySQL 8；无密码登录（微信 code2session / OTP / 游客会话）

## 项目结构

- `server/` Spring Boot 3.2 / Java 17 后端 API（包名 `com.familymenu.daily`）
- `miniapp/` 微信小程序原生前端（37 个页面，其中 30 个在 `pkg-extra` 分包）
- `docs/` 产品方案、MVP、数据模型、开发路线
- `spec/` 上线清单（`LAUNCH-CHECKLIST.md`）与历史评审产物

## 文档与协作

- **上线前必办事项**：`spec/LAUNCH-CHECKLIST.md`（逐条带实测证据；缺了会被提审驳回的项在文件开头）
- **变更记录**：`CHANGELOG.md`（提审那天开始打 tag，此前都记在「未发布」）
- **报安全问题**：请看 `SECURITY.md`，走私密披露，**不要开公开 Issue**（本仓库是 public）
- 提 bug / 功能建议请用 `.github/ISSUE_TEMPLATE/` 里的模板，便于复现与归类

## 启动后端

```powershell
cd server
./mvnw spring-boot:run
```

后端默认端口 `9088`。无本机 Maven 时用自带 wrapper（`mvnw` / `mvnw.cmd`）。

### 配置（环境变量，均有默认值）

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `SERVER_PORT` | `9088` | 服务端口 |
| `DB_HOST` / `DB_PORT` | `127.0.0.1` / `3306` | MySQL 地址 |
| `DB_NAME` | `family_menu_daily_db` | 库名 |
| `DB_USERNAME` / `DB_PASSWORD` | `root` / `123456` | 数据库账号（仅本地默认，生产必须覆盖，见下方安全须知） |
| `WECHAT_APP_ID` / `WECHAT_APP_SECRET` | 空 | 微信登录凭据，留空则微信登录不可用并引导手机验证码 |
| `AUTH_DEV_OTP_ENABLED` | `false` | 开发态固定验证码 `246810` 并回显 devCode，仅供本地联调；**默认关闭**，生产严禁开启 |
| `APP_SEED_DEMO_DATA` | `true` | 演示数据总开关：启动播种（种子用户/社区帖子）+ 新账号首登补演示菜单/清单/记录/通知。生产由 `application-prod.yml` 固定 `false`，否则真实用户第一屏会出现别人的假数据 |
| `UPLOAD_DIR` | `uploads` | 上传文件落盘目录。**生产请给绝对路径**：相对路径落在「进程当前目录」，换 CWD 重启会让已有图片全部 404 |
| `UPLOAD_ACCESS_SECRET` | 空 | 上传链接的 HMAC 签名密钥。**本地留空即整体关闭签名（零配置可跑）；但 `prod` profile 下留空会在启动时直接抛异常** —— 生成：`openssl rand -hex 32`。`docker-compose.yml` 与 `.env.example` 已把它设为必填，缺了 compose 会当场报错而不是无限重启 |

> ⚠️ **生产安全须知**
> - `DB_USERNAME` / `DB_PASSWORD` 默认 `root` / `123456` 仅为本地零配置启动方便。**上线前必须用环境变量覆盖为最小权限的专用数据库账号，禁用 root 直连**，切勿沿用默认弱口令。
> - `AUTH_DEV_OTP_ENABLED` 默认已为 `false`。开启后任意手机号请求验证码会拿到固定码 `246810` 且明文回显，等同任意账号接管，**仅限本地联调临时开启**。生产/测试环境务必保持关闭并接入真实短信网关。
> - `ADMIN_BOOTSTRAP_TOKEN` 一旦设置就是**长期有效的单因子后台入口**（跳过验证码，只认服务端配的 `ADMIN_BOOTSTRAP_PHONE`）。只在"登不进后台"时临时用，用完删掉并重启。

### 部署完怎么确认它真的活着

```bash
curl https://<你的域名>/healthz     # → {"status":"UP","db":"UP"}；库连不上时返回 503
```

这个端点匿名可访问（挂在 `/healthz` 而不是 `/api/**`，所以不吃鉴权拦截器），每次会打一次 `SELECT 1`，
因此限流过滤器给它配了 60 次/分钟/IP。uptime 监控、容器 healthcheck、nginx 探活都指它；
契约由 `HealthEndpointTests` 钉住（免鉴权可达 / 必须真打库 / 响应只允许这两个字段，不外泄驱动与异常信息）。

### 本地开发怎么开验证码

登录要短信验证码，但本地没接短信网关——不配置的话点「获取验证码」会直接报 503，告诉你去开开发模式。开法二选一：

**推荐：建一个本地配置文件**（一次建好，之后不管用 IDEA、还是 `mvnw spring-boot:run`、还是 `java -jar` 都自动生效，不用改任何启动配置）

```powershell
# server/config/application.yml
auth:
  dev-otp-enabled: true
```

Spring Boot 会自动加载「工作目录下 `config/application.yml`」，优先级高于 classpath 里的 `application.yml`。该路径已被 `.gitignore` 忽略，**不会进仓库也不会进构建产物**，所以生产仍是安全默认值 `false`。

**或者：设环境变量** `AUTH_DEV_OTP_ENABLED=true`
（IDEA：Run → Edit Configurations → 选中你的启动配置 → Environment variables 里填；临时用命令行也行，但换个启动方式就失效）

开启后：验证码固定 `246810`，点「获取验证码」后页面上会直接显示这个码。短信网关仍是 noop，不会真发短信。

数据库结构与种子数据见 `server/sql/create-database.sql`、`server/src/main/resources/schema.sql`、`data.sql`。schema 使用 MySQL 专有语法，需 MySQL 8（H2 跑不通）。

> ⚠ **`schema.sql` 用的是 `CREATE TABLE IF NOT EXISTS`，改了它不会动已存在的表。**
> 所以存量库（包括本地开发库）要单独跑 `server/sql/` 下的迁移脚本，新加的索引/列不会出现。
> 当前待跑的存量库迁移清单以 `spec/LAUNCH-CHECKLIST.md` §7 为准（2026-09-19 为三条）。

> 本地用 Git Bash 时 `./mvnw` 会因路径未转换报 `ClassNotFoundException: plexus.classworlds.launcher.Launcher`，
> 用 `../.tools/mvn.sh test`（基于自带 wrapper 的绕过脚本）代替；另外新克隆的 `server/mvnw` 可能没有可执行位，先 `chmod +x`。

`data.sql` 只内置**公共菜谱库**那一份种子数据（16 道左右菜谱，与账号无关）。
**社区帖子和评论不在 `data.sql` 里**——它们在 `data-demo.sql`，受 `APP_SEED_DEMO_DATA` 门控，
所以生产（该开关固定 `false`）不会带进任何假帖子/假互动。演示帖上看到的 128 赞、16 评论就是这么来的，
别误以为线上也会有。

### 演示数据（`APP_SEED_DEMO_DATA`）

除了上面的公共菜谱库，项目还有一套"个人演示数据"：演示菜单、买菜清单、做菜记录、食材库存、通知。
它同时受 `APP_SEED_DEMO_DATA` 控制，**默认只有开发/测试开启，生产固定关闭**（`application-prod.yml`）：

- 本地联调、截图、评审时保持 `true`，新账号登录后首页立刻有内容可看
- 生产保持 `false`：真实用户的第一屏必须是空的，不能出现"别人的菜单和做菜记录"
- 关闭后不影响公共菜谱库，只是个人状态从零开始

改这个开关请只改环境变量，不要把它做成"按用户判断"的逻辑——历史上演示数据曾经无条件挂在登录路径上，是真实的线上数据污染源。

## 运行测试

```powershell
cd server
./mvnw test
```

主链路集成测试在 `server/src/test/java/com/familymenu/daily/CoreFlowTests.java`，覆盖：游客登录 → 首页看板 → 菜谱 → 今日菜单 → 购物清单重建 → OTP 下发与登录 → 家庭创建/邀请码/加入/移除 → 反馈提交 → 通知已读。测试用 `@SpringBootTest` 连真实 MySQL，需本机 3306 可用。

全量 **30 个测试类 / 180 项用例**（2026-09-19 本机实测 0 失败 0 错误；跑前先 `DROP DATABASE family_menu_daily_test_db` 以对齐 CI，并且**用 `-Dsurefire.runOrder=reversealphabetical` 反序再跑一遍**——用例之间不许有顺序依赖，`CoreFlowTests` 单独跑也必须全绿），含管理台权限、支付回调验签、手机号绑定安全、会话 token、演示数据开关、上传签名与包体积、忌口词典两端一致性、买菜清单重建语义、做完菜扣冰箱库存等专项。

> ⚠ **想让本地结果代表 CI，必须先删测试库**：`src/test/resources/application.properties` 指向
> `family_menu_daily_test_db` 且带 `createDatabaseIfNotExist=true`，所以这个库会跨次运行累积数据。
> 本机它曾经悄悄替 9 个用例提供了 CI 上根本不存在的帖子，导致本地全绿、CI 全红，还把根因误判成时区。
> 跑代表性验证前：`DROP DATABASE family_menu_daily_test_db;`（surefire 的 `-Dtest` 用逗号分隔类名，`A+B` 会报 "No tests matching pattern"）。

本地没有装 `node` 时，前端那四条门禁可以借任何现成的 Node 运行时跑（本项目 CI 用的是真 `node`）：

```bash
ELECTRON_RUN_AS_NODE=1 <某个 node 可执行文件> miniapp/test/static-check.js
```

前端零依赖门禁（四条，都已接进 CI；`.github/workflows/miniapp-ci.yml` 里是**一个 job 跑四步**，
所以 GitHub 上只看到一个叫 `static-check` 的 check，别以为只跑了静态自检）：

```powershell
node miniapp/test/static-check.js         # 静态自检：页面四件套 / JSON / WXSS 配平 / TabBar 一致 / token 定义 / 暗底对比度 / 行高 / 包体积 / 大字模式接线 / 失败态不被吞成空态
node miniapp/test/dish-logic.test.js      # 点菜、菜谱纯逻辑
node miniapp/test/kitchen-logic.test.js   # 厨房总控、库存、周菜单纯逻辑
node miniapp/test/interaction-audit.js    # 交互体检：按下反馈、热区尺寸（A 类阻断，B/C 只报告）
```

## 小程序

用微信开发者工具打开**仓库根目录**（`project.config.json` 所在处，appid 与 `miniprogramRoot: miniapp/` 都在这个文件里）。
不要直接打开 `miniapp/`：那样开发者工具会在 `miniapp/` 下另生成一份没有 appid 的 `project.config.json`，
与仓库里这份分叉，上传时容易带错配置。API 基址由 `miniapp/utils/env.js` 按运行环境解析
（开发者工具走 `http://localhost:9088`，体验版/正式版走该文件里的域名，**上线前必须替换占位域名**，见 `spec/LAUNCH-CHECKLIST.md`）。

## 登录体系说明

本项目为**无密码体系**，`user_account` 表无密码字段，登录方式三种：

1. **微信登录** — `wx.login` 拿 code 换 openid（需配置 `WECHAT_APP_ID/SECRET`，否则提示改用手机号验证码）
2. **手机验证码** — OTP 下发 + 校验，验证码登录即注册，无独立注册/改密流程（个人主体上线时用开关隐藏）
3. **游客会话** — 免凭据临时会话，每次启动自动获取，按设备隔离

鉴权走 `X-Auth-Token` 请求头。`AuthInterceptor` 采用**默认拒绝**策略：`/api/**` 除少数白名单端点外一律要求有效会话（游客会话也算），
公开白名单只有登录、管理台登录、价目表、支付回调、社区只读浏览。

身份模型：一个 openid / 设备指纹对应一个账号，账号必然属于一个家庭。不存在"所有人共用的游客账号"——
游客会话按设备指纹哈希落库，同一台设备反复进入拿到的是同一个账号，不同设备互不可见。
会话 30 天固定有效（不做滑动续期：续期会让每个读请求都变成写请求），过期后由前端重新获取游客会话或引导登录。

## 能力状态

| 模块 | 状态 | 说明 |
|------|------|------|
| 登录（微信/OTP/游客） | ✅ 已接通 | 前端接真实后端，OTP 落库校验 |
| 首页"今天做什么" | ✅ 已接通 | 来源/菜系筛选、加入今日菜单 |
| 菜谱库 | ✅ 已接通 | 搜索、来源筛选、增改、详情、做菜记录 |
| 今日菜单 / 购物清单 | ✅ 已接通 | 自动生成清单、待买已买分组、进度统计、勾选 |
| 家庭成员 | ✅ 已接通 | 展示与添加 |
| 社区 | ✅ 已接通 | 菜谱流、评论、收藏、举报；发帖/评论先审后发（msgSecCheck + 人工队列） |
| 导入配方 | ✅ 已接通 | 链接/文本导入预览，保存进菜谱库（拍照识别未实现，入口已下线） |
| 食材库存 / 周菜单 | ✅ 已接通 | 库存匹配菜谱、周菜单生成 |
| 文件上传 / 反馈 / 通知 | ✅ 已接通 | 后端真实落库；上传校验文件头 |
| 资料编辑 | ✅ 已接通 | 昵称、头像、手机号展示接后端；口味画像由记录生成 |
| VIP 权益页 | 🟡 代码完整，开关关闭 | 个人主体无支付资质，`features.PAYMENT=false` 时入口全隐藏 |
| 广告位 | 🟡 演示态 | 社区页底部自运营位（非微信广告 SDK） |
| 支付 | 🟡 代码完整，开关关闭 | 下单→预下单→`wx.requestPayment`→回调 RSA 验签/AES 解密已实现；个人主体无资质，`PAYMENT=false` 时整条链路不可达 |
| 管理台 `/admin` | 🟡 代码完整，需前置条件 | 需 `ADMIN_OPENIDS`（把已绑定手机号的账号提为管理员）+ 能收到验证码。**后台唯一入口是手机验证码，而短信网关当前是 noop**：本地联调请开 `AUTH_DEV_OTP_ENABLED=true`（固定码 `246810`），生产必须接入真实短信供应商，否则后台登不进去 |
| 演示数据 | 🟡 开关控制 | `APP_SEED_DEMO_DATA`：开发默认开、生产固定关，详见上文「演示数据」 |
