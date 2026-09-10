# 家庭点菜小程序 · 端到端功能测试报告

- **日期**：2026-09-10
- **被测版本**：`master` @ 9f5d76e（含本轮全链路清理）
- **测试方式**：微信开发者工具自动化（`wechatide -c CodeBuddy` + `automator` skill），真实模拟器运行时
- **环境**：微信开发者工具 5.5.4 / 基础库 3.17.0 / AppID `wx2a5074fe4337e696`
  - 后端：Spring Boot 3.2.0（本机 9088，新构建 jar，19:51）
  - 数据库：MySQL 127.0.0.1:3306 `family_menu_daily_db`
  - 本机配置：`server/config/application.yml`（dev OTP 开启，验证码固定 246810）

---

## 一、结论

**功能整体健康。39 个页面全部可正常打开与渲染，关键交互流程全部通过，运行期 console 无 error / fail。**

- 页面冒烟：**39 / 39 通过**（31 主包 + 8 分包）
- 交互流程：**11 / 11 通过**
- console error / fail：**0 条**
- 发现的问题：1 条环境类（后端未启动，非代码缺陷）；2 条为测试工具限制（非应用缺陷）

---

## 二、页面冒烟（逐页打开 + 截图）

用 `simulator_open_page` 逐页编译打开并截图取证，全部 `success: true`。

| # | 页面 | 结果 | # | 页面 | 结果 |
|---|------|:---:|---|------|:---:|
| 1 | pages/home/index | ✅ | 21 | pages/family/members/index | ✅ |
| 2 | pages/recipes/index | ✅ | 22 | pages/family/invite/index | ✅ |
| 3 | pages/community/index | ✅ | 23 | pages/me/profile-edit/index | ✅ |
| 4 | pages/menu/index | ✅ | 24 | pages/me/settings/index | ✅ |
| 5 | pages/me/index | ✅ | 25 | pages/me/notifications/index | ✅ |
| 6 | pages/shopping/index | ✅ | 26 | pages/me/preference-profile/index | ✅ |
| 7 | pages/import/index | ✅ | 27 | pages/me/feedback/index | ✅ |
| 8 | pages/recipe-detail/index | ✅ | 28 | pages/me/help-faq/index | ✅ |
| 9 | pages/recipe-edit/index | ✅ | 29 | pages/me/about/index | ✅ |
| 10 | pages/weekly-menu/index | ✅ | 30 | pages/legal/terms/index | ✅ |
| 11 | pages/pantry/index | ✅ | 31 | pages/legal/privacy/index | ✅ |
| 12 | pages/recipes/search/index | ✅ | 32 | pkg-extra/community/post-detail/index | ✅ |
| 13 | pages/cook-mode/index | ✅ | 33 | pkg-extra/community/audit/index | ✅ |
| 14 | pages/cook-log/index | ✅ | 34 | pkg-extra/vip/index | ✅ |
| 15 | pages/auth/login/index | ✅ | 35 | pkg-extra/vip/upgrade/index | ✅ |
| 16 | pages/auth/login-phone/index | ✅ | 36 | pkg-extra/vip/orders/index | ✅ |
| 17 | pages/auth/verify-otp/index | ✅ | 37 | pkg-extra/payment/checkout/index | ✅ |
| 18 | pages/auth/wechat-auth/index | ✅ | 38 | pkg-extra/payment/success/index | ✅ |
| 19 | pages/family/create/index | ✅ | 39 | pkg-extra/favorites/index | ✅ |
| 20 | pages/family/join/index | ✅ | | | |

> 截图命名：`p<N>-<路径>.jpg`（N 与上表序号一致）。

---

## 三、交互流程测试

