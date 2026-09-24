# 后端 / 数据库 / 管理后台 — 上线冲刺进度（2026-09-23）

负责人：后端 + DB + 管理后台 worker。只写本文件，随时可能被中断，写盘才算数。

## 0. 现状盘点（12:05 起）

- `server/` 编译通过：`./mvnw -B -o -q compile -DskipTests` → EXIT=0（Java 21.0.12.1 / Temurin）。
- 全量测试基线（前任 01:28，`artifacts/launch-2026-09-23/backend/00-baseline-tests.txt`）：213 tests, 0 failures, BUILD SUCCESS。
- 前任管理后台扫描（09:53 `backend/sweep-errors-all.json`）：256 步，`steps_with_errors` 只有 2 条，
  且都是**预期内的 401**（错误验证码、错误引导令牌）。modal 弹窗 77 个全部走通「取消」，导出 11 类全部 200 且 PK 魔数正确。
- 前任 XSS 探测（10:01 `backend/xss-probe.json`）：`verdict=PASS`，20 个页面 `xss=0 badNodes=0`，异常 0。
- 前-前次（2026-09-22 pre-fix）真实缺陷已在前任手里修掉，对比可见：
  - `bad_code_msg`：「登录已失效，请重新登录」→「验证码错误或已过期」（错误码/message 不一致，误导用户）。
  - `s001` 打开登录页时无谓的 `POST /api/admin/auth/bootstrap` 401 → 已不再发起。
  - `expired` 场景用的 token 从硬编码 `broken-token-387f91` → 真实随机 token。
- 仓库内没有残留测试令牌（grep `84cc69f0…`/`broken-token` 命中 0）。
- `handoff-to-backend.md` 目前**只有表头、没有任何条目**，所以没有待办条目可处理。
- `handoff-to-miniapp.md` 不存在，将由我创建。

## 1. 已完成（按时间顺序，证据都在 backend/ 下）

### 1.1 编译 + 全量测试
- `mvn -o compile` → EXIT=0。全量测试 213 → **220 项 0 失败**（`01-full-tests.txt`）。
  新增 7 项来自前任：`StartupSafetyGuardTests`(3) + `TencentSmsGatewayTests`(3) + 其它。
- 改造后（本轮的 pantry 改动 + 新用例）再跑一遍：见 §1.6。

### 1.2 管理后台真实驱动（18082 / 独立库 `fm_be_launch_db` / `APP_SEED_DEMO_DATA=true`）
- 复用前任的 CDP 巡检脚本，包了个 driver：`backend/drive-admin-387f91.py`（改端口/库名/OUT，重写 do_401
  因为库名写死在函数体里）。证据：`04-admin-sweep-run.log`、`sweep-errors-all.json`。
- **发现并修掉一个真正的「本地进不去后台」缺口**：文档说本地用 `AUTH_DEV_OTP_ENABLED=true` 即可，
  但演示数据把手机号 `13800138000` 绑在 `id=1`（公共菜谱库占位账号）上，而它 `is_admin=0`，
  于是验证码校验通过后仍被 403「该账号不是管理员」挡回，引导令牌同样 403。
  前任们是手敲 `UPDATE user_account SET is_admin=1` 才进去的（在 `family_menu_daily_db`、
  `fm_backend_db` 里能看到这个手工痕迹），文档里没写。
  修法：`data-demo.sql` 里补一行 `UPDATE user_account SET is_admin = 1 WHERE id = 1;`（演示数据只在
  `app.seed-demo-data=true` 时执行，而该开关在 prod 下启动即失败，生产不可能走到）。
  改完重启，两条本地入口都实测通过（`04-admin-sweep-run.log` 的 A 段：验证码登录 True、引导登录 True）。
- 旧证据没被覆盖：前任的 `sweep-errors-all.json` / `xss-probe.json` 已备份成
  `sweep-errors-all-0953-prefix.json` / `xss-probe-1001-prefix.json`。

### 1.3 数据库 / 迁移脚本
- 三个索引迁移脚本在本地库 `fm_migrate_check` 上逐条实测（`03-migrations.log`，可重跑
  `verify-migrations.sh`：先把索引退回迁移前旧形状，再各跑两遍）。
