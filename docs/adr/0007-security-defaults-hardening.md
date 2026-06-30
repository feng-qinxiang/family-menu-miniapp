---
status: accepted
---

# 安全默认值：dev-otp 默认关闭、加成员强制 owner 校验、DB 弱口令仅本地

接入支付前对认证链路止血，体检发现三处「门没锁」的安全缺口。

**决策**：
1. `auth.dev-otp-enabled` 默认由 `true` 改为 `false`。开发态固定验证码(246810)+ 明文回显仅供本地联调，默认开启等同任意手机号账号接管。测试用 `@TestPropertySource(auth.dev-otp-enabled=true)` 单点开启，不再用同名 test application.yml（会整体覆盖主配置导致数据源丢失）。
2. `FamilyService.addMember` 增加 owner 校验（复用 `requireFamilyOwner`），`member_role` 经 `normalizeMemberRole` 白名单化——只允许 member/admin，禁止前端自由写入 owner 提权。controller 传入 requesterUserId。
3. DB `root/123456` 默认值保留（本地零配置启动），不在 yml 移除；改为 README 显著标注「生产必须用环境变量覆盖为最小权限账号、禁用 root」，靠流程约束而非强制注入，避免打破本地开发体验。

**理由**：前两项是纯漏洞，无副作用，直接修。第三项移除默认值虽更安全，但会打破用户既定的本地零配置 `mvnw test/run` 流程（CLAUDE.md 明确约定 root/123456 为本地默认），用户选择保留默认值 + 文档警示。

**影响**：application.yml、README.md 配置表与安全须知、FamilyController、FamilyService、CoreFlowTests（加 @TestPropertySource）。测试 10 项全绿无回归。
