---
goal: 在用户选定的 meal-journey 那版界面上修掉已点出的毛病（菜图对不上、首页第一屏看不到菜、家人心愿卡偏空、其余页面明显错处），风格配色底栏不动，每处改动单独提交可单独退回
status: running
max_rounds: 10
no_progress_fuse: 3
started: 2026-11-12
---
# Loop: ui-fix-on-meal-journey

用户确认（2026-11-12，冷启动唯一一次询问）：按 6 条验收开始；最多 10 轮；改动连同此前未推的 41 次提交全部推到 GitHub（公开仓库）。
不在范围：换风格或配色、改底栏、后端功能和管理后台、新拍或新找菜的照片（缺图的菜列清单给用户）。

## Acceptance
- [x] A-1 菜图和菜名对得上：内置菜每道配的图就是这道菜，没有合适照片的用统一占位图，不允许张冠李戴 (verify: `node artifacts/ui-fix-2026-11-12/build-dish-check.js` 生成「菜名—配图」对照页并逐格目检；`node miniapp/test/dish-images.test.js` EXIT=0；模拟器首页大图推荐的菜与图一致、不再出现带青红椒的「红烧肉」)
- [x] A-2 首页第一屏能看到菜 (verify: 模拟器默认机型打开首页不滑动截图，「家里常做的菜」下至少露出完整一排菜的图和名字)
- [x] A-3 「家人心愿」卡变矮 (verify: 没人许愿时该卡只占一行、高度不超过改前的一半——改前改后各量一次 boundingClientRect；点「+ 我想吃」仍能打开许愿输入)
- [x] A-4 其余页面过一遍 (verify: 做菜、记录、社区、我的、菜谱详情、做菜步骤、买菜清单、冰箱的截图存到 artifacts/ui-fix-2026-11-12/screens/；artifacts/ui-fix-2026-11-12/findings.md 列出发现的明显毛病，每条标「已修」或「留给用户定」，已修的有改后截图)
- [ ] A-5 没改坏 (verify: `for t in miniapp/test/*.test.js miniapp/test/static-check.js; do node $t; done` 全部 EXIT=0；模拟器控制台在首页、点菜、做菜、记录、社区、我的各页无 error)
- [ ] A-6 给用户一页前后对比 (verify: artifacts/ui-fix-2026-11-12/compare.html 存在，每处改动一行、左改前右改后，用无头浏览器打开截图确认图片都加载出来)

## Rounds

### Round 1

#### Plan
做 A-1（菜图和菜名对得上）。它是用户亲口点的第一条毛病，而且 A-2 要让第一屏露出菜——图不对的话露出来的也是错图，所以先做。

#### Act
- `miniapp/utils/image.js`：按菜名找内置照片的规则收紧到整道菜对得上才算（去掉「红烧肉→hongshao-pork」「糖醋」「鸡翅」「蒜蓉/西兰花」「虾」「牛肉炒」这类宽词或错配）；`fallbackDishImg` 找不到就给占位图，不再按哈希挑别的菜的照片；`recipeDishImg` 走同一条。
- `miniapp/pages/menu/index.js`：删掉自带的 `hashIndex/localDishImage/resolveImage`，直接用 `recipeDishImg`。
- `miniapp/pkg-extra/import/index.js` + `.wxml`：删掉按顺序轮的 `FALLBACK_DISHES`/`fallbackCover`，没封面给占位图。
- `miniapp/pages/home/index.js`：大图推荐只在有照片的菜里轮转（占位图铺半屏等于开天窗）。
- `server/src/main/resources/data.sql`：种子 2 红烧肉、5 可乐鸡翅、7 蒜蓉西兰花、8 糖醋排骨的封面留空；文件末尾的幂等修正区加四条 UPDATE 清老库（只清原值，换过封面的不动）。
- 测试：`dish-images.test.js` 加占位图与种子断言；`journey-navigation.test.js`、`cook-consistency.test.js` 各有一条断言原本就是在保护「没图就借别的菜的图」，改成期望占位图。
- 新增 `artifacts/ui-fix-2026-11-12/build-dish-check.js`（从 data.sql 种子 + 真实取图函数生成对照页）。
- `.gitignore` 加 `.loop-state`。
- 提交 3e0d141，已推到 origin/design/ui-remodel。