- **修掉真缺陷**：`migrate-import-source-index.sql` 此前**不是幂等的**（第二次执行报
  1061 Duplicate key name），文档却写着「重复执行安全」，还建议加 `--force`（会把库名写错/权限不足
  这类真错误一起吞掉）。改成与 cook-history 同一套 `information_schema` + `PREPARE` 判断，现在两次都 rc=0。
- 顺手加了边界保护：`migrate-post-feed-index.sql` 的 `DROP INDEX` 在索引不存在时（迁移做了一半、
  结构是手工建的）会报 1091 中断，现在也先判断存在性；两份脚本末尾都补了 EXPLAIN 自检。
- 三条迁移的**运行手册（备份/执行/校验/回滚）已写进 `spec/LAUNCH-CHECKLIST.md` §7**。
- 文档不一致修正：§7 一处写「两个迁移脚本」，实际是三条（已改）。

### 1.4 跨家庭越权（三条主线）实测
- `backend/isolation-probe-387f91.py` → `05-isolation.log`。两个独立游客家庭（必须不同 `X-Device-Id`），
  A 真实建菜谱/库存/做菜记录/菜单项/帖子，再用 B 的 token 去读改删：**24/25 通过**，
  跨家庭读改被 404/403 挡住、列表接口不泄露、匿名一律 401。
- **唯一失败项是真缺陷**：`DELETE /api/pantry/{id}` 删别人家的条目返回 200。
  查代码：SQL 本身带 `family_id` 过滤（数据删不掉），错的是响应契约——`jdbcTemplate.update` 的 0 行
  结果被静默吞掉，「不是你的 / 不存在 / 已删过」三种情况都报成功。
  修法：按仓库既有约定（`deleteCommunityPost` 的注释写得很清楚）在 0 行时抛 404，改一处共享函数。
- 已确认小程序侧不受影响：`deletePantryItem` 只在 pantry 页与 shopping 页的「库存」区块用，
  id 来自 `getPantryItems()`，成功后会重新拉列表；失败提示 `删除失败`。
- 新增用例 `EndpointCoverageTests.pantryDeleteReportsNotFoundInsteadOfSilentSuccess`
  （别人家的 404 且行还在 / 二次删除 404 / 不存在的 id 404），单跑 25 项全绿。

### 1.5 合规与配置核查（都是实测，不是读代码猜的）
- **prod fail-fast 实测**（`SPRING_PROFILES_ACTIVE=prod` 起 jar）：
  - `AUTH_DEV_OTP_ENABLED=true` → 启动失败「生产环境（prod profile）禁止开启 [auth.dev-otp-enabled]」✓
  - `APP_SEED_DEMO_DATA=true` → 启动失败，同样拦住 ✓
  - `WECHAT_PAY_MOCK_PAY_ENABLED=true`（relaxed binding 的真实属性名）→ 启动失败 ✓
  - `WECHAT_PAY_MOCK_ENABLED=true` → **应用能起**：因为 prod 的 `application-prod.yml` 用同名字面量
    `false` 覆盖了 base 配置里的占位符，该环境变量在 prod 下是空操作（双保险，不是漏洞）；
    本地 dev 下它才生效。已在报告里说明，避免下次有人把它误判成漏网。
  - `SMS_PROVIDER=aliyun` → 任何 profile 下都启动失败「不支持的 SMS_PROVIDER」✓
  - prod 缺 `UPLOAD_ACCESS_SECRET` → 启动失败（上传目录不许裸奔）✓
- 日志脱敏核查：短信日志只打末 4 位手机号，openid 只打印尾 4 位，管理端日志只有 userId。
- UGC 机审（`ContentSecurityService`）：未配微信凭据 / 作者无真实 openid / 接口异常时一律转 PENDING
  进人工队列，**不放行**；违规抛 400。举报闭环：`community_post_report` + 后台处理 + 审计日志。
- **账号注销是真实缺口**：全仓没有自助注销端点，小程序也没有入口，但隐私说明里承诺
  「账号注销后 15 个工作日内删除或匿名化」。本轮给出并**实测通过**了人工匿名化流程
  （`purge-probe-387f91.py` → `06-account-purge.log`，12/12：旧 token 立刻 401、账号匿名化、
  同设备重登拿到新账号且看不到旧数据、家庭/会员/订单行保留不断外键），写进清单 §6.4。
  自助注销属于要拍板的产品/合规项，未擅自实现。

