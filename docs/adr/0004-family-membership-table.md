---
status: superseded by ADR-0005
---

# 会员独立成 family_membership 表，删除 user_account 旧会员列

> **部分被 ADR-0005 取代**：会员归属主体由家庭改为购买者用户，会员表以 payer_user_id 为主键关联（非 family_id）。「删除 user_account 旧列、独立成表、重写演示数据」的结论仍有效。

落地家庭归属（ADR-0001）需确定 schema 形态。现存 `user_account.vip_status` / `plan_name` 仅服务于演示假数据，无真实存量需要保护。

**决策**：
1. 新建 `family_membership` 表（family_id、expires_at、current_plan、updated_at），作为会员资格的唯一存储。
2. 删除 `user_account.vip_status` 与 `plan_name` 两列，消除双真相来源。
3. 所有会员判定统一走「用户 → 所属家庭 → family_membership.expires_at > now()」。
4. 重写 `data.sql`：给演示家庭插入一条未过期 membership，首屏仍展示 VIP 态。

**理由**：演示数据可弃，没有迁移包袱；保留旧列只会留下被误读的隐患。独立成表（而非在 family 表加列）便于日后承载会员变更历史与续费记录。

**影响**：schema.sql 删两列加一表；data.sql 重写会员种子；读取 `vip_status` 的代码（如 MysqlKitchenStore.vipStatus）改走新表 join。
