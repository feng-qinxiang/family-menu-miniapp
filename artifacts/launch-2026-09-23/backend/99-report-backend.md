# 后端 / 数据库 / 管理后台 — 上线冲刺报告（2026-09-23）

范围：`server/`（含 `resources/admin/`、`deploy/`）。小程序端不在本报告内（见 `handoff-to-miniapp.md`）。
所有结论都对应下面「证据」列里的文件，文件都在 `artifacts/launch-2026-09-23/backend/`。

## 0. 一句话结论

后端可编译、全量测试 221 项 0 失败；管理后台 14 个页面实测可用（51/51 检查通过）、
UGC 全部按文本渲染（16 页 XSS 实测 PASS）；跨家庭越权 25/25 拦住；
三条索引迁移幂等可重跑、手册在清单 §7；prod profile 对资损/接管级开关 fail-fast。
**仍阻塞上线的都不是代码，是待用户提供的信息与待拍板的产品项**（见 §7）。

## 1. 管理后台实测（用户点名「先测试」）

### 1.1 覆盖与结果

| 维度 | 覆盖 | 结果 | 证据 |
| --- | --- | --- | --- |
| 全量点击巡检 | 14 页 × 每页所有可点控件 + 77 个弹窗取消路径 + 168 个弹窗确认路径重走 + 会话过期 + 11 类导出 | 440 步，4 步标记错误（3 步是**预期内的否定用例**，1 步是复用浏览器 profile 的残留标签页伪影，见 1.2） | `04-admin-sweep-run.log`、`sweep-errors-all.json` |
| 逐页首屏 + 筛选 + 分页 + 导出 | 14 页首屏健康、11 个筛选按钮真点、13 页分页真点「下一页→上一页」、11 类 xlsx | **51/51 通过，0 失败** | `09-admin-pages.log`、`admin-pages-current.json` |
| UGC 渲染 XSS | 8 类实体写入带 payload 的内容（昵称/帖子/评论/举报/反馈/菜谱/库存/许愿词），16 个页面 + 3 个详情弹窗 | **verdict=PASS**：JS 执行 0、HTML 节点 0、原文以文本呈现 | `07-xss.log`、`xss-probe-current.json` |
| XSS 补充（短 payload） | 主探测的 70 字符 payload 被「昵称/家庭名 ≤80、举报理由 ≤64」的字段限制挡在 400，这三条路径单独用 47 字符等价 payload 复测 | **PASS**：昵称、家庭名、举报理由、帖子标题/正文均转义为文本 | `10-xss-short.log`、`xss-short-current.json` |
| 登录/登出/会话过期 | 错误验证码、正确验证码、错误引导令牌、正确引导令牌、服务端吊销会话后刷新 | 全部符合预期：错误提示准确、401 后回登录页且 token 清空 | 同上两份 log 的 A/C 段；`sweep-errors-login.json` |
| 401/403 跳转 | 会话被服务端删除后刷新页面 | 回到登录页，提示「登录已失效，请重新登录」，`sessionStorage` token 置空 | `sweep-errors-all.json` 的 `meta.expired` |
| 导出 | users/orders/audit/posts/comments/feedback/reports/families/menus/shopping/pantry | 11/11 都是 200 + `PK` 魔数（真 xlsx） | `09-admin-pages.log` 第 4 节 |

### 1.2 四个「错误步骤」逐条定性（都不是缺陷）

1. `s010` 错误验证码登录 → **401 是预期**，提示语正确：「验证码错误或已过期」。
2. `s013` 错误引导令牌 → **401 是预期**，提示语正确：「引导令牌不正确」。
3. `s210` 服务端删除会话后刷新 → **401 是预期**，这正是「会话过期」用例本身。
4. `s001` 打开登录页时 `POST /api/admin/auth/bootstrap` 404 → **不是页面发的请求**。
   巡检脚本复用固定 Chrome profile，上一轮被中断时留下的标签页在浏览器恢复会话时重放了旧请求。
   用全新 profile 重测同一动作：**4xx/5xx=0、控制台错误=0、异常=0**（`09-admin-pages.log` 第 1 行）。