### 1.6 收尾核验
- 改造后全量测试：220 + 1（新增越权用例）= 见 `01-full-tests.txt` 末尾统计（221 tests, 0 failures）。

## 2. 本次续跑（12:24–13:05，全部有落盘证据）

### 2.1 重建 + 重启（含一次环境变量踩坑）
- 发现 18082 上跑的 jar（12:10）早于 `EnhancedService` 的 pantry 改动（12:13），
  先 `./mvnw -B -o -q package -DskipTests` → EXIT=0，再用同样的环境变量重启（日志 `08-admin-server.log`）。
- **踩坑记录**：第一次重启漏了 `ADMIN_BOOTSTRAP_TOKEN/ADMIN_BOOTSTRAP_PHONE`，
  巡检脚本的「引导登录」整段 404、全站 401（`04-admin-sweep-run.log` 的「运行 2」段）。
  补齐后重跑即恢复。**本地起 18082 的完整命令**：
  ```
  cd server && SERVER_PORT=18082 DB_NAME=fm_be_launch_db AUTH_DEV_OTP_ENABLED=true \
    APP_SEED_DEMO_DATA=true ADMIN_BOOTSTRAP_TOKEN=local-dev-bootstrap \
    ADMIN_BOOTSTRAP_PHONE=13800138000 java -jar target/family-menu-daily-server-0.1.0-SNAPSHOT.jar
  ```

### 2.2 管理后台巡检（已完成）
- `drive-admin-387f91.py all` → `sweep-errors-all.json` / `04-admin-sweep-run.log`：
  **440 步，4 步标记错误**，逐条定性：
  - `s010` 错误验证码 401、`s013` 错误引导令牌 401、`s210` 会话吊销后刷新 401 —— 三条都是**用例本身要的否定结果**；
  - `s001` 登录页 404 —— **复用 Chrome profile 的残留标签页重放旧请求**，全新 profile 复测 0 错误（见下）。
- 新写 `verify-admin-pages-387f91.py`（全新 profile，专治上面那个伪影）→ `09-admin-pages.log` /
  `admin-pages-current.json`：14 页首屏 + 11 个筛选按钮 + 13 页分页往返 + 11 类导出 = **51/51 通过 0 失败**。
- XSS：`xss-probe-387f91.py` → `07-xss.log` / `xss-probe-current.json`：16 页 + 3 个详情弹窗 **PASS**（JS 执行 0、HTML 节点 0）。
  另发现主探测的 70 字符 payload 被字段长度限制挡在 400（昵称/家庭名 ≤80、举报理由 ≤64），
  于是补 `xss-short-387f91.py`（47 字符等价 payload）→ `10-xss-short.log` / `xss-short-current.json`：
  昵称、家庭名、举报理由、帖子正文四条路径**全部转义为文本，PASS**。
- 顺带实测到的安全行为：`/api/admin/auth/otp` 额度打满返回 **429**；没新签发验证码时正确验证码同样 401（一次性）。

### 2.3 越权回归（已完成）
- 修完 pantry 404 后重跑 `isolation-probe-387f91.py` → `11-isolation-after-fix.log`：
  **25/25 通过**（修前 `05-isolation.log` 是 24/25，唯一失败项就是那条库存删除）。

### 2.4 报告（已完成）
- `99-report-backend.md`：后台实测覆盖与定性、修复清单、DB 审计与迁移结论、合规运维核查、
  **支付上线开关评估 + 个人主体审核风险**、阻塞事项分「等用户提供信息 / 需拍板」、复现命令。

## 3. 待办（剩余，都不在我的代码范围）

- [x] 后台巡检（440 步）与汇总
- [x] 后台 UGC XSS 复测（长 + 短 payload 两轮）
- [x] `handoff-to-miniapp.md` 与最终报告（`99-report-backend.md`）
- [x] 支付上线开关 / 个人主体审核风险写进报告（只评估不改代码）
- [ ] 等用户拍板：个人主体是否先隐藏会员购买入口 / 是否做自助注销 / 上线首日 UGC 人工队列谁值守
- [ ] 等用户提供：备案域名、微信 AppID/AppSecret、支付商户资料、真实短信网关凭据、`ADMIN_OPENIDS`、`CORS_ALLOWED_ORIGINS`

