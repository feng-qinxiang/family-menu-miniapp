# 家庭点菜小程序：核心一致性修复验收

验收日期：2026-10-08。当前工作区的四项核心修复已通过本地检查；尚未提交、部署或修改开发/生产数据库。原始审计与失败复现保留在同目录，用于对照修改前行为，不能作为修改后的验收结果。

## 修复后的行为

1. **库存按数量判断是否够用。** 前后端均合计同名、同单位的库存，也合计菜谱中重复配料的需求。库存 1、需求 8 不再显示够用；菜谱详情调整份数后重新计算原料可用状态。实现位于 [pantry-match.js](/Users/xx/cx/家庭点菜小程序/miniapp/utils/pantry-match.js) 和 [EnhancedService.java](/Users/xx/cx/家庭点菜小程序/server/src/main/java/com/familymenu/daily/service/EnhancedService.java)。
2. **实际份数进入扣库存计算。** 完成接口新增可选 `servings`，按实际份数 / 菜谱基准份数缩放需求。基准 4 份、用料 2、实际 8 份时扣 4，库存 20 降至 16。旧客户端不传份数时仍按标准用量扣减。事务内锁定并读取库存当前值，避免并发使用旧快照。实现位于 [MysqlKitchenStore.java](/Users/xx/cx/家庭点菜小程序/server/src/main/java/com/familymenu/daily/service/MysqlKitchenStore.java) 和 [PantryDeduction.java](/Users/xx/cx/家庭点菜小程序/server/src/main/java/com/familymenu/daily/service/PantryDeduction.java)。
3. **同一次完成请求可以安全重试。** 新增 `completionId`，数据库按家庭、用户和该键保证唯一。同键同菜谱的并发或延迟重试返回原记录，不重复评分或扣库存；同键换菜谱返回 409。客户端先确认用户/家庭，把未确认的请求按身份保存，失败后保留原评分、份数、备注与键，确认成功后再清理。菜单、厨房与做菜页使用相同菜单项键，并且保存成功后才更新上桌状态。实现位于 [api.js](/Users/xx/cx/家庭点菜小程序/miniapp/utils/api.js) 及相应页面。
4. **同一道菜的不同餐次各自保留。** 菜单项按菜单、菜谱、餐次唯一；重复加入同餐次保留原 ID、完成状态与添加人，午餐加入晚餐不会删除午餐。新客户端撤菜只删除当前餐次；旧客户端不传餐次仍兼容原删除语义。实现位于 [TodayService.java](/Users/xx/cx/家庭点菜小程序/server/src/main/java/com/familymenu/daily/service/TodayService.java)。

## 本轮验证证据

- **后端全量：242 项测试，0 失败、0 错误、0 跳过。** 使用独立 MySQL 测试库 `fmenu_cookfix_20261008_84dc93`。新增 9 项真实 Spring Boot / MockMvc / MySQL 一致性测试，覆盖份数缩放、兼容旧请求、带评分并发重试、延迟重试、不同真实操作、共享库存并发、键复用拒绝、两餐独立状态、同餐次并发加入、重复原料与输入校验。另补充原料扣减单元断言。结果：[repair-backend-checks.json](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-backend-checks.json)。
- **前端：13 个检查全部通过。** 包含 10 个测试脚本和静态、交互、UI 台账检查。新增断言实际运行菜单/厨房 Page，验证连点保护、确认保存前不上桌、失败保留、部分成功后重试、身份分区、未确认身份或存储失败时不提交，以及只撤当前餐次。新增检查已加入小程序 CI。结果：[repair-frontend-checks.json](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-frontend-checks.json)。
- **迁移：隔离旧结构数据库验证通过。** 连续执行两次成功，旧烹饪记录和两餐原状态保持不变；两个唯一索引正确；旧 NULL 完成键仍允许多条历史，新重复键被拒绝。旧菜单同餐次已有重复时，迁移停止添加该唯一索引，旧行和状态保留。结果：[repair-migration-checks.json](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-migration-checks.json)。
- **微信模拟器：菜单 WXML 编译通过，刷新后页面可打开并显示网络失败反馈。** 本机 9088 和 19088 均无服务监听，控制台记录 `menu loadData failed` 和网络请求失败，因此本轮没有完成连接运行后端的模拟器交互验收。未启动或重启开发服务。证据：[repair-simulator-checks.json](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-simulator-checks.json)、[修改后菜单截图](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-menu.jpg)。
- **凭据清理后的补充测试：16 项通过。** 管理员引导登录测试改为运行时生成令牌，再次运行该类 9 项及上线加固 7 项测试，均通过。结果：[repair-security-tests.json](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-security-tests.json)。
- **CI 配置本地校验通过。** 后端 CI 删除固定数据库测试口令，改为运行时随机生成、注册日志掩码并注入环境。YAML、Shell 语法及使用替身的环境变量/SQL 输入检查通过；尚未实际运行 Docker 服务或远端 GitHub Actions。结果：[repair-ci-config-checks.json](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-ci-config-checks.json)。
- **安全与改动检查通过。** 当前跟踪文件、新测试和分析产物中，已识别的旧数据库默认口令、CI 固定口令、管理员测试令牌均无残留；本次文件的 `git diff --check` 通过；本地 `.env` / `.env.local` 被忽略。保留任务前已有的 `.mcp.json`、`SECURITY.md` 和首页预览改动。结果：[repair-security-checks.json](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/repair-security-checks.json)。

