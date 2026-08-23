# Proposal: ui-layout-bugs

## Why
提问人是小白，要的是「UI、布局、各种 bug 怎么完善」，不是再开一轮设计系统或删页瘦身。现状已经能看见：首页刷新失败把整页摘空、只有一道菜却写「还没有菜谱」、标题还留着调试用的「【新】」；按钮和文案有多处撒谎（微信登录成功其实是游客、查看全部记录却进菜谱库、社区热度是写死的）；做完菜不进记录、资料页写了点不进去；正式包接口地址读不到，会打向本机。先把这些看见的洞补上。

## What
- **首页布局接上已写逻辑**：wxml 用 `loadError && !hasHomeData` 才全屏错误并藏餐次/许愿/sheet；有数据的刷新失败走已有 `--soft` 顶条、下方保留；`loading` 时只出骨架（餐次条不叠出来）；`applyFilters` 在仅 1 道菜时不要触发「还没有菜谱」；`app.json` / `home/index.json` 去掉「【新】」调试标题 | refs: R-1 | verify: 冷启动失败=全屏「连不上厨房了」无餐次；成功过再断网仍见许愿/区块；1 道菜时有 hero、无「还没有菜谱」；导航标题无「【新】」
- **撒谎改成真或藏起**：微信 503 降级游客时 toast 不说「登录成功」；设置页「微信绑定」不写死「已绑定」；「我的」最近上桌「查看全部记录」和 section-head「全部」改去 cook-log；社区 HOT_TOPICS 去掉假热度数字（可留话题词）；登录页「忘记密码」隐藏（重置页手机号写死、无密码体系）。导入「拍照识别」已有「即将上线」，不藏 | refs: R-1 | verify: 上述入口不再出现假成功/假数字/点进去发现是另一页
- **做菜和资料走得通**：cook-mode 完成先 `addCookHistory`，成功再进 cook-log；写失败 toast 并留在做菜页。 「我的」按已有工具行补「编辑资料」「消息」入口；home `onShow` 已初始化后顺带刷 `getFamilyProfile`+`getCurrentUser` | refs: R-1, R-2 | verify: 做完一道菜记录页能看到刚做的；写失败不跳转；我的能进资料编辑并保存；家人改名后回到首页问候语更新
- **请求打到真地址、失败只说一次**：`app.js` 用 `resolveConfig().apiBaseUrl`；`wx.request` 加 timeout 10s；已有页面错误态的数据请求加 `silent:true`，对应 catch 不再 `showToast` | refs: R-1 | verify: `app.globalData.apiBaseUrl` 不再是 undefined；断网打开首页/我的只出一块页面错误、不连闪 toast；挂起接口约 10s 进错误态
- **几处写丢了的小洞**：recipe-edit 提交 steps 带上 `image`；recipe-detail 加菜按 home 的去重+提交守卫；加入家庭扫码优先取 `code=`（不改 navigateTo 返回栈）；设置清缓存/退出保留 `font_scale` | refs: R-1 | verify: 步骤图保存后再打开还在；详情连点加菜不重复入桌；扫带 `code=` 的码能填对；清缓存后大字模式还在

**Not in this change**: VIP 标价与免费开通；库存两页判定统一；编辑/导入脏数据守卫；周菜单重排确认；删死页/压图/主包分包；全站字号 token 化；后端越权/UGC 审核/游客合并；深色皮肤做完（只关开关）；换 UI 库。

## How
- 不引新库；错误态继续用静态碗，不退回转圈
- 首页条件兑现已有 `hasHomeData`，错误态仍用 `!loading && …`，不用 `!loading` 去藏餐次（加载中只靠骨架互斥）
- 接口默认 toast 不反转；只给首页/我的/菜谱/购物等已有 `loadError` 的 getter 加 silent，页面 catch 只 setData 错误文案
- 撒谎入口改文案或隐藏，不删页；拍照识别保持「即将上线」。做菜写失败不跳转；加入家庭不改返回栈
- `app.json` `darkmode: false`；`theme.json` 不动。`env` 只改 `app.js` 取值，不新造配置层

## Risk
- silent 加错对象：给没有错误态的 action（收藏/举报）加了 silent → 失败无声 | 只改已有 loadError 的数据拉取
- `hasHomeData` 过宽：本地空许愿/空菜单被当成有内容 → 软失败露出大片空标题 | 沿用现有 `_syncHasHomeData`（必须有菜/hero/有内容的菜单卡/许愿）
- 回滚：还原本 change 改过的前端文件即可

<!-- APPROVED: 2026-08-22 19:36 -->