## 4. 本轮续跑（13:00–13:15）：补交 `handoff-to-backend.md` 的编号回执

### 4.1 先纠正上一轮的一个事实错误
- `handoff-to-backend.md` 在小程序端 **12:29 追加了 #1 / #2 两个编号条目**；我上一轮 12:22 读到的版本
  确实只有表头，不是漏读，是时间差。本轮已整份重读并逐条处理。

### 4.2 #1 帖子详情读不到自己「审核中」的帖 —— 定性结果
- **后端那半不是缺陷，已实测证伪**：`SERVER_PORT=18083`、`DB_NAME=fm_be_repro_db`（干净库）、
  `APP_SEED_DEMO_DATA=false`（与小程序端复现时同一套配置）：游客登录 → 发帖（无图纯文字）→
  作者本人 `GET /api/community/posts/1` = **200 + 完整 body**（`mine=true`, `auditStatus=PENDING`）；
  匿名同名请求 = **404** `{"error":"community post not found"}`；作者删帖后本人再看 = 404 + 下架文案。
  证据：`backend/13-community-detail-repro.log`（本轮落盘，含列表/详情/删帖三段）。
  另：该语义在 `HEAD`（2026-09-20 提交 `258141b`）就存在，不是本轮新加。
- **但揪出并修掉一个能造出那张截图的真缺陷（层：后端读路径）**：
  `communityPostDetail` 的可见性判据读 `communityPostInfo`（不连 `user_account`），
  取行走 `loadCommunityPostById`（**内连接** `user_account`），而 `community_post.author_user_id`
  **没有外键**（`schema.sql` 只有 `idx_post_author`）→ 判据打架时原实现 `return null`，
  Spring 序列化成 **200 + 空 body**。客户端拿不到文案 → 把空响应渲染成「帖子不存在或已删除」。
  这与 `74b-post-detail-report.png` 完全吻合：截图显示的是「帖子不存在或已删除」+「重新加载」，
  正是 `post-detail/index.wxml` 里 `loadErrorDesc` 为空的那一支；而 `utils/api.js` 的 `request()`
  失败时必定抛出带文案的 Error（文案永不为空），所以那次请求**没有被拒绝**，是「成功但空 payload」。
- 修法（1 处 + 2 条测试）：闸门放行后 `loadCommunityPostById` 仍为 null → 按不可见抛 404（同一语义/文案）。
- 剩下的小程序侧两处（已写进 `handoff-to-miniapp.md` #1）：空 payload 别和真·已删除共用一句文案；
  `onLoad` 缺 `postId` 时别发这个「假装是 404」的请求。
- 顺手记下一条**未改**的小瑕疵：作者自删的帖（REMOVED）本人再看，文案是「该分享因违规已被下架」，
  对自删场景是误伤；要区分自删/运营下架需要新列，属架构改动，本轮不动，已记进报告。

### 4.3 #2 账号注销回执
- 人工匿名化流程已实测通过（清单 §6.4 + `backend/06-account-purge.log`，12/12）；
  **自助注销端点按「需要用户拍板」搁置，未实现、未造假入口**；小程序侧「人工申请」口径认可。

### 4.4 本轮落盘
- 改：`server/.../service/MysqlKitchenStore.java`（communityPostDetail 空 body 收口）、
  `server/src/test/java/com/familymenu/daily/CommunityWriteVisibilityTests.java`（+2 条测试）。
- 证据：`backend/12-full-tests-after-post-detail-fix.txt`、`backend/13-community-detail-repro.log`。
- 测试：`cd server && TEST_DB_NAME=fm_be_test_db AUTH_DEV_OTP_ENABLED=true ./mvnw -B -o test`
  → **223 tests, 0 failures**（基线 221 + 本轮新增 2），BUILD SUCCESS。
- 回执：`handoff-to-miniapp.md` 顶部「编号回执」两节；报告新增一节（`99-report-backend.md`）。

