# Research: ui-click-display

## Practices
- **说真话热区（主选）**：看起来能点的必须有去处；叠层先拆开，不新接跳转 | 适用：提问人是小白、上轮 ui-layout-bugs 已修撒谎文案，本轮剩「点了不是那回事 / 按下没反应」
- **全站 tap-scale 普查（弃）**：30+ 页都有该类名，多数已绑 tap | 对「点击乱」的可见收益被回归面吃掉
- **全站抬高 360rpx Hero（弃）**：me/community/menu/shopping/pantry/recipe-detail 同套裁切 | 品味大包，不是点错的根因
- **把 zcode 整包拷进 Cursor（弃）**：用户 skills 已由 `~\.agents\wire-cursor-skills.ps1` 接到 `~\.cursor\skills` | 再拷会盖 superpowers，且 `~\.zcode\v2\config.json` 含模型密钥明文

Key references: 微信点击与 catchtap https://developers.weixin.qq.com/miniprogram/dev/framework/view/wxml/event.html · 自定义组件 slot https://developers.weixin.qq.com/miniprogram/dev/framework/custom-component/wxml-wxss.html

## Constraints
- 未归档并行变更：`ui-layout-refresh`（APPROVED+verify pass）、`ui-layout-bugs`（APPROVED+verify pass）、`exp-closure-r3`（提案未实施） | `check-tbd`/`check-gate` 要求恰好 1 个 active change，不归档则 propose/apply 被拒
- 暖奶油 token + 零新 UI 库 + recipe-card/section-head 已关 virtualHost | 违反：视觉回退或模拟器空白
- 首页铃铛 `goShopping`、放大镜 `goRecipes`（switchTab）已接通，乱的是**图标语义**不是断链 | 改路由会打掉已养成的「右上角去买菜/菜谱」
- 社区 `loadPosts` catch **已** `posts: []`；乱的是 loading 期间旧帖与「正在加载」同屏。冰箱失败只设 `loadError`、**不清** `categories`。菜谱 catch 不清 `displayedRecipes`
- 菜单 nav-bar 有右侧 slot；「点菜」在 hero `z-index:10`，`.nav-float` `z-index:50`，点上半截打在空标题上
- 交付：`node test/dish-logic.test.js`、`node test/recipe-steps.test.js` 须 EXIT=0；无 CI；UI 靠开发者工具手测 | 「构建过了」不能代替这两句
- 未扫 weekly-menu / import / recipe-edit / cook-log / family / payment / showcase 的像素级重叠 | 不把未扫页写成已确认
- zcode MCP（playwright/browser）与 Cursor `mcp.json` 已并存且 **profile 故意分开**；海鸥 AGENTS.md 攻防人设 Cursor 刻意没接 | 合并 profile 会抢同一套 Chrome 用户数据

## Open [TBD]
（空——已 auto-triage）

## Decided
- [DEC-1] 本轮只修已确认的点击撒谎/叠层/过小热区 + 三页加载互斥；不抬全站 Hero、不换皮、不普查全部 tap-scale | source [TBD-1] | escalated | 用户原话是点击乱和显示乱，不是再开设计系统；未扫页不写进 What | if wrong: 把砍掉的页加回 What
- [DEC-2] 假热区只去掉 `tap-scale`，不新接跳转（本月做菜/家庭成员/最近上桌行/社区话题） | source [TBD-2] | auto | 接线是新产品语义；去缩放就不再「按下没反应」 | reversibility: 加回 class
- [DEC-3] 首页铃铛/放大镜改形不改路由（购物车→买菜，书/格→菜谱库） | source [TBD-3] | escalated | 路由已通；改去消息/搜索页会改已养成路径 | if wrong: 一行改回图标或改 goNotifications/search
- [DEC-4] 菜单「点菜」移入 nav-bar 右侧 slot，hero 右上不再放同按钮 | source [TBD-4] | auto | 组件已有 slot，比重叠处加 z-index 干净 | reversibility: 挪回 `.m-hd-add`
- [DEC-5] 不抬全站 360rpx Hero、不改 sheet `-50rpx` | source [TBD-5] | auto | 裁切是品味项，不是点错根因；改六页 Hero 回归大 | reversibility: 无需撤
- [DEC-6] 用户级 playwright/browser 两边已有。微信小程序 MCP `weapp-dev`：旧本地路径已丢失；按用户门评改接到 Cursor `~\.cursor\mcp.json`，用 npm 包 `@yfme/weapp-dev-mcp`，端口仍用原配置 `ws://127.0.0.1:18375`，CLI 为 `E:\rjd\微信开发者工具\cli.bat`，项目根为本仓库。仓库 `.mcp.json` 同步改成同一套，zcode 也能连。ios/android 未启用、cloudbase 未安装，不搬。禁止拷 `v2/config.json` 密钥与海鸥 AGENTS | source [TBD-6] | 用户门评「微信小程序的mcp没放过来吗」推翻「不重装」；旧路径不复活，改用 npm 包
- [DEC-7] apply 前必须把另外三个 active change 归档（refresh/bugs 已 pass；exp-closure-r3 未实施，默认 abandoned） | source [TBD-7] | escalated | hook 硬拦多 change；不归档则本提案无法落地 | if wrong: 用户点名保留某一个，先 archive 另外两个
- [DEC-8] 菜谱库 grid 的 + 不用 `float`（改已有 `corner` 或跟 row 一样放信息区旁） | source [TBD-8] | auto | float 76×76 压在标题右下，点菜名会加菜 | reversibility: 改回 addPlacement
- [DEC-9] 社区已有帖时刷新不出「正在加载」、列表保留；冷启动无帖才出加载文案。冰箱/菜谱**失败**仍清旧列表，不用错误条盖住旧网格 | source [TBD-9] | auto | 卸掉还能看的帖是回归；失败+旧列表同屏才是显示乱 | reversibility: 改回 loading 文案与不清列表