### 1.3 顺带确认的安全行为（实测，不是读代码）

- 限流真的生效：`POST /api/admin/auth/otp` 在额度打满后返回 **429「发送过于频繁」**（`07-xss.log`）。
- 验证码是一次性的：没有新签发的验证码时，正确的 dev 验证码同样 401（同一次实测）。
- 401/403 不会把用户卡死：错误令牌不会触发全局登出逻辑，正确令牌登录后正常进入。

## 2. 本轮修掉的缺陷（按优先级）

| # | 文件 | 一句话原因 |
| --- | --- | --- |
| 1 | `service/EnhancedService.java` | `DELETE /api/pantry/{id}` 把「影响 0 行」静默吞掉，删除别人家的条目也回 200；改成与 `deleteCommunityPost`、读路径同一套语义，0 行抛 404（SQL 一直带 `family_id` 过滤，数据删不掉，错的是响应契约） |
| 2 | `resources/data-demo.sql` | 本地按文档用 `AUTH_DEV_OTP_ENABLED=true` 进不去后台：演示库里手机号 `13800138000` 绑在 `id=1`（公共菜谱库占位账号）且 `is_admin=0`，验证码过了仍被 403；补一行把该账号提为管理员（只在 `app.seed-demo-data=true` 时执行，prod 一开此开关即启动失败） |
| 3 | `sql/migrate-import-source-index.sql` | 此前不幂等（第二次执行 1061 Duplicate key name），文档却写「重复执行安全」并建议 `--force`（会吞掉真错误）；改成 `information_schema` + `PREPARE` 判断，两次执行都 rc=0 |
| 4 | `sql/migrate-post-feed-index.sql` | `DROP INDEX` 在索引不存在时（迁移做了一半）报 1091 中断；补存在性判断，末尾加 EXPLAIN 自检 |
| 5 | 管理端登录页前端探测 | 原先前端用「空令牌打引导接口、404 才算没配」探测，白占 5 次/分钟限流额度且控制台常驻一条 401；改为服务端渲染 `data-bootstrap-login`（此改动在 2026-09-22 完成，本轮实测确认有效） |
| 6 | 管理端错误码文案 | 「登录已失效，请重新登录」与 401 的真实原因（验证码错）不一致 → 「验证码错误或已过期」（2026-09-22 修复，本轮回归确认） |

新增测试：`EndpointCoverageTests.pantryDeleteReportsNotFoundInsteadOfSilentSuccess`
（别人家的 404 且行还在 / 二次删除 404 / 不存在的 id 404）。

## 3. 后端 API（三条主线）

- **越权/IDOR 实测 25/25**：两个独立游客家庭（不同 `X-Device-Id`），A 真实建菜谱/库存/做菜记录/菜单项/帖子，
  再用 B 的 token 去读改删——跨家庭读改删全部 403/404，列表接口不泄露，匿名一律 401。
  修前唯一失败项就是 §2 的 `DELETE /api/pantry/{id}`（`05-isolation.log` 24/25 → `11-isolation-after-fix.log` 25/25）。
- **输入校验**：DTO 层 `@NotBlank/@Size` 覆盖写接口（例：举报理由 ≤64、帖子标题 ≤128、正文 ≤5000、图 ≤6 张）；
  超限返回 400「数据不符合要求」，不落库（本轮 XSS 探测顺带实测）。
- **分页上限**：`AdminService` 统一 `Math.min(size,100|200)`、`Math.max(page,0)`，无上限参数可直接打满内存的路径。
- **错误码一致**：`GlobalExceptionHandler` 统一映射——`ResponseStatusException` 原样透传、
  校验失败 400、参数类型错 400、重复键/状态冲突 409、找不到 404、方法不允许 405。
- **限流**：`POST /api/auth/guest` 30/分、`/api/auth/otp/request` 与 `/api/admin/auth/otp` 10/分、
  `/api/admin/auth/bootstrap` 5/分；只信 `ratelimit.trusted-proxies` 白名单里对端的 `X-Forwarded-For`
  （nginx 示例里用 `$remote_addr` 覆盖，演示了不覆盖时伪造 XFF 可切桶绕过的真实后果）。
