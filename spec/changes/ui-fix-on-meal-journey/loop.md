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
- [ ] A-2 首页第一屏能看到菜 (verify: 模拟器默认机型打开首页不滑动截图，「家里常做的菜」下至少露出完整一排菜的图和名字)
- [ ] A-3 「家人心愿」卡变矮 (verify: 没人许愿时该卡只占一行、高度不超过改前的一半——改前改后各量一次 boundingClientRect；点「+ 我想吃」仍能打开许愿输入)
- [ ] A-4 其余页面过一遍 (verify: 做菜、记录、社区、我的、菜谱详情、做菜步骤、买菜清单、冰箱的截图存到 artifacts/ui-fix-2026-11-12/screens/；artifacts/ui-fix-2026-11-12/findings.md 列出发现的明显毛病，每条标「已修」或「留给用户定」，已修的有改后截图)
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

## Lessons

- L-1 内置菜图的文件名和照片内容对不上的有三张（hongshao-pork / orange-chicken / sweet-sour-chicken），判断「图对不对」要看图不能看文件名；对照页：`node artifacts/ui-fix-2026-11-12/build-dish-check.js` 后用无头 Chrome 截图。
- L-2 改取图逻辑先 grep `LOCAL_DISHES|localPath\(|fallbackDishImg`，页面里有各自的私货。
- L-3 环境：真 Node 在 `~/.local/opt/node22/bin`（`export PATH="$HOME/.local/opt/node22/bin:/usr/bin:/bin"`）；本机 `grep` 是 ugrep，复杂正则用 `/usr/bin/grep`；zsh 里 `$b:path` 会被当修饰符，写 `"${b}:path"`；shell 的当前目录会漂，每条命令先 `cd /Users/xx/cx/家庭点菜小程序`。
- L-4 模拟器：`--project` 传仓库根目录 `/Users/xx/cx/家庭点菜小程序`；截图前 `open -g -a /Applications/wechatwebdevtools.app`；截图用 Read 看（图会跟在后面一条消息里）；页面数据用 automation_evaluate 读 `getCurrentPages().slice(-1)[0].data`。
- L-5 本机后端：`bash server/dev-server.sh stop|start`（口令自己从钥匙串取，start 前 PATH 要带 /usr/sbin）；现在是从主工作区起的，data.sql 每次启动都会跑。
- L-6 `artifacts/**/*.png|jpg` 被 .gitignore 挡着，截图只留本机；对比页 compare.html 引用本机截图即可。
- L-7 提交信息结尾带 `Co-Authored-By: BaoCode <noreply@baocode.dev>`；每处改动单独提交，账本单独提交；提交后 `git push origin design/ui-remodel`（动了 .github/workflows 才需要借 gh 凭据）。
- L-8 对比页（A-6）的「改前」图：A-2、A-3 的改前就是 `artifacts/ui-fix-2026-11-12/screens/home-r1.jpg`（第 1 轮改完菜图后的首页）；A-1 的改前要到旧工作区 `/Users/xx/.codex/worktrees/meal-journey-ui/家庭点菜小程序`（停在 cda20a7，旧规则按菜名仍会给红烧肉配错图）里截。动手改某一页之前先截一张留底。