| # | 流程 | 操作 | 断言 | 结果 |
|---|------|------|------|:---:|
| 1 | Tab 切换 · 今日 | `switchTab /pages/home/index` | 当前页 = home | ✅ |
| 2 | Tab 切换 · 菜谱 | `switchTab /pages/recipes/index` | 当前页 = recipes | ✅ |
| 3 | Tab 切换 · 社区 | `switchTab /pages/community/index` | 当前页 = community | ✅ |
| 4 | Tab 切换 · 冰箱 | `switchTab /pages/pantry/index` | 当前页 = pantry | ✅ |
| 5 | Tab 切换 · 我的 | `switchTab /pages/me/index` | 当前页 = me | ✅ |
| 6 | 首页「换一道」 | tap `.mh-hero-shuffle` | hero 由 `101 紫菜蛋花汤` → `107 扬州炒饭` | ✅ |
| 7 | 首页「加到菜单」 | tap `.mh-hero-add` | `slotMenu` 新增菜品（牛肉炒西兰花等） | ✅ |
| 8 | 菜谱搜索 | input `.rx-search-input` = `番茄` | `searchText=番茄`，命中 1 条 | ✅ |
| 9 | 打开菜谱详情 | tap 首页 hero `.mh-hero-body` | 跳转 `pages/recipe-detail/index` | ✅ |
| 10 | 打开社区帖子 | tap `.pcard` | 跳转 `pkg-extra/community/post-detail/index` | ✅ |
| 11 | 许愿池全流程 | 展开 → `+我想吃` → 输入「想吃红烧肉」→ 确认 | `wishes=[{id:19,text:"想吃红烧肉"}]` | ✅ |
| 12 | 菜谱详情数据 | `navigateTo ...?id=101` | 返回完整 recipe（标题/食材/步骤齐全） | ✅ |
| 13 | 菜单视图切换 | `switchView` today → week | `view` 由 `today` → `week`，周视图渲染 4 天菜单 | ✅ |

**关键页面渲染核实**（人工看图）：
- 首页：hero + 时段 tab（早/午/晚/本周）+ 许愿池 + 「今天这一桌」菜单卡
- 菜谱页：17 道可点、搜索/来源筛选/点菜条件、底部今日备菜
- 社区：7 帖 / 85 评论 / 15 收藏 + 帖子流
- 冰箱：9 项在库、3 项临期提醒、按分类分组
- 我的：12 菜谱 / 17 本月做菜 / 1 成员 + 最近上桌
- 菜谱详情：食材清单与**冰箱库存联动**（「家里有 2/3」，缺料标「待买菜」并可一键加入买菜清单）

---

## 四、发现的问题

### P1 · 环境（非代码缺陷）
- **首次进入首页显示「连不上厨房了」**：因为后端未启动。启动 `server`（9088）后刷新即恢复。
  → 说明：这是预期行为，且**前端错误态 UI 正常**（有明确文案 + 「重新加载」按钮），符合设计。

### 测试工具限制（非应用缺陷）
- 自定义组件内部节点（如菜谱卡的 `.rc-card`）无法被页面级 selector 命中，需改用页面级元素（首页 hero）触发跳转 → 已验证跳转本身正常。
- CLI 的数组类参数需用 `--args-file`，`--args` 内联 JSON 不被接受 → 改用文件后 `switchView` 验证通过。

---

## 五、测试副作用（可清理）

本次为真实操作，在**本机开发用游客账号**留下：
- 许愿池新增 1 条：「想吃红烧肉」
- 今日菜单新增若干道菜（含「牛肉炒西兰花」）
- 首页 hero 轮换位置变化（已切换到 扬州炒饭）

均为开发数据（`app.seed-demo-data` 默认开启），不影响代码与仓库。

---

## 六、附录：运行方式

```bash
# 1) 后端（提前构建）
cd server && ../.tools/mvn.sh -q package -DskipTests
java -jar target/family-menu-daily-server-0.1.0-SNAPSHOT.jar     # 监听 9088

# 2) 开发者工具自动化（非沙箱）
cd "E:/rjd/微信开发者工具"
./wechatide.cmd -c CodeBuddy check_wechatide_status --skill-version 0.3.9
./wechatide.cmd -c CodeBuddy open_project_window --project "E:/cx/点菜小程序-家庭版"
./wechatide.cmd -c CodeBuddy simulator_screenshot --project "E:/cx/点菜小程序-家庭版" --path <out>.jpg
```
