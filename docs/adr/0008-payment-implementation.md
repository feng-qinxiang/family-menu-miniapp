---
status: accepted
---

# 支付与会员落地实现：服务分层、越权防护与测试策略

ADR-0003/0005/0006 定了模型与原则；本 ADR 记录把它们落成代码时的具体实现决策。

**决策**：
1. **领域归口到 payment 包**：会员判定与开通集中到 `MembershipService`，套餐目录在 `PlanCatalog`，订单状态机在 `PaymentService`。VIP 判定 SQL（本人 OR 当前家庭 share_scope=FAMILY 的 ACTIVE 成员、取最晚 expires_at、实时不缓存）只在 `MembershipService` 写一份，由 AuthService / MysqlKitchenStore / PaymentService 三方复用，杜绝判定逻辑漂移。
2. **开通原子性**：置 PAID 与叠加 expires_at 在同一 `@Transactional` 内完成；读订单用 `SELECT ... FOR UPDATE` 行级锁，防并发重复开通。
3. **越权防护**：`mock-pay` 校验订单 payer_user_id == 当前用户，拒绝支付他人订单（403）；`share-scope` 仅购买者本人可改，无会员时返回 404。下单金额与时长一律从 `PlanCatalog` 取，忽略前端传入的任何价格/时长字段。
4. **展示与判定分离**：`/payment/membership` 查本人 payer_user_id 名下的会员（用于展示到期日与共享开关）；`/vip/status` 走共享判定（本人可能无自购会员却因家庭共享而享有权益）。两者语义不同，分别实现。
5. **测试策略**：本机 Docker 不可用，Testcontainers 无法启动 MySQL 容器；改用直连本地 MySQL 3306（与既有 CoreFlowTests 同环境）的 `@SpringBootTest` + MockMvc 端到端测试，覆盖下单 / 模拟开通 / 幂等不叠加 / 续费叠加 / 共享开关 / 越权购买 / 金额防篡改 / 未支付不开通。

**理由**：判定逻辑集中避免多处 SQL 各自演化导致权益口径不一；同事务 + 行锁是支付幂等的标准做法；越权与金额校验是支付类功能的高危项，必须在服务层而非仅前端拦截。Testcontainers 是更理想的隔离方案，但在无 Docker 环境下不可行，直连真实库同样能验证真实 MySQL 行为（项目本就依赖 MySQL 专有语法），实测价值不打折，待 CI 具备 Docker 再迁移。

**影响**：新增 `com.familymenu.daily.payment` 包（PlanCatalog / MembershipService / PaymentService）与 `PaymentController`；`MysqlKitchenStore.activateVip` 改为委托 `MembershipService.grant`，保留兼容入口；新增 `PaymentFlowTests`（9 用例）。后续接真实微信支付时，只需新增 notify 回调入口调用 `PaymentService.markPaid` 的等价开通路径。