#### Verify
- `node artifacts/ui-fix-2026-11-12/build-dish-check.js` → `16 道；缺照片：红烧肉、可乐鸡翅、蒜蓉西兰花、糖醋排骨`；无头 Chrome 截成 dish-check.jpg 逐格看过：12 张照片都是这道菜，4 道是占位图。**一格勉强**：家常拌面配的 lo-mein.jpg 画面主体是牛肉和芦笋，面压在下面——没撤，记进 findings 留给用户定。
- `cd miniapp && for t in test/*.test.js test/static-check.js; do node $t; done` → 24 个全部 EXIT=0（第一遍 cook-consistency 红了一条，就是上面说的旧断言，改后全绿）。
- 本机后端从主工作区重启后查库：四道菜 cover_image 由错图路径变成 NULL（改前改后各查一次）。
- 模拟器首页：大图推荐是「牛肉炒西兰花」配牛肉西兰花照片（截图 screens/home-r1.jpg）；连点 16 次「换一道」，轮到的 12 道全是有照片的、图名一致，没有出现红烧肉；控制台 grep error/fail 无输出。
- A-1 打勾。

#### Retrospect
- 教训：这批内置照片的**文件名不可信**（hongshao-pork 是咕咾肉、orange-chicken 是橙子鸡块、sweet-sour-chicken 是芝麻鸡块）。之前所有「图对不对」的测试都只断言文件名，所以一直绿着却一直错。以后判断图对不对必须看图，对照页就是为这个留的。→ L-1
- 教训：三个地方各写了一份「没图就挑一张别的」的逻辑（image.js、做菜页、导入页），只改共享函数会漏两处。→ L-2
- 新发现（影响下一轮）：首页「家里常做的菜」列表头两格现在正好是红烧肉、可乐鸡翅——两个占位图。A-2 把这一排露到第一屏时，露出来的会是两个灰碗。
- 下一轮：做 A-2（首页第一屏能看到菜）。先量现在第一屏的高度都被谁占了（搜索框、家人心愿卡、今天这一桌），把「家里常做的菜」这排提上来；同时让有照片的菜排在这排前面，避免头一排是两个占位图。只动位置和间距，不动风格配色。

### Round 2

#### Plan
做 A-2（首页第一屏能看到菜），连同上一轮发现的「这排头两格是占位图」。

#### Act
- 先量了改前的位置（390×844，底栏上沿约 745）：大图 0→324，餐次 322→361，今天这一桌 371→560（189 高），家人心愿 572→638，标题 662，搜索 696→743，菜系 749→798，菜卡 809→1031。菜卡要上移近 290 才能进第一屏——**搜索框只占 58，不是主因**（我之前跟用户说是搜索框挤的，说轻了），真正占地方的是「还没点菜」那张 189 高的空卡。
- 取舍：原顺序下把空卡、心愿卡、搜索、菜系全部压扁也凑不够；所以改先后——`miniapp/pages/home/index.wxml` 把推荐区整块（标题、搜索、菜系、横滑菜卡）移到餐次分段下面，「今天这一桌」和家人心愿排到它后面。每一块的样子都没动。
- `miniapp/pages/home/index.wxss`：`.hm-recipes-head` 上边距 24rpx→8rpx，新增 `.hm-menu-wrap { margin-top: 24rpx }`。
- `miniapp/pages/home/index.js` `_filterPatch`：这排有照片的排前面、没照片的跟在后面；全都没照片时大图照常在全部菜里轮换（上一轮的写法在这种情况下「换一道」会卡住不动，这轮一并改对）。
- `miniapp/test/dish-images.test.js` 加这段逻辑的断言。
- 提交 2f73ba2，已推到 origin/design/ui-remodel。

#### Verify
- 模拟器首页不滑动截图 `screens/home-r2.jpg`：「家里常做的菜」下露出番茄炒蛋、香菇滑鸡两张卡的图、菜名和「10 分钟 · 鲜」那行；量得菜卡 533→754，卡片最底下的边被底栏压住约 9px（图和名字完整）。改前同一位置是「今天这一桌」空卡和搜索框（`screens/home-r1.jpg`）。
- 往下滑的截图 `screens/home-r2-lower.jpg`：菜卡、今天这一桌、家人心愿依次排开，间距正常，底部没被底栏压住。
- 连点 13 次「换一道」：每次这排占位图 0 张、不含大图那道。
- 24 个测试脚本全部 EXIT=0；控制台 grep error/fail/warn 无输出。
- **没验的**：今天这一桌里已经点了菜的状态只看了代码（卡片内部没动），没在模拟器里点一道菜实际看。留到 A-4 过页面时补。
- A-2 打勾。

