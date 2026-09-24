# 后端 → 小程序 交接单（2026-09-23 上线冲刺，回执）

> 对应 `handoff-to-backend.md`。**12:29 追加的 #1 / #2 两条已处理，回执见下。**
> （本轮重读了整份交接单：此前 12:22 读到的那版确实只有表头，不是漏读，是你们后来追加的。）

## 编号回执

### 已修复 #1：帖子详情读不到自己「审核中」的帖 —— 后端读路径已收口，剩下是小程序侧的文案映射

**结论分两部分，先说后端那半：后端详情接口本来就是「作者本人可见自己的 PENDING 帖」，
这一条我在你的复现环境里逐字验过，不是缺陷。**

- 验证环境：`SERVER_PORT=18083`、`DB_NAME=fm_be_repro_db`（干净库）、`APP_SEED_DEMO_DATA=false`，
  与你复现时同一套配置；游客登录（`X-Device-Id` 随机）→ 发帖（无图纯文字）→ 立刻 GET 列表 → GET 详情：
  - 作者本人：`GET /api/community/posts/1` → **HTTP 200**，body 237 字节，
    `{"id":1,...,"mine":true,"images":[],"auditStatus":"PENDING"}`；
  - 匿名（不带 token）：同名请求 → **HTTP 404** `{"error":"community post not found"}`；
  - 作者删帖（REMOVED）后本人再看 → 404 `{"error":"该分享因违规已被下架"}`，列表里也不再出现。
  - 证据：`artifacts/launch-2026-09-23/backend/13-community-detail-repro.log`（本次落盘，可重跑）。
- 顺带说明：这条「PENDING 仅作者本人可见」的语义在 `HEAD`（2026-09-20 `258141b`）里就有，
  不是本轮新加的，所以你 12:22 那个实例只要 jar 是从本仓库构建的，后端行为就和我上面测到的一致。

**但我确实在后端找到并修掉了一个能造出你这张截图的东西（层：后端读路径）：**

`MysqlKitchenStore.communityPostDetail` 里有**两个判据**在打架：

- 可见性判据读 `communityPostInfo`（`SELECT ... FROM community_post p WHERE p.id = ?`，**不连 user_account**）；
- 取整行数据走 `loadCommunityPostById`（`... JOIN user_account u ON u.id = p.author_user_id ...`，**内连接**）；
- 而 `community_post.author_user_id` **没有外键**（`schema.sql` 只建了 `INDEX idx_post_author`），
  所以「帖子行在、作者账号行不在」是可达状态。

闸门放行、取行落空时，原实现直接 `return null` → Spring 把 null 序列化成 **HTTP 200 + 空 body**。
客户端拿不到任何错误文案，只能把「空响应」当成「帖子没了」——**这正好是你那张截图**：

- `pkg-extra/community/post-detail/index.wxml`：
  `title="{{loadErrorDesc ? '内容不可见' : '帖子不存在或已删除'}}"`、
  `cta="{{loadErrorDesc ? '返回' : '重新加载'}}"`；
- `74b-post-detail-report.png` 显示的是**标题「帖子不存在或已删除」+ 按钮「重新加载」**，
  即 `loadErrorDesc` 为空的那一支；
- 而 `index.js` 里 `loadErrorDesc: (err && err.message) || ''`，且 `utils/api.js` 的 `request()`
  在失败时**必定抛一个带文案的 Error**（`extractErrorMessage(data) || '网络请求失败，请稍后重试'`），
  所以「请求被拒」一定会让 `loadErrorDesc` 非空 → 页面会显示「内容不可见」+ 服务端文案。
  既然截图走的是另一支，那次请求就**没有被拒绝**，而是「成功但拿到空 payload」。

修法（`server/.../service/MysqlKitchenStore.java`）：闸门放行后若 `loadCommunityPostById` 仍为 null，
按不可见处理抛 **404**（与其余社区读/写路径同一个语义、同一个文案），不再让 200 空 body 流出去。
两个判据从此对齐，客户端任何一种情况都能拿到 status + message。

新增测试（`CommunityWriteVisibilityTests`，2 条）：
- `authorCanReadOwnPendingPostDetail`：作者本人 200 且带正文、`mine=true`、`auditStatus=PENDING`；他人与匿名 404 且不回显标题；
- `visiblePostWithoutItsAuthorRowIsNotFoundNotEmptyTwoHundred`：人为造出「作者账号行缺失」，
  断言它落成带文案的 404 而不是空 200。

**剩下这一半在小程序侧，请你改两处（后端不需要再动）：**

1. `loadError` 空态不该把「空 payload / 没有错误文案」和「帖子真的被删了」当同一件事。
   建议：`auditStatus === 'PENDING'` 时不要走「帖子不存在或已删除」；并且把「拿不到正文的兜底文案」
   从「可能已被作者删除」改成中性说法（例如「这条分享现在看不到，可能还在审核」），
   别在用户什么都没做错时告他「已被删除」。
