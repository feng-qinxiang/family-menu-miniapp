# 点菜小程序-家庭版

家庭点菜 + 菜谱社区 + 导入配方 + VIP/广告 的微信小程序项目。

## 截图

首页与各页真机截图在 `spec/launch-shots/`、`spec/archive/*/` 下（历史评审产物 `artifacts/` 已清理）。

## 技术栈与架构

- 后端：Spring Boot 3.2 / Java 17 / Spring JDBC / MySQL 8（Maven Wrapper 自举，无本机 Maven 依赖）
- 前端：微信小程序原生（41 页面、自定义 TabBar、设计 token 主题化、深色模式）
- 测试：`@SpringBootTest` 集成测试连真实 MySQL，覆盖登录→菜单→清单→家庭协作主链路
- 架构：小程序 ⇄ REST API（`AuthInterceptor` 统一鉴权）⇄ Spring Boot ⇄ MySQL 8；无密码登录（微信 code2session / OTP / 游客会话）

## 项目结构

- `server/` Spring Boot 3.2 / Java 17 后端 API（包名 `com.familymenu.daily`）
- `miniapp/` 微信小程序原生前端（41 个页面）
- `docs/` 产品方案、MVP、数据模型、开发路线
- `spec/` 上线清单（`LAUNCH-CHECKLIST.md`）与历史评审产物

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
| `UPLOAD_DIR` | `uploads` | 上传文件落盘目录 |

> ⚠️ **生产安全须知**
> - `DB_USERNAME` / `DB_PASSWORD` 默认 `root` / `123456` 仅为本地零配置启动方便。**上线前必须用环境变量覆盖为最小权限的专用数据库账号，禁用 root 直连**，切勿沿用默认弱口令。
> - `AUTH_DEV_OTP_ENABLED` 默认已为 `false`。开启后任意手机号请求验证码会拿到固定码 `246810` 且明文回显，等同任意账号接管，**仅限本地联调临时开启**。生产/测试环境务必保持关闭并接入真实短信网关。

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

`data.sql` 内置了演示数据：多家庭成员、16 道左右菜谱、今日菜单、购物清单、做菜记录、食材库存和通知。新游客/手机号用户首次登录时也会自动补一套当前家庭演示数据，便于直接展示首页、菜单、买菜清单、口味画像和消息联动。

## 运行测试

```powershell
cd server
./mvnw test
```

主链路集成测试在 `server/src/test/java/com/familymenu/daily/CoreFlowTests.java`，覆盖：游客登录 → 首页看板 → 菜谱 → 今日菜单 → 购物清单重建 → OTP 下发与登录 → 家庭创建/邀请码/加入/移除 → 反馈提交 → 通知已读。测试用 `@SpringBootTest` 连真实 MySQL，需本机 3306 可用。

全量 **59 项测试**（10 个测试类），含管理台权限、支付回调验签、手机号绑定安全、会话 token 等专项。

前端纯逻辑单测（零依赖，node 直接跑）：

```powershell
node test/dish-logic.test.js
node test/recipe-steps.test.js
```

## 小程序

用微信开发者工具打开 `miniapp/` 目录。API 基址由 `miniapp/utils/env.js` 按运行环境解析（开发者工具走 `http://localhost:9088`，体验版/正式版走该文件里的域名，**上线前必须替换占位域名**，见 `spec/LAUNCH-CHECKLIST.md`）。

## 登录体系说明

本项目为**无密码体系**，`user_account` 表无密码字段，登录方式三种：

1. **微信登录** — `wx.login` 拿 code 换 openid（需配置 `WECHAT_APP_ID/SECRET`，否则提示改用手机号验证码）
2. **手机验证码** — OTP 下发 + 校验，验证码登录即注册，无独立注册/改密流程（个人主体上线时用开关隐藏）
3. **游客会话** — 免凭据临时会话，每次启动自动获取，按设备隔离

鉴权走 `X-Auth-Token` 请求头。`AuthInterceptor` 采用**默认拒绝**策略：`/api/**` 除少数白名单端点外一律要求有效会话（游客会话也算），
公开白名单只有登录/注册、管理台登录、价目表、支付回调、社区只读浏览。

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
| 管理台 `/admin` | 🟡 代码完整，需前置条件 | 需 `ADMIN_OPENIDS` + 管理员手机号；**登录依赖短信网关，当前为 noop，接真实网关前登不进** |