## 部署前的必要步骤

1. 启动和测试前从本机凭据配置注入 `DB_PASSWORD`。配置已删除数据库默认口令；仅创建 `.env` 文件不会保证 Maven 或 Java 自动加载，启动进程必须实际收到环境变量。
2. 在目标库核对同餐次旧重复项及数据库备份，然后执行 [migrate-cooking-consistency.sql](/Users/xx/cx/家庭点菜小程序/server/sql/migrate-cooking-consistency.sql)。新服务依赖新增列与唯一索引，必须先迁移再更新前后端。该脚本尚未集成到现有生产迁移入口，也未在开发/生产库执行。
3. 若同餐次存在旧重复，人工核对 ID、状态与引用后再处理，迁移不会自动删除旧数据。MySQL DDL 不具备整体事务回滚：最后的菜单索引失败时，前面成功新增的烹饪列/索引仍可能保留；处理后可重复执行脚本。
4. 更新服务与小程序后，验证真实登录、调整份数、断网重试、跨页面重复提交、多人同时操作、两餐同菜和只撤当前餐次。本轮未执行部署，开发服务没有加载这些变更。

## 尚存边界

- 原料仍以同名、同单位匹配，没有新增跨单位换算或缺口数量字段。无法解析的“适量”等用量不参与扣减；库存不足继续采用仅扣可用部分、不扣成负数的现有行为。
- 新幂等规则按家庭、用户和完成键生效。同一菜单由不同家庭成员分别完成，仍属于不同用户的操作；尚未实现跨用户的菜单完成唯一性。旧客户端不带键时，保留原有无评分 60 秒保护，带评分的旧请求仍需要升级客户端。
- 客户端确认身份与最终提交之间若发生会话身份变化，仍涉及下列登录续期问题；本轮身份分区不等于完整修复登录身份漂移。
- 部分后端业务仍可能出现事务竞争并要求重试；本轮验证的共享库存并发用例不能替代所有锁顺序与真机弱网测试。

原审计中的 P1 仍需处理：周菜单重新生成被缓存短路、清缓存与 OTP/微信续期身份漂移、静默登录覆盖资料、UGC 完整审核、离线队列家庭绑定、注销闭环、正式 API 域名与运营者信息、生产最小权限账户和备份恢复。这些问题尚未修复，因此当前仍不适合直接发布正式版。完整问题与原始复现见 [全面分析报告](/Users/xx/cx/家庭点菜小程序/artifacts/analysis-2026-10-07/report.md)。

历史数据库口令曾出现在代码和工具输出中，当前文件清理不会撤销暴露，Git 历史也仍有旧值。**需要轮换该数据库口令**；本轮没有更改数据库账户口令、重写 Git 历史或修改本机凭据文件。