#### Retrospect
- 教训：先量再下结论。我凭截图跟用户说「搜索框把菜挤下去了」，量了才知道主因是空卡。以后说「谁占了地方」之前先跑一次 boundingClientRect。→ L-9
- 这轮有两处是我替用户拿的主意，最后汇报要说清楚、对比页要能看出来：① 「今天这一桌」从第一屏挪到了菜卡下面；② 没照片的四道菜在首页这排排到最后，目前 11 道有照片的占满 10 格，它们在首页这排看不到了（「全部」里还在）。
- 下一轮：做 A-3（家人心愿卡变矮）。改前高度已量：66px（572→638 / 现在 972→1038）。目标 ≤33px、没人许愿时一行；点「+ 我想吃」仍能打开输入。只动没人许愿时的排法（「家人心愿」和「一起决定吃什么」并成一行），有心愿时的预览和展开不动。

### Round 3

#### Plan
做 A-3（家人心愿卡变矮）：上一轮复盘定的下一步，也是用户看图时点名的第三个毛病。

#### Act
- `miniapp/pages/home/index.wxml`：没人许愿且没点开时，给心愿那块加一个 `fp-wish--bare`。
- `miniapp/pages/home/index.wxss`：`fp-wish--bare` 去掉卡片外框和内边距，「家人心愿」和「一起决定吃什么」并排成一行；标题和「+ 我想吃」的可点高度仍是 44px，用负边距不撑高这一行。
- 有心愿、或者点开之后，这个类不挂，样子和原来一样。没动 js。
- 提交 b130f9c，已推到 origin/design/ui-remodel。

#### Verify
- 高度：改前 66px（第 2 轮量的，972→1038），改后 32px（`.fp-wish` boundingClientRect，挂着 `fp-wish--bare`），不到一半。截图 `screens/home-r3-lower.jpg`：一行「家人心愿　一起决定吃什么　……　+ 我想吃」。
- 点「+ 我想吃」（automation_element_action tap `.fp-wish-add`）：页面数据 `showWishModal: true`，弹出许愿输入框，截图 `screens/home-r3-wish-modal.jpg`。「+ 我想吃」量得高 44px。
- 其它状态没被带坏：没心愿时点标题展开 = 卡片 135px、带「先许个愿」按钮（`screens/home-r3-wish-expanded.jpg`）；有 1 个心愿收起 = 卡片 133px、带预览（`screens/home-r3-wish-has-one.jpg`）；有心愿展开 = 卡片 232px、带列表；心愿清空后回到 32px 一行。
- 24 个测试脚本全部通过（pass=24 fail=0）；控制台 grep error/fail 无输出。
- **没验的**：「有心愿」的状态是用工具往页面里塞的假数据，没有真的走一遍「写心愿 → 提交」——真提交会给家里人发通知，不拿真通知做测试。提交那段 js 这轮没动。
- 中途的弯路：在 automation_evaluate 里调 `p.setData({wishes:[…]})`，数据变了画面不变。把改动收起来在旧代码上重做，一样不变——是探针的毛病，不是这次改动造成的。换成 automation_page_action 的 setData 就正常重画。
- A-3 打勾。

#### Retrospect
- 教训：画面没跟着数据变时，先在没改的代码上重做一次，分清是自己改坏的还是工具的毛病，再决定要不要改代码。→ L-10
- 一处要让用户知道的：一行状态下点「家人心愿」这几个字，还是会展开成卡片（原来就这样，没动）。
- 对比页（A-6）里 A-3 的改前图用 `screens/home-r2-lower.jpg`（同一位置、旧卡片），比 L-8 写的 home-r1.jpg 更好对照；改后用 `screens/home-r3-lower.jpg`。
- 下一轮：做 A-4 的前一半——把做菜、记录、社区、我的、菜谱详情、做菜步骤、买菜清单、冰箱 8 个页面截图存到 screens/，逐张看，把明显毛病记进 findings.md（先只记不修；顺便补第 2 轮欠的「今天这一桌里已经点了菜」的样子）。要修的毛病放到再下一轮，一处一提交。

### Round 4

#### Plan
做 A-4 的前一半：8 个页面截图、逐张看、把毛病记进 findings.md。这轮只记不修，要修的放下一轮，一处一提交。

