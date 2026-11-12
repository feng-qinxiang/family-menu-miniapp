---
status: accepted
---

# 安全默认值：dev-otp 默认关闭、加成员强制 owner 校验、DB 弱口令仅本地

接入支付前对认证链路止血，体检发现三处「门没锁」的安全缺口。

**决策**：
1. `auth.dev-otp-enabled` 默认由 `true` 改为 `false`。开发态固定验证码(246810)+ 明文回显仅供本地联调，默认开启等同任意手机号账号接管。测试用 `@TestPropertySource(auth.dev-otp-enabled=true)` 单点开启，不再用同名 test application.yml（会整体覆盖主配置导致数据源丢失）。
2. `FamilyService.addMember` 增加 owner 校验（复用 `requireFamilyOwner`），`member_role` 经 `normalizeMemberRole` 白名单化——只允许 member/admin，禁止前端自由写入 owner 提权。controller 传入 requesterUserId。
3. 当时保留本地数据库默认口令，并要求生产覆盖为最小权限账号。此决定已于 2026-10-08 被凭据规则取代：当前配置删除默认口令，启动与测试必须从 `DB_PASSWORD` 注入。

**理由**：前两项是纯漏洞，无副作用，直接修。第三项当时为保留本地零配置流程而采用文档警示；该理由仅解释历史决定，当前遵循凭据必须间接引用的规则。

**影响**：application.yml、README.md 配置表与安全须知、FamilyController、FamilyService、CoreFlowTests（加 @TestPropertySource）。测试 10 项全绿无回归。