2. `onLoad` 缺 `postId` 时（分享链接被截断、`dataset.id` 丢失等）现在是
   `Promise.resolve(null)` → 同样落到这个误导性空态。建议 `postId` 为空时给一句明确的参数错误
   并直接返回，不要发这个「假装是 404」的请求。

### #2：账号注销（需拍板，暂不实现自助端点）

- 人工匿名化流程**已实测通过**，不是纸面方案：`spec/LAUNCH-CHECKLIST.md` §6.4，
  证据 `artifacts/launch-2026-09-23/backend/06-account-purge.log`（12/12：旧 token 立刻 401、
  账号匿名化、同设备重登拿到全新账号且看不到旧数据、家庭/会员/订单行保留不断外键）。
- **自助注销（前端提交 + 后端端点）按「需要用户拍板」搁置，本轮没有实现、也没有造假入口。**
  这是产品/合规决策：要不要做自助、数据处置口径（家庭关系/菜单/收藏/帖子/上传文件）、
  等待期与撤回窗口，都要用户先拍板。
- 小程序侧你们的做法（按人工申请口径加入口 + 说明「联系客服申请，15 个工作日内处理」，
  不做假入口）我这边**认可**，与既有承诺一致。接口一到位再加真入口即可。

## 一、需要小程序侧配合的（有行为变化）

### 1. `DELETE /api/pantry/{id}` 的失败语义变成 404（原先一律 200）

- 原因：这条接口此前把 `DELETE ... WHERE id = ? AND family_id = ?` 影响 0 行的情况静默吞掉，
  于是「删别人家的库存」「删不存在的 id」「重复删同一条」在客户端看起来都是成功。
  安全上无害（SQL 一直带家庭过滤，数据删不掉），但契约是错的，已按仓库既有约定改成返回 404。
- 影响面（只有两处调用，都是 `utils/api.js` 的 `deletePantryItem`）：
  - `pages/pantry/index.js:143` 删除库存条目
  - `pages/shopping/index.js:213` 删除「库存」区块的条目
- 两边都是「二次确认 → 请求 → 重新拉列表」，**正常路径不受影响**。只有在极端竞态下
  （同一条被连点两次、或两端同时删）第二次会拿到 404 并弹「删除失败」，而实际上它已经删掉了。
- 建议（可选，不急）：在 `catch` 里对 404 也走「重新拉列表 + 视为已删除」，
  这样重复删除不会闪一个失败提示。

### 2. 账号注销缺入口（合规项，提审前需要）→ 见上方编号回执 #2

- 一句话版：后端**人工匿名化流程已实测通过**（清单 §6.4 + `backend/06-account-purge.log`）；
  **自助注销端点属于需要用户拍板的事项，本轮未实现**；小程序侧按「人工申请」口径加入口即可，
  别做假入口，也别自行实现自助删除。

## 二、后端侧改动中与小程序相关的（仅供参考，无需改代码）

- `APP_SEED_DEMO_DATA=true` 时，演示种子会把手机号 `13800138000` 的账号（`id=1`）提为管理员，
  让本地「dev 验证码 / 引导令牌」两条路都能进 `/admin`。这只影响本地演示库，
  prod profile 下 `app.seed-demo-data` 一开就启动失败，生产不可能触发。小程序侧无感知。
- 三条索引迁移脚本已做成真正幂等（其中 `migrate-import-source-index.sql` 之前第二次执行会报错），
  执行手册在清单 §7；都不改接口形状，小程序无感知。
- 越权实测结论：跨家庭读/改/删在三条主线（点菜、做菜、社区）上都是 403/404，
  列表接口不泄露他人数据，匿名一律 401。小程序侧不需要兜底。

## 三、一条「先别动、等拍板」的提醒（支付入口）

- 后端侧核查结论（详见 `backend/99-report-backend.md` §6）：mock-pay 端点默认关闭且 prod 下被 fail-fast 锁死，
  **商户未配置时不会误开通会员**（用户只会看到失败提示）；`PlanCatalog` 是价格与时长唯一权威。
- 但**个人主体小程序不得开通虚拟支付**：如果带着「开通会员 / 升级会员」入口提审，
  审核员点到支付页本身就构成审核风险（代码没问题，资质有问题）。
- 所以这条**不建议小程序侧现在就改**，等用户决定：(a) 个人主体先隐藏会员购买入口；
  (b) 换成企业/个体工商户主体 + 商户号后再放开；(c) 保持现状硬提审（风险自担）。
  决定后要么小程序侧加入口开关，要么后端给出「隐藏支付入口」的配置开关——**别在看到本提醒前自行删改支付相关代码**。

