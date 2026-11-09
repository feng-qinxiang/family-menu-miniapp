# UI 台账（生成物，勿手改）

生成命令：`node miniapp/test/ui-ledger.js`（零依赖，只读扫描，不改任何文件）

## 收敛主指标：还没进 token 表的裸值种数（越小越好，归零才算管住）

| 角色 | 四条主线 | 全站（含未归类） |
| --- | --- | --- |
| 图块尺寸 | 3 | 13 |
| 圆角 | 18 | 37 |
| 加载态 | 4 | 4 |
| 空态 | 2 | 3 |

已命名的规格：图块 13 个 token、圆角 8 个 token。这两个数**不该无脑涨**——每加一个 token 都要能说出它是哪个角色。

## 逐页读数

### 点菜

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/home` | --tile-row-sm / 30rpx / 56rpx | --r-card / --r-chip / --r-md / --r-pill / --r-sheet / --r-sm / --r-xs / 0 0 36rpx 36rpx / 12rpx / 2rpx / 3rpx / 40rpx / 50% / inherit | 骨架屏 | state-empty | 264 | 1 | 0 | 4 | — | — |
| `pages/menu` | --dish-thumb | --r-card / --r-pill / --r-sm / --r-xs | 骨架屏 | state-empty | 52 | 0 | 0 | 0 | — | — |
| `pages/recipes` | 28rpx | --r-card / --r-md / --r-pill / --r-sm / --r-xs / 26rpx / 38rpx / 50% | 骨架屏 | state-empty | 173 | 0 | 0 | 0 | — | — |
| `pages/shopping` | --tile-chip | --r-card / --r-pill / --r-sm / --r-xs / 12rpx / 18rpx / 50% | 骨架屏 | state-empty | 110 | 0 | 0 | 0 | — | — |
| `pkg-extra/favorites` | --tile-grid | --r-card / --r-sm / 12rpx / 50% / 6rpx | 骨架屏 | state-empty | 33 | 0 | 0 | 0 | — | — |
| `pkg-extra/recipes/search` | — | --r-card / --r-chip / --r-pill / --r-xs / 2rpx / 50% | state-loading | state-empty | 64 | 0 | 0 | 0 | — | — |
| `pkg-extra/weekly-menu` | --tile-row-sm | --r-card / --r-pill / --r-sm / --r-xs / 50% | state-loading | state-empty | 51 | 0 | 0 | 0 | — | — |

### 做菜

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pkg-extra/cook-log` | — | — | 无 | state-empty | 0 | 0 | 0 | 0 | — | — |
| `pkg-extra/cook-mode` | — | --r-card / --r-md / --r-pill / --r-sm / 2rpx / 4rpx / 50% / 6rpx | 手写 spinner | state-empty | 103 | 0 | 0 | 8 | — | — |
| `pkg-extra/kitchen` | — | --r-card / --r-pill / --r-sm / --r-xs / 50% | 手写 spinner | state-empty | 55 | 0 | 0 | 0 | — | — |
| `pkg-extra/recipe-detail` | --dish-thumb | --r-card / --r-chip / --r-md / --r-pill / --r-sm / 20rpx / 21rpx / 24rpx / 26rpx / 2rpx / 3rpx / 50% | 骨架屏 | state-empty | 165 | 0 | 0 | 5 | — | — |
| `pkg-extra/recipe-edit` | --ctl-x / --tap-min / --tile-pick | --r-card / --r-pill / 50% | state-loading | 无 | 99 | 0 | 0 | 0 | — | — |

### 社区

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/community` | --ava-cmt / --tile-img-pick / --tile-row-sm | --r-ava / --r-card / --r-pill / --r-sm / --r-xs / 0.2em 0.2em 0.2em 0.06em / 12rpx / 50% | 骨架屏 | state-empty | 114 | 0 | 0 | 7 | — | — |
| `pkg-extra/community/post-detail` | --ava-cmt / --ava-head / --tile-rc | --r-ava / --r-card / --r-md / --r-pill / --r-sm / 12rpx / 2rpx | 骨架屏 | state-empty | 86 | 0 | 0 | 1 | swiper-item | — |

### 冰箱

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/pantry` | --tile-list-wide | --r-card / --r-md / --r-sm / --r-xs / 50% 50% 45% 45% / 6rpx / 6rpx 6rpx 10rpx 10rpx | state-loading | state-empty | 101 | 0 | 0 | 0 | — | — |