- **并发写**：菜单写、社区写、库存扣减都有死锁重试（`inTxWithDeadlockRetry`，测试日志里能看到真实重试），
  社区点赞/评论与菜谱收藏有唯一约束 `uk_post_user` / `uk_like_post_user` 兜底。
- **N+1 / 慢查询**：三条热点查询的索引问题已修（§5），EXPLAIN 从 `type=ALL` / `Using filesort` 变为 `type=ref` / `Using index`。
- **超时**：Hikari `connection-timeout=10s`；nginx 示例 `proxy_read_timeout 60s`、`connect_timeout 10s`（支付回调这类慢请求有专门说明）。

## 4. 数据库

| 项 | 实测结论 | 证据 |
| --- | --- | --- |
| 字符集 | `fm_be_launch_db` 27 张表、全部字符列都是 `utf8mb4`（emoji 可存），无 latin1/utf8 混入 | 下面这条审计 SQL（`information_schema`，只读） |
| 时区 | MySQL 全局/会话都是 `+08:00`；JDBC URL 固定 `serverTimezone=Asia/Shanghai` | 同上 |
| 主键/唯一约束 | 27 张表都有主键；社区点赞、收藏、家庭-用户、订单号、手机号、openid、会员等都有唯一约束 | 同上 |
| 外键 | **全库没有 DB 级 FOREIGN KEY**，完整性由应用层维护（删账号时保留家庭/会员/订单行不断引用） | 同上 + `06-account-purge.log` |
| 外键列索引 | 无「外键列没索引」的情况 | 同上 |
| 软删除一致性 | 社区帖用 `audit_status='REMOVED'`、评论用 `deleted=1`，读路径 8 处都带过滤；库存/菜谱等是硬删——各自自洽，无「删了还能被读到」的组合 | 代码审计 + 越权实测 |
| 连接池 | Hikari `maximum-pool-size=20`、`minimum-idle=5`、`connection-timeout=10s`，env 可调 | `application.yml` |
| 生产库保护 | prod profile 的 datasource **不留默认值**：漏注入 `DB_HOST/DB_PORT/DB_NAME/DB_USERNAME/DB_PASSWORD` 时占位符解析失败、启动即报错（避免带着本地 `root/123456` 默认值连到别处） | `application-prod.yml` |

### 迁移脚本（三条，本地库实测 + 幂等）

`sql/migrate-import-source-index.sql`、`sql/migrate-post-feed-index.sql`、
`sql/migrate-cook-history-family-index.sql`：在本地库 `fm_migrate_check` 上把索引退回迁移前旧形状后各跑两遍，
**三条都 rc=0 且幂等**，EXPLAIN 不再出现 `type=ALL` / `Using filesort`（`03-migrations.log`，可重跑脚本 `verify-migrations.sh`）。
**运行手册（备份 → 执行 → 校验 → 回滚）写在 `spec/LAUNCH-CHECKLIST.md` §7 末段**，未新建文档。

## 5. 上线合规与运维（后端侧）

- **UGC 内容安全**：`ContentSecurityService` 对文本走 `msgSecCheck`、图片走 `imgSecCheck`；
  未配微信凭据 / 作者无真实 openid / 接口异常 → **一律 PENDING 进人工审核队列，不放行**；违规直接 400。
  后台有「内容治理 / 评论管理 / 导入审核」三个人工队列页面（实测可用）。
- **举报闭环**：`community_post_report` 落库 → 后台「举报审核」处理 → 写审计日志（实测走通）。
- **账号注销与数据删除**：后端无自助注销端点，隐私文案承诺的 15 个工作日删除通道由**人工匿名化流程**兑现，
  流程与回滚已实测 12/12（旧 token 立刻 401、账号匿名化、同设备重登拿新账号且看不到旧数据、家庭/会员/订单行保留）
  并写进清单 §6.4。自助注销属于要拍板的产品项，未擅自实现。
