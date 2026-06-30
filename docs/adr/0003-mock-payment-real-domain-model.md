---
status: accepted
---

# 模拟支付：领域模型做实，仅以 MOCK 端点替代真实微信回调

当前阶段不接真实微信支付，但要为未来接入预留零返工的接缝，避免做成抛弃式 mock。

**决策**：
1. 真实建出并落库家庭会员模型与 `payment_order` 表（含 out_trade_no、家庭、下单用户、套餐、金额(分)、payment_method、状态、时间）。
2. 订单状态机（PENDING → PAID，旁路 CLOSED/REFUNDED）、幂等、按套餐叠加有效期等逻辑全部做实。
3. 仅将「微信 notify 验签」这一步替换为模拟开通端点：下单 PENDING → 立即置 PAID（payment_method = `MOCK`）→ 同一事务延长家庭 expires_at。
4. 未来接真实微信支付时，只新增一个 notify 回调入口，复用同一套「订单 → 开通」逻辑，模型与表结构零改动。

**理由**：现在即可演示完整购买闭环，并让 ADR-0001（家庭归属）、ADR-0002（有效期）真正落地；同时把未来风险（前端回调不可信、需验签、需幂等）固化进模型，避免日后重写。

**影响**：新增 `payment_order` 表与家庭会员有效期字段；开通入口分两类——MOCK 端点（现在）与微信 notify（未来），共用开通服务；前端 `wx.requestPayment` 暂不接入，购买动作直连 MOCK 端点。