### 未归类

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/cook-log` | — | --r-card / --r-sm / 50% | 骨架屏 | state-empty | 36 | 0 | 0 | 0 | — | — |
| `pages/me` | --ava-cmt / --dish-thumb / --tile-row-sm / 88rpx | --r-ava / --r-card / --r-md / --r-pill / --r-sm / 11rpx / 12rpx / 14rpx / 26rpx / 2rpx / 50% / 6rpx 6rpx 10rpx 10rpx | 骨架屏 | 自绘 | 116 | 0 | 0 | 0 | — | — |
| `pkg-extra/auth/login` | — | --r-card / --r-sheet / --r-xs / 12rpx / 25rpx | 无 | 无 | 63 | 0 | 0 | 0 | — | — |
| `pkg-extra/auth/login-phone` | — | --r-card / --r-sm / --r-xs / 2rpx / 50% / 6rpx / 7rpx | 无 | 无 | 80 | 0 | 0 | 8 | — | — |
| `pkg-extra/family/create` | 104rpx / 40rpx / 56rpx | --r-card / --r-md / --r-sm / --r-xs / 0 0 4rpx 4rpx / 2rpx / 4rpx 0 0 0 / 4rpx 4rpx 0 0 / 50% / 50% 50% 50% 0 | 无 | 无 | 96 | 0 | 0 | 6 | — | — |
| `pkg-extra/family/invite` | — | --r-card / --r-xs / 23rpx | 无 | 无 | 46 | 0 | 0 | 2 | — | — |
| `pkg-extra/family/join` | --ava-cmt / 116rpx / 46rpx | --r-ava / --r-card / --r-md / --r-xs / 2rpx / 50% | 无 | state-empty | 90 | 0 | 0 | 0 | — | — |
| `pkg-extra/family/members` | — | --r-pill / --r-sm / --r-xs / 0 0 7rpx 7rpx / 2rpx / 50% | 无 | state-empty | 70 | 0 | 0 | 0 | — | — |
| `pkg-extra/import` | --tile-row-sm / 160rpx / 200rpx / 36rpx / 40rpx / 88rpx | --r-card / --r-md / --r-pill / --r-sm / --r-xs / 20rpx / 50% / 6rpx 6rpx 14rpx 14rpx | 无 | 自绘 | 119 | 0 | 0 | 6 | — | — |
| `pkg-extra/legal/deletion` | — | — | 无 | 无 | 0 | 0 | 0 | 0 | — | — |
| `pkg-extra/legal/privacy` | — | --r-pill / --r-sm / 18rpx 18rpx 0 0 / 4rpx / 50% / 6rpx | 无 | 无 | 74 | 0 | 0 | 10 | — | — |
| `pkg-extra/legal/terms` | — | --r-card / 2rpx / 50% / 5rpx | 无 | 无 | 45 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/about` | — | --r-card / --r-md / --r-pill / --r-xs / 26rpx / 50% / 58rpx | 无 | 无 | 72 | 0 | 0 | 1 | — | — |
| `pkg-extra/me/feedback` | 162rpx / 56rpx / 88rpx | --r-card / --r-pill / --r-sm / --r-xs / 2rpx / 3rpx / 50% / 5rpx | 无 | 自绘 | 80 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/help-faq` | — | --r-card / --r-xs / 50% | 无 | 无 | 50 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/notifications` | --tile-chip / 40rpx | --r-card / --r-md / --r-sheet / --r-sm / --r-xs / 50% | 无 | state-empty | 77 | 0 | 0 | 17 | — | — |
| `pkg-extra/me/preference-profile` | — | --r-card / --r-chip / --r-md / --r-sm / 50% | 骨架屏 | state-empty | 55 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/profile-edit` | --ava-hero / 208rpx | --r-ava / --r-pill / 50% / 6rpx | 无 | 无 | 59 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/settings` | — | --r-card / --r-md / --r-pill / 2rpx / 50% | 无 | 无 | 32 | 0 | 0 | 0 | — | — |
| `pkg-extra/payment/checkout` | — | --r-card / --r-md / --r-xs | 无 | 无 | 28 | 0 | 0 | 0 | — | — |
| `pkg-extra/payment/success` | — | --r-pill / 50% | 无 | 无 | 38 | 0 | 0 | 0 | — | — |
| `pkg-extra/vip` | — | --r-card / --r-pill / 18rpx / 22rpx / 50% | 无 | 无 | 57 | 0 | 0 | 0 | — | — |
| `pkg-extra/vip/orders` | — | --r-md / --r-pill / 12rpx / 22rpx / 4rpx / 50% | 骨架屏 | state-empty | 78 | 0 | 0 | 1 | — | — |
| `pkg-extra/vip/upgrade` | — | --r-card / --r-pill / --r-sm / 50% / 6rpx | 手写 spinner | 无 | 85 | 0 | 0 | 0 | — | — |
| `components/ad-banner` | — | --r-md / --r-pill / 50% | 无 | 无 | 20 | 0 | 0 | 0 | — | — |
| `components/back-top` | — | 2rpx / 50% | 无 | 无 | 10 | 0 | 0 | 0 | — | — |
| `components/nav-bar` | — | 2rpx / 50% | 无 | 无 | 15 | 0 | 0 | 0 | — | — |
| `components/recipe-card` | --dish-thumb / --tile-list-wide | --r-card / --r-md / --r-pill / --r-sm / --r-xs / 50% | 无 | 无 | 79 | 0 | 0 | 0 | — | — |
| `components/section-head` | — | — | 无 | 无 | 4 | 0 | 0 | 0 | — | — |
| `components/state-dialog` | — | --r-card / 40rpx / 50% | 无 | 无 | 26 | 0 | 0 | 2 | — | — |
| `components/state-empty` | — | --r-card / 50% | 无 | 自绘 | 25 | 0 | 0 | 0 | — | — |
| `components/state-loading` | — | --r-card / 50% | 手写 spinner | 无 | 5 | 0 | 0 | 0 | — | — |
| `components/state-sheet` | — | --r-pill / --r-sheet | 无 | 无 | 8 | 0 | 0 | 0 | — | — |
| `components/state-toast` | — | --r-md / --r-pill / 0 0 6rpx 6rpx / 36rpx / 3rpx / 48rpx / 50% | 无 | 无 | 80 | 0 | 0 | 3 | — | — |
| `custom-tab-bar` | — | 0 0 var(--tb-radius) var(--tb-radius) | 无 | 无 | 13 | 0 | 0 | 0 | — | — |

## 已接受的债务（不是待办）

- 全站裸 rpx 共 **3301** 处。本轮**不做 `--sp-*` 全量替换**：现有 spacing token 只有 6 档，而各页众数值（20/28/36rpx 等）压根没有对应 token，全量替换等于在零视觉断言的 CI 下重做 1.3 万行样式——与当初放弃 `--fs-*` 改名同形。**只在某一轮已经要改那个块时顺手用 token**。
- 裸 px 1 处：px 在小程序里不随屏宽缩放，出现即应逐个确认（不是批量替换对象）。