- **日志脱敏**：短信日志只打手机号末 4 位，openid 只打尾 4 位，管理端日志只有 userId。
- **密钥**：微信/支付/DB 凭据全部走环境变量，prod 无默认值；`ADMIN_BOOTSTRAP_TOKEN` 启动打醒目 WARN。
- **prod 收紧（实测）**：`AUTH_DEV_OTP_ENABLED=true`、`APP_SEED_DEMO_DATA=true`、`WECHAT_PAY_MOCK_PAY_ENABLED=true`
  三种情况都**启动失败**；`SMS_PROVIDER=aliyun`（未接入）任何 profile 都启动失败；
  prod 缺 `UPLOAD_ACCESS_SECRET` 启动失败。安全头：`nosniff`、`X-Frame-Options: DENY`、`Referrer-Policy`、
  `/uploads` 加 `CSP: sandbox`、管理页加 `default-src 'self'` 的 CSP。
- **健康检查**：`GET /healthz` 带 DB 探活（库挂返回 503），本机实测 200。
- **优雅停机**：`server.shutdown=graceful` + `timeout-per-shutdown-phase=20s`。
- **nginx 示例与文档**：`deploy/nginx.conf.example` 与清单 §7 引用的同一份；含 TLS、安全头兜底、
  `client_max_body_size 20m`、`X-Forwarded-For` 必须覆盖为 `$remote_addr`（否则限流桶可被伪造切换）以及
  `/admin` IP 白名单示例注释。

## 6. 支付（`PaymentService` / `PlanCatalog`）— 只评估，未改代码

- **上线开关是有的，而且是双保险**：`mock-pay` 端点默认关闭（`wechat.pay.mock-pay-enabled=false`），
  prod profile 下由 `StartupSafetyGuard` 对同名开关 fail-fast，环境变量也打不开。
- **商户未配置时的行为是安全降级**：`prepay` 返回 `mockMode:true`（不崩），
  小程序据此提示「支付通道尚未配置」并尝试走 mock-pay → 服务端 **403「模拟支付未开启」**，
  即**漏配支付不会送会员**，代价是用户看到一个失败提示。
- **订单与金额**：`PlanCatalog` 是唯一权威（月卡 1990 分/30 天、年卡 9900 分/365 天），
  前端传的价格与时长一律忽略；回调验签 + 金额比对（不一致拒绝并记 ERROR）。
- **主体审核风险（需用户拍板）**：微信支付要求**非个人主体**商户号，
  个人主体小程序不得开通虚拟支付。因此在个人主体下上线时：
  1) 支付配置留空 = 用户点购买只会看到失败提示（虽无资损，但**审核员点到「付费会员」入口本身有审核风险**）；
  2) 若要卖会员，需要企业/个体工商户主体 + 商户号 + 备案域名回调；
  3) 折中方案是上下线前先隐藏会员购买入口（**属小程序侧改动**，已写进 `handoff-to-miniapp.md`）。
  本报告不擅自删改支付代码。

## 7. 仍阻塞上线的事项

**A. 等用户提供信息**（给了就能填、不需要改代码）

1. 服务器与 ICP 备案域名（回调地址 `WECHAT_PAY_NOTIFY_URL` 必须是公网 https）。
2. 微信小程序 `AppID / AppSecret`、订阅消息模板 ID（不填则相应能力安全关闭）。
3. 微信支付商户号、APIv3 密钥、商户证书序列号、私钥与平台证书路径（个人主体拿不到，见 §6）。
4. 真实短信网关凭据（`SMS_PROVIDER=tencent` + 腾讯云密钥）；不接则手机号绑定与 `/admin` 验证码登录不可用，
   只能靠 `ADMIN_BOOTSTRAP_TOKEN` 临时进后台（**进完请立刻删掉该环境变量并重启**）。
5. `ADMIN_OPENIDS`（首个管理员白名单）、`CORS_ALLOWED_ORIGINS`（正式域名）、`UPLOAD_DIR`。
6. 真机三项（不在后端范围）。

**B. 需要用户拍板**