#### Act
- 截图存到 `artifacts/ui-fix-2026-11-12/screens/`：menu-r4（做菜·空）、menu-r4-picked（做菜·有菜）、cook-log-r4（记录）、community-r4（社区）、me-r4（我的）、recipe-detail-r4 / recipe-detail-r4-nophoto（菜谱详情，有照片 / 没照片）、cook-mode-r4（做菜步骤）、shopping-r4（买菜清单·有 12 样）、pantry-r4（冰箱）、recipes-r4（菜谱库，额外看的）、home-r4-picked-lower（首页今天这一桌有菜）。
- 为了看「有菜」的样子，用首页自己的 `addToToday` 往今晚加了番茄炒蛋（有照片）、红烧肉（没照片）；加菜这条后端不发通知（只有喊开饭、许愿、社区互动会发）。看完用 `removeTodayMenuRecipe` 撤掉，查过菜单 0 道、买菜清单 0 样。
- `findings.md` 加「其余页面」一节：1 条待修（菜谱详情没照片时顶上占位图被放大裁切）、1 条待定（「点的」/「想吃」说法不一）、4 条留给用户定（买菜清单太占地方、「买好了」按钮像已完成、做菜步骤每步都列全部用料、「11 道菜谱」和「全部 16」对不上）。
- 没改代码。

#### Verify
- 12 张截图逐张用 Read 看过；`ls artifacts/ui-fix-2026-11-12/screens/` 里 8 个页面都有。
- 控制台 grep error/fail：走完这些页面后无输出。
- 撤菜后 `getTodayMenu` items=0、`getShoppingList` items=0。
- A-4 **不打勾**：还有 1 条待修、1 条待定，没到「每条都标已修或留给用户定」。

#### Retrospect
- 教训：第 1 轮换占位图时只在小图位置看过（首页、对照页），没看大图位置——详情页顶上把方形占位图按「填满」裁切，就成了半截碗。换一张图要把它出现的所有尺寸都看一遍。→ L-11
- 教训：要看「有数据」的页面，先查这个操作后端发不发通知（grep `notifyFamily|notifyUser`），不发的才用页面自己的方法加，看完撤掉并查一次确实回到原样。→ L-11
- 下一轮：修菜谱详情顶上的占位图（没照片时完整显示一个碗，不裁切；先 grep `rd-hero-img` 和其它用 aspectFill 放大图的地方，如首页大图、做菜步骤、视频封面，看占位图会不会也被裁）。修完截改后图。再看「点的 / 想吃」两处文案的来历，决定统一还是留给用户定。两件各自单独提交。然后 A-4 可以打勾。

### Round 5

#### Plan
按上一轮复盘：把 A-4 剩下的两条处理掉——菜谱详情没照片时顶上占位图被放大裁切（待修）、「点的 / 想吃」说法不一（待定）。两件各自单独提交，然后 A-4 打勾。

#### Act
- 先查占位图还会出现在哪些大图位置：grep `recipeDishImg|fallbackDishImg|DISH_PLACEHOLDER` 的调用方。首页大图（第 1 轮已改成只轮有照片的菜）、做菜步骤（步骤没图就不画）、视频封面（只在有视频时出现）都不会把占位图放大到半屏；只有菜谱详情顶上这一处。
- `miniapp/pkg-extra/recipe-detail/index.js`：多一个 `coverPlain`（封面就是占位图时为真）。`index.wxml`：`coverPlain` 时图片用 `aspectFit` 完整显示，外层挂 `rd-hero--plain`。`index.wxss`：`rd-hero--plain` 底色用占位图自己的底色 #e5e1da，两边补齐。提交 083bd11。
- 「点的 / 想吃」：两处显示的都是后端的 `addedByName`（谁把菜加进今天的菜单，`TodayService.addMenuItem`），不是谁许的愿。`miniapp/pages/menu/index.wxml` 的「想吃」改成「点的」，和首页一致。提交 88bc13d。两个提交都已推送。

#### Verify
- 红烧肉（没照片）详情页截图 `screens/recipe-detail-r5-nophoto.jpg`：顶上一个完整的碗，热气在刘海下面露全，没被裁。番茄炒蛋（有照片）：`coverPlain: false`、没挂 `rd-hero--plain`、大图 390×223 和原来一样铺满。
- 做菜页：临时往今晚加番茄炒蛋，截图 `screens/menu-r5-picked.jpg` 显示「家人 点的」；看完撤掉，查过 `getTodayMenu` items=0、`getShoppingList` items=0。
- `cd miniapp && for t in test/*.test.js test/static-check.js; do node $t; done` → pass=24 fail=0（两处改动后各跑一次）。
- 控制台 grep error/fail 无输出。
- findings.md 现在每条都是「已修」或「留给用户定」，已修的都写了改前改后截图；8 个页面截图都在 screens/。A-4 打勾。

