export const meta = {
  name: 'dev-pipeline',
  description: '研发流水线：需求 → 设计 → 前后端开发 → 测试（打回最多 2 轮）→ 本地提交',
  whenToUse: '用户给一句需求，要按 产品→架构→开发→测试→发布 的标准流程做完并本地提交时',
  phases: [
    { title: '需求', detail: '产品经理写需求单' },
    { title: '设计', detail: '架构师定改动清单和前后端分工' },
    { title: '开发', detail: '前端、后端并行' },
    { title: '测试', detail: '测试工程师验收，不过就打回' },
    { title: '发布', detail: '运维发布做提交前检查并本地提交' },
  ],
}

// 用法：Workflow({ name: 'dev-pipeline', args: '一句话需求' })
// 按名字调用只在这个 worktree 里开的会话有效；从主目录开的会话要把整段脚本内联传入。
// 角色不用 agentType：主目录的会话不会注册 worktree 里的 .claude/agents，
// 所以每个角色先读自己的 .claude/agents/<name>.md 再干活，两种会话都能跑。
const REQ = typeof args === 'string' ? args : (args && args.requirement) || ''
if (!REQ.trim()) throw new Error('缺需求：args 传一句话需求')

const WT = '/Users/xx/.codex/worktrees/meal-journey-ui/家庭点菜小程序'
const MAX_ROUNDS = 2

const PM_SCHEMA = {
  type: 'object',
  properties: {
    spec: { type: 'string', description: '完整需求单：场景、范围、验收标准' },
    noWorkNeeded: { type: 'boolean', description: '现有功能已能满足，不用做' },
    needsUser: { type: 'array', items: { type: 'string' }, description: '必须用户拍板才能继续的点' },
  },
  required: ['spec', 'noWorkNeeded', 'needsUser'],
}

const DESIGN_SCHEMA = {
  type: 'object',
  properties: {
    design: { type: 'string', description: '完整设计单' },
    frontendTask: { type: 'string', description: '前端任务；没有就空串' },
    backendTask: { type: 'string', description: '后端任务；没有就空串' },
  },
  required: ['design', 'frontendTask', 'backendTask'],
}

const TEST_SCHEMA = {
  type: 'object',
  properties: {
    pass: { type: 'boolean' },
    report: { type: 'string', description: '门禁结果与逐条验收结论' },
    issues: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          owner: { type: 'string', enum: ['frontend', 'backend'] },
          detail: { type: 'string', description: '现象、位置、建议改法' },
        },
        required: ['owner', 'detail'],
      },
    },
    needsDevice: { type: 'array', items: { type: 'string' }, description: '只能真机确认的项' },
  },
  required: ['pass', 'report', 'issues', 'needsDevice'],
}

// 只有发布能提交：第一次跑时前端开发改完就自己 commit 了，提交在测试验收之前，也没经过发布前检查。
const ctx = `工作目录：${WT}（分支 codex/meal-journey-ui）。只在这里干，不碰 /Users/xx/cx/家庭点菜小程序（那边有别人未提交的改动）。所有命令都 cd 到工作目录或用绝对路径；node 用 ~/.local/opt/node22/bin/node。只有「运维发布」这一步可以 git commit，其他角色只改不提交。`
const role = (name) => `先完整读你的角色说明 ${WT}/.claude/agents/${name}.md（frontmatter 之后的正文就是你的职责和规矩），按它行事。\n\n`

// —— 需求 ——
phase('需求')
const pm = await agent(`${role('pm')}${ctx}\n\n用户需求：${REQ}\n\n写需求单。`, { phase: '需求', label: '产品经理', schema: PM_SCHEMA })
if (!pm) throw new Error('产品经理没有产出')
if (pm.noWorkNeeded) return { stoppedAt: '需求', reason: '现有功能已满足', spec: pm.spec }
if (pm.needsUser.length) {
  log(`有 ${pm.needsUser.length} 个点要用户拍板，流水线先停在需求`)
  return { stoppedAt: '需求', needsUser: pm.needsUser, spec: pm.spec }
}

// —— 设计 ——
phase('设计')
const ds = await agent(`${role('architect')}${ctx}\n\n需求单：\n${pm.spec}\n\n出设计单，前端任务和后端任务分开写。`, { phase: '设计', label: '架构师', schema: DESIGN_SCHEMA })
if (!ds) throw new Error('架构师没有产出')

// —— 开发 + 测试（打回循环）——
// 前端只改 miniapp/、后端只改 server/，目录不重叠，所以并行跑在同一个 worktree，不另开隔离。
let fe = ds.frontendTask.trim(), be = ds.backendTask.trim()
let test = null
const devLog = []
for (let round = 1; round <= MAX_ROUNDS + 1; round++) {
  const tag = round === 1 ? '' : `（第 ${round - 1} 次返工）`
  const jobs = []
  if (fe) jobs.push(() => agent(`${role('frontend-dev')}${ctx}\n\n需求单：\n${pm.spec}\n\n设计单：\n${ds.design}\n\n你的任务${tag}：\n${fe}`, { phase: '开发', label: `前端开发${tag}` }))
  if (be) jobs.push(() => agent(`${role('backend-dev')}${ctx}\n\n需求单：\n${pm.spec}\n\n设计单：\n${ds.design}\n\n你的任务${tag}：\n${be}`, { phase: '开发', label: `后端开发${tag}` }))
  if (!jobs.length) return { stoppedAt: '设计', reason: '设计单里没有开发任务', design: ds.design }
  devLog.push(...(await parallel(jobs)).filter(Boolean))

  test = await agent(`${role('tester')}${ctx}\n\n需求单（按其中验收标准验）：\n${pm.spec}\n\n设计单：\n${ds.design}\n\n开发汇报：\n${devLog.slice(-jobs.length).join('\n\n---\n\n')}`, { phase: '测试', label: `测试工程师 第 ${round} 轮`, schema: TEST_SCHEMA })
  if (!test) throw new Error('测试工程师没有产出')
  if (test.pass) break
  if (round > MAX_ROUNDS) {
    log(`返工 ${MAX_ROUNDS} 次仍未通过，不提交，交给用户`)
    return { stoppedAt: '测试', report: test.report, issues: test.issues, needsDevice: test.needsDevice }
  }
  fe = test.issues.filter((i) => i.owner === 'frontend').map((i) => '- ' + i.detail).join('\n')
  be = test.issues.filter((i) => i.owner === 'backend').map((i) => '- ' + i.detail).join('\n')
  log(`测试打回：前端 ${fe ? fe.split('\n').length : 0} 条，后端 ${be ? be.split('\n').length : 0} 条`)
}

// —— 发布 ——
phase('发布')
const rel = await agent(`${role('release')}${ctx}\n\n本次需求：${REQ}\n\n设计单（改动清单）：\n${ds.design}\n\n测试结论：\n${test.report}\n\n做提交前检查并本地提交。`, { phase: '发布', label: '运维发布' })

return { spec: pm.spec, design: ds.design, test: test.report, needsDevice: test.needsDevice, release: rel }