1. **支付/主体**：个人主体是否仍然上线「会员购买」入口，还是先隐藏（§6）。
2. **账号注销**：是否要做自助注销（前端提交 + 后端端点），还是先按人工通道 + 客服说明上线（清单 §6.4 已备好流程）。
3. **UGC 机审**：现在未配微信凭据时一律进人工队列——上线首日如果内容量上来，
   需要有人值守后台「内容治理 / 评论管理」队列（人或时间，属于运营排班决定）。

## 8. 测试与复现命令

```
# 库结构审计（只读，上面 §4 的结论就是它跑出来的）
mysql -h127.0.0.1 -uroot -p<密码> -N -e "
SELECT t.TABLE_NAME, t.TABLE_COLLATION FROM information_schema.TABLES t
 WHERE t.TABLE_SCHEMA='<库名>' AND t.TABLE_COLLATION NOT LIKE 'utf8mb4%';
SELECT c.TABLE_NAME, c.COLUMN_NAME FROM information_schema.COLUMNS c
 WHERE c.TABLE_SCHEMA='<库名>' AND c.CHARACTER_SET_NAME IS NOT NULL AND c.CHARACTER_SET_NAME<>'utf8mb4';
SELECT t.TABLE_NAME FROM information_schema.TABLES t
 LEFT JOIN information_schema.TABLE_CONSTRAINTS k ON k.TABLE_SCHEMA=t.TABLE_SCHEMA
   AND k.TABLE_NAME=t.TABLE_NAME AND k.CONSTRAINT_TYPE='PRIMARY KEY'
 WHERE t.TABLE_SCHEMA='<库名>' AND t.TABLE_TYPE='BASE TABLE' AND k.CONSTRAINT_NAME IS NULL;
SELECT @@global.time_zone, @@session.time_zone, NOW();"

# 全量测试（需要本地 MySQL；结果 221 tests, 0 failures）
cd server && TEST_DB_NAME=fm_be_test_db AUTH_DEV_OTP_ENABLED=true ./mvnw -B -o test

# 迁移幂等复跑（本地库）
artifacts/launch-2026-09-23/backend/verify-migrations.sh

# 管理后台实测（需先起 18082 实例，见 status-backend.md §启动命令）
python3 artifacts/launch-2026-09-23/backend/drive-admin-387f91.py all      # 全量点击巡检
python3 artifacts/launch-2026-09-23/backend/verify-admin-pages-387f91.py   # 逐页 + 筛选 + 分页 + 导出
python3 artifacts/launch-2026-09-23/backend/xss-probe-387f91.py            # UGC XSS（长 payload）
python3 artifacts/launch-2026-09-23/backend/xss-short-387f91.py            # UGC XSS（短 payload）
python3 artifacts/launch-2026-09-23/backend/isolation-probe-387f91.py      # 跨家庭越权
python3 artifacts/launch-2026-09-23/backend/purge-probe-387f91.py          # 账号注销人工流程
```

## 9. 本题（handoff-to-backend.md）的处理

**13:10 更正：**该交接单在小程序端 12:29 追加了 #1 / #2 两个编号条目，
上一轮 12:22 读到的那版确实只有表头（时间差，不是漏读）。逐条处理结果见 §10。

## 10. 交接单 #1 / #2 编号回执（13:00–13:15 补做）

### 10.1 #1 作者看不到自己「审核中」的帖 —— 定性：后端读路径的空 body 缺陷（已修）+ 小程序侧文案映射（已转交接）

**先证伪「后端不给作者看」这一层。** 在与小程序端完全相同的配置下逐字复现
（`SERVER_PORT=18083`、干净库 `fm_be_repro_db`、`APP_SEED_DEMO_DATA=false`、游客登录 → 无图纯文字发帖）：

| 请求 | 结果 |
| --- | --- |
| 作者本人 `GET /api/community/posts/1` | **200**，body 237 字节，`{"id":1,…,"mine":true,"images":[],"auditStatus":"PENDING"}` |
| 匿名同名请求 | **404** `{"error":"community post not found"}` |
| 作者删帖（REMOVED）后本人再看 | 404 `{"error":"该分享因违规已被下架"}`，且列表里不再出现 |

