# 上线清单（个人主体版）

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

> ⚠️ **前置依赖：短信网关**。后台登录与手机号绑定都走验证码，
> 而当前短信实现是 `NoopSmsGateway`（只打 WARN，不真发短信）。
> 也就是说：**没接真实短信供应商之前，谁也绑不了手机号、进而谁也登不进 `/admin`**。
> 上线前必须接入真实网关（`SMS_PROVIDER`），或临时用 `AUTH_DEV_OTP_ENABLED=true`
> 完成首个管理员绑定后**立刻改回 false 并重启**（固定验证码 246810 期间任何人可登录任意手机号，风险自担）。

后续管理员之间的授予/回收在后台「用户管理」里操作，**不能修改自己的管理员状态**（防误锁死）。

### 6.2 管理台能力

| 模块 | 能做什么 |
| --- | --- |
| 看板 | 用户/家庭/菜谱/帖子/待审举报/待处理反馈/订单/有效会员计数 |
| 举报审核 | 处理用户举报：下架 / 忽略 |
| 内容治理 | 帖子下架与恢复（下架后公开列表立即不可见） |
| 反馈工单 | 工单列表、受理、关闭、回复 |
| 用户管理 | 检索用户、授予/撤销管理员、人工开通会员 |
| 订单 | 订单查询（含金额、状态、支付方式） |
| 审计日志 | 所有管理写操作留痕：谁、何时、对什么、做了什么、结果 |

> **提审口径**：微信审核问到 UGC 人工审核时，可直接说明——发布接 `msgSecCheck` 文本机审，
> 违规内容进站内举报队列，由运营在 `/admin` 人工下架，操作全程留审计日志。

### 6.3 安全须知

- `/admin` 建议在 nginx 加来源 IP 白名单（样例见 `server/deploy/nginx.conf.example`），不要裸对公网。
- 管理员登录**复用普通会话 token**（`user_session` 表，无独立有效期/独立类型），
  区别只在浏览器端存在 sessionStorage。因此：管理员在手机小程序里的 token 同样具备后台权限，
  后台权限完全由 `is_admin` 决定。如需强隔离，后续要加独立的管理员会话类型。
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
- `app.seed-demo-data=false`：生产不注入任何演示用户/家庭/帖子。
- 建库/迁移：
  - 新库：`sql/create-database.sql` + `src/main/resources/schema.sql`（后者可重复执行）
  - 旧库补列：`sql/migrate-legacy.sql`（一次性，列已存在会报错，可加 `--force`）
- 老库如需清理废弃会员列，手动执行一次：
  `ALTER TABLE user_account DROP COLUMN vip_status;`
  `ALTER TABLE user_account DROP COLUMN plan_name;`

### CI

`.github/workflows/server-ci.yml`：推送/PR 触发，起 MySQL service 容器，跑 `mvn verify`（**59 项测试**）。
注意：它只监听 `server/**` 的改动，纯小程序改动不会触发任何检查。

---

## 8. 上线前仍需人工确认

- [ ] `miniapp/utils/env.js` 的 `trial` / `release` 占位域名替换为真实备案域名（**唯一来源，别处不用改**）
- [ ] 隐私政策页 [miniapp/pages/legal/privacy/index.js](../miniapp/pages/legal/privacy/index.js) 里的
      `【请填写运营者名称】` / `【请填写联系方式】` 替换为真实主体信息（**带括号提交会被审核挑出来**）
- [ ] 工作区已提交：`git status` 干净，尤其 `miniapp/utils/features.js`、`miniapp/components/back-top/`、
      `server/src/main/resources/application-prod.yml` 等运行时必需文件必须入库（否则干净克隆跑不起来）
- [ ] `ADMIN_OPENIDS` 已配置，且能用管理员手机号登录 `/admin`
- [ ] nginx 已加 `/admin` IP 白名单，HTTPS 证书就绪
- [ ] 微信支付若开启：已配置 `WECHAT_PAY_PLATFORM_CERT_PATH`，并用真实支付回归一次回调
- [ ] 真机回归：微信登录、游客模式、社区发帖/评论、图片上传、举报下架闭环
- [ ] 短信网关仍为 noop（`PHONE_LOGIN=false`），若开启手机号登录须先接真实网关

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

