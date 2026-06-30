# Context Map

## Contexts

- [Server](./server/CONTEXT.md) — 后端领域：家庭、菜谱、菜单、社区、会员与支付
- [Miniapp](./miniapp/CONTEXT.md) — 微信小程序前端的展示与交互术语

## Relationships

- **Miniapp → Server**：小程序通过 HTTP API + `X-Auth-Token` 调用后端，前端不持有领域规则，只消费后端状态