证据 `backend/13-community-detail-repro.log`。另外这条「PENDING 仅作者本人可见」的语义在
`HEAD`（2026-09-20 `258141b`）就有，不是本轮新加 —— 所以只要小程序端那个实例的 jar
是从本仓库构建的，后端行为就和上表一致。

**再给出真正能造出那张截图的缺陷（后端读路径，已修）。** 详情读路径有**两个判据在打架**：

- 可见性判据 `communityPostInfo`：`SELECT … FROM community_post p WHERE p.id = ?`，**不连 `user_account`**；
- 取整行 `loadCommunityPostById`：`… JOIN user_account u ON u.id = p.author_user_id …`，**内连接**；
- `community_post.author_user_id` **没有外键**（`schema.sql` 只建 `INDEX idx_post_author`）——
  「帖子行在、作者账号行不在」是**可达状态**。

闸门放行、取行落空时原实现 `return null` → Spring 序列化为 **HTTP 200 + 空 body**：
客户端拿不到任何错误文案。这与 `miniapp/74b-post-detail-report.png` 完全吻合 ——
截图是「帖子不存在或已删除」+「重新加载」，正是 `pkg-extra/community/post-detail/index.wxml` 里
`loadErrorDesc` 为空的那一支（`title="{{loadErrorDesc ? '内容不可见' : '帖子不存在或已删除'}}"`）；
而 `index.js` 的 `loadErrorDesc: (err && err.message) || ''` 配上 `utils/api.js` 里
「失败必定抛出带文案 Error（文案永不为空）」的 `request()`，意味着**只要请求被拒就一定会显示
「内容不可见」+ 服务端文案**。截图走的是另一支 ⇒ 那次请求**没有被拒绝**，是「成功但空 payload」。

修法：闸门放行后若 `loadCommunityPostById` 仍为 null，按不可见抛 404（与社区其余读/写路径同一语义、
同一文案），不再让 200 空 body 流出。两个判据从此对齐，客户端任何情况都拿得到 status + message。
新增 2 条测试：
`CommunityWriteVisibilityTests#authorCanReadOwnPendingPostDetail`（作者 200 带正文 / 他人与匿名 404 不回显标题）、
`CommunityWriteVisibilityTests#visiblePostWithoutItsAuthorRowIsNotFoundNotEmptyTwoHundred`（造出作者账号行缺失，断言落 404 而非空 200）。

**剩余在小程序侧**（已写进 `handoff-to-miniapp.md` #1）：空 payload 与真·已删除别共用一句误导文案；
`onLoad` 缺 `postId` 时不要发这个「假装是 404」的请求。

**本轮发现但未修的小瑕疵（记录备查）**：作者**自删**的帖（`audit_status='REMOVED'`）本人再看，
文案是「该分享因违规已被下架」——对自删场景是误伤。要区分「作者自删」与「运营下架」需要新增列
（当前只有 `audit_status`），属架构改动，本轮不动。

### 10.2 #2 账号注销 —— 需用户拍板，未实现自助端点

- 人工匿名化流程已实测通过（`spec/LAUNCH-CHECKLIST.md` §6.4；证据 `backend/06-account-purge.log`，12/12：
  旧 token 立刻 401、账号匿名化、同设备重登拿到全新账号且看不到旧数据、家庭/会员/订单行保留不断外键）。
- 自助注销（前端提交 + 后端端点）按「需要用户拍板」搁置：**本轮未实现，也未造假入口**。
  待拍板项：是否做自助、数据处置口径（家庭关系/菜单/收藏/帖子/上传文件）、等待期与撤回窗口。
- 小程序侧按「人工申请」口径加入口（说明「联系客服申请，15 个工作日内处理」）与既有承诺一致，后端认可。

### 10.3 本轮测试

`cd server && TEST_DB_NAME=fm_be_test_db AUTH_DEV_OTP_ENABLED=true ./mvnw -B -o test`
→ **223 tests, 0 failures, BUILD SUCCESS**（基线 221 + 新增 2）。
证据 `backend/12-full-tests-after-post-detail-fix.txt`。