#### Retrospect
- 教训：文案不一致先查两处显示的是不是同一份数据（这次都是 `addedByName`），是同一份才统一；要是不同数据，就该改得更不一样，而不是改成一样。
- 没修、留给用户的 4 条（买菜清单太占地方、「买好了」按钮像已完成、做菜步骤每步都列全部用料、「11 道菜谱」和「全部 16」对不上）最后汇报要逐条列出来。
- 下一轮：做 A-5（没改坏）——跑全部测试；模拟器依次打开首页、点菜（菜谱库）、做菜、记录、社区、我的，每页查控制台没有 error。顺手核对 compare.html 要用的改前图是否齐全（A-1 的改前要去旧工作区截，见 L-8）。

## Lessons

- L-1 内置菜图的文件名和照片内容对不上的有三张（hongshao-pork / orange-chicken / sweet-sour-chicken），判断「图对不对」要看图不能看文件名；对照页：`node artifacts/ui-fix-2026-11-12/build-dish-check.js` 后用无头 Chrome 截图。
- L-2 改取图逻辑先 grep `LOCAL_DISHES|localPath\(|fallbackDishImg`，页面里有各自的私货。
- L-3 环境：真 Node 在 `~/.local/opt/node22/bin`（`export PATH="$HOME/.local/opt/node22/bin:/usr/bin:/bin"`）；本机 `grep` 是 ugrep，复杂正则用 `/usr/bin/grep`；zsh 里 `$b:path` 会被当修饰符，写 `"${b}:path"`；shell 的当前目录会漂，每条命令先 `cd /Users/xx/cx/家庭点菜小程序`。
- L-4 模拟器：`--project` 传仓库根目录 `/Users/xx/cx/家庭点菜小程序`；截图前 `open -g -a /Applications/wechatwebdevtools.app`；截图用 Read 看（图会跟在后面一条消息里）；页面数据用 automation_evaluate 读 `getCurrentPages().slice(-1)[0].data`。
- L-5 本机后端：`bash server/dev-server.sh stop|start`（口令自己从钥匙串取，start 前 PATH 要带 /usr/sbin）；现在是从主工作区起的，data.sql 每次启动都会跑。
- L-6 `artifacts/**/*.png|jpg` 被 .gitignore 挡着，截图只留本机；对比页 compare.html 引用本机截图即可。
- L-7 提交信息结尾带 `Co-Authored-By: BaoCode <noreply@baocode.dev>`；每处改动单独提交，账本单独提交；提交后 `git push origin design/ui-remodel`（动了 .github/workflows 才需要借 gh 凭据）。
- L-8 对比页（A-6）的「改前」图：A-2、A-3 的改前就是 `artifacts/ui-fix-2026-11-12/screens/home-r1.jpg`（第 1 轮改完菜图后的首页）；A-1 的改前要到旧工作区 `/Users/xx/.codex/worktrees/meal-journey-ui/家庭点菜小程序`（停在 cda20a7，旧规则按菜名仍会给红烧肉配错图）里截。动手改某一页之前先截一张留底。
- L-9 说「哪一块占了地方」之前先量：automation_evaluate 里用 `wx.createSelectorQuery().select(sel).boundingClientRect()` 包成 Promise 返回；默认机型 390×844，自定义底栏上沿约 y=745。滚动截图用 `wx.pageScrollTo({scrollTop, duration: 0})`，拍完滚回 0。
- L-10 模拟器探针：往页面塞数据用 automation_page_action 的 setData（会重画）；automation_evaluate 里调 `p.setData` 数据会变但画面可能不重画。evaluate 里别用 `fields({computedStyle})`，会超时，只用 boundingClientRect。不要为了测试真的提交心愿——后端会给家里人发通知。
- L-11 换图或占位图要把它出现的每种尺寸都看一遍（小图、详情顶上大图、首页大图）。要看「有数据」的页面：加今日菜单不发通知，可以用首页 `addToToday({detail:{id}})` 加、`require('utils/api').removeTodayMenuRecipe(id,'dinner')` 撤（evaluate 里 require 路径写 `utils/api`，不带 `./`）；许愿、喊开饭、社区互动会发通知，不拿来测。

