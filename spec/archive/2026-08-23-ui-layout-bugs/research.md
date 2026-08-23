# Research: ui-layout-bugs

## Practices
- **可见问题优先（主选）**：只修用户能看见的布局断裂、文案撒谎、走不通的闭环；零新依赖 | 适用：提问人是小白、仓库已打过两轮 UI 且仍有未兑现逻辑
- **一次收口大包（弃）**：同日 `exp-closure-r3` 已写 token 立法 + 删死页 + 压图 + API 默认反转 | 对小白过载；回归面与「完善我能看见的」不对等
- **换 UI 库（弃）**：Vant/TDesign/WeUI | 默认皮打暖奶油、吃主包 | https://vant-ui.github.io/vant-weapp/ https://tdesign.tencent.com/miniprogram/overview

Key references: 微信请求 https://developers.weixin.qq.com/miniprogram/dev/api/network/request/wx.request.html · 环境版本 https://developers.weixin.qq.com/miniprogram/dev/reference/configuration/app.html · darkmode https://developers.weixin.qq.com/miniprogram/dev/framework/ability/darkmode.html

## Constraints
- 暖奶油 token + 零新 UI 库 + custom-tab-bar 四入口已定 | 违反：视觉回退或 tab 双实例
- 交付通道：`node test/dish-logic.test.js` 亲跑 25 断言 EXIT=0；无 CI、无 skipTests；UI 靠开发者工具 | 「构建过了」不能代替这句
- 未归档并行变更：`ui-layout-refresh`（已 APPROVED+verify pass）与 `exp-closure-r3`（未实施大包） | `check-gate` 要求恰好 1 个 active change，不归档则 apply 被拒
- 订正 knowledge：recipe-card / section-head **已关** virtualHost（组件注释：部分基础库/模拟器空白）
- `app.js` 读 `env.js` 不存在的 `API_BASE_URL` → `apiBaseUrl` 为 undefined → `api.js` 落到 `localhost:9088` | 真机正式包表现为「连不上厨房」
- 首页 JS 有 `hasHomeData`，wxml 只认 `!loadError`：刷新失败一律全屏并摘餐次/许愿；`loading` 时骨架与餐次条同屏
- `applyFilters` 1 道菜只进 hero，`state-empty` 仍出「还没有菜谱」
- 今日页系统导航标题「【新】今日点菜」（调试残留），另三 tab 为 custom；Hero 按无系统栏留 `safe-area+90rpx`
- `rawRequest` 失败默认 toast，home/me/recipes 等 catch 再 toast → 一次失败连闪两条
- 未复测主包 KB、未通读 showcase/payment 全链路/后端 SQL | 不把未测数字当约束

## Open [TBD]
（空——已 auto-triage）

## Decided
- [DEC-1] 本轮只修用户看得见的 UI/布局/撒谎/闭环；不做 token 立法、死页删除、主包瘦身、后端三洞、VIP 支付 | source [TBD-1] | escalated | 用户是小白且原话是「ui和布局和各种bug」；大包已有未实施的 exp-closure-r3 | if wrong: 把砍掉的项加回 What
- [DEC-2] 今日页去掉「【新】」调试标题，保持系统导航栏，不改 custom | source [TBD-2] | auto | 改 custom 要重做 Hero 顶距，收益只是对齐另外三 tab | reversibility: 改回两处 title 字符串
- [DEC-3] 撒谎入口改文案或隐藏，不删页面文件 | source [TBD-3] | auto | 删页要全库 grep 跳转，对小白风险不对等 | reversibility: 恢复文案/入口
- [DEC-4] `darkmode: false` 锁浅色；theme.json 保留 | source [TBD-4] | escalated | 深色链路未接通（零 @ 引用、零 prefers-color-scheme），开着是假承诺 | if wrong: 改回一行
- [DEC-5] wxml 挂上已有 `hasHomeData`：仅冷启动无数据全屏错误；有可浏览内容的刷新失败保留下方 | source [TBD-5] | auto | JS 已写、proposal 上轮已批，只是没挂上 | reversibility: 改回 `!loadError`
- [DEC-6] 不反转 api 全局默认；只给已有页面错误态的数据请求加 `silent:true`，对应 catch 不再 toast | source [TBD-6] | auto | 全局 silent 会让无 catch 的 action 失败无声（旧稿 R0-1） | reversibility: 去掉 silent、恢复 toast
- [DEC-7] VIP 标价/白开、库存两页判定、脏数据守卫、周菜单确认、双份 guest、死页清单 —— 本轮不做 | source [TBD-7] | auto | 支付语义或不可见工程债 | reversibility: 无需撤
