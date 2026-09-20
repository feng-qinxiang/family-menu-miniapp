# UI 台账（生成物，勿手改）

生成命令：`node miniapp/test/ui-ledger.js`（零依赖，只读扫描，不改任何文件）

## 收敛主指标：还没进 token 表的裸值种数（越小越好，归零才算管住）

| 角色 | 四条主线 | 全站（含未归类） |
| --- | --- | --- |
| 图块尺寸 | 4 | 16 |
| 圆角 | 32 | 54 |
| 加载态 | 3 | 4 |
| 空态 | 2 | 3 |

已命名的规格：图块 10 个 token、圆角 10 个 token。这两个数**不该无脑涨**——每加一个 token 都要能说出它是哪个角色。

## 逐页读数

### 点菜

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/home` | — | --r-card / --r-chip / --r-md / --r-pill / --r-sheet / 0 0 36rpx 36rpx / 12rpx / 20rpx / 28rpx / 2rpx / 3rpx / 40rpx / 44rpx / 4rpx / 50% | 骨架屏 | state-empty | 243 | 1 | 0 | 4 | — | — |
| `pages/menu` | --dish-thumb | --r-card / --r-chip / --r-lg / --r-md / --r-pill / --r-sheet / --r-xl / --r-xs / 0 0 14rpx 14rpx / 12rpx / 14rpx 14rpx 0 0 / 25rpx / 50% / 6rpx | 骨架屏 | state-empty | 183 | 0 | 0 | 6 | — | — |
| `pages/recipes` | — | --r-card / --r-chip / --r-md / --r-pill / --r-sheet / --r-sm / --r-xs / 26rpx / 34rpx / 38rpx / 50% | 骨架屏 | state-empty | 111 | 1 | 0 | 0 | — | — |
| `pages/shopping` | --tile-chip | --r-card / --r-md / --r-pill / --r-sheet / --r-sm / --r-xs / 12rpx / 18rpx / 22rpx / 50% | 骨架屏 | state-empty | 121 | 0 | 0 | 0 | — | — |
| `pkg-extra/favorites` | --tile-grid | --r-card / --r-md / 12rpx / 50% / 6rpx | 骨架屏 | state-empty | 36 | 0 | 0 | 0 | — | — |
| `pkg-extra/recipes/search` | — | --r-card / --r-chip / --r-xs / 2rpx / 4rpx / 50% | state-loading | state-empty | 60 | 0 | 0 | 4 | — | — |
| `pkg-extra/weekly-menu` | --tile-row-sm | --r-card / --r-pill / --r-sheet / --r-xs / 25rpx / 28rpx / 4rpx / 50% | state-loading | state-empty | 75 | 0 | 0 | 0 | — | — |

### 做菜

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pkg-extra/cook-log` | --dish-thumb | --r-card / --r-md / --r-pill / --r-sheet / --r-sm / --r-xs / 10rpx / 20rpx / 50% | 骨架屏 | state-empty | 91 | 0 | 0 | 0 | — | — |
| `pkg-extra/cook-mode` | — | --r-pill / 2rpx / 32rpx / 38rpx / 3rpx / 44rpx / 46rpx / 4rpx / 50% / 6rpx | 手写 spinner | state-empty | 132 | 0 | 0 | 15 | — | — |
| `pkg-extra/kitchen` | --tile-cover | --r-card / --r-pill / 0 0 14rpx 0 / 14rpx / 50% | 手写 spinner | state-empty | 52 | 0 | 0 | 0 | — | — |
| `pkg-extra/recipe-detail` | — | --r-chip / --r-md / --r-pill / --r-sheet / --r-sm / --r-xs / 20rpx / 21rpx / 24rpx / 26rpx / 28rpx / 2rpx / 3rpx / 50% | 骨架屏 | state-empty | 163 | 0 | 0 | 5 | — | — |
| `pkg-extra/recipe-edit` | --tile-pick / 48rpx / 88rpx | --r-card / --r-pill / 50% | state-loading | 无 | 93 | 0 | 0 | 0 | — | — |

### 社区

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/community` | --ava-row / --tile-row-sm / 132rpx | --r-ava / --r-card / --r-chip / --r-pill / --r-sheet / --r-xs / 0.2em 0.2em 0.2em 0.06em / 12rpx / 20rpx / 22rpx / 26rpx / 28rpx / 4rpx / 50% | 骨架屏 | state-empty | 155 | 0 | 0 | 10 | — | — |
| `pkg-extra/community/post-detail` | --ava-cmt / --ava-head / 138rpx | --r-ava / --r-card / --r-chip / --r-pill / 12rpx / 14rpx / 26rpx / 2rpx / 50% | 骨架屏 | state-empty | 88 | 0 | 0 | 7 | — | — |

### 冰箱

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/pantry` | — | --r-card / --r-md / --r-sheet / --r-sm / --r-xs / 19rpx / 23rpx / 27rpx / 2rpx / 34rpx / 38rpx / 3rpx / 50% / 50% 50% 45% 45% / 6rpx / 6rpx 6rpx 10rpx 10rpx | state-loading | state-empty | 101 | 0 | 0 | 0 | — | — |

### 未归类

| 页面 | 图块尺寸 | 圆角取值 | 加载态 | 空态 | 裸 rpx | 裸 px | emoji | CSS 图标 | 未声明组件 | 置了没人读的状态位 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| `pages/me` | --ava-row / --tile-row-sm | --r-ava / --r-card / --r-chip / --r-lg / --r-md / --r-pill / --r-sheet / --r-xs / 11rpx / 12rpx / 14rpx / 26rpx / 2rpx / 50% / 6rpx 6rpx 10rpx 10rpx | 骨架屏 | 自绘 | 123 | 0 | 0 | 0 | — | — |
| `pkg-extra/auth/login` | — | --r-sheet / --r-xs / 12rpx / 25rpx / 35rpx | 无 | 无 | 65 | 0 | 0 | 0 | — | — |
| `pkg-extra/auth/login-phone` | — | --r-md / --r-sm / --r-xs / 2rpx / 50% / 6rpx / 7rpx | 无 | 无 | 79 | 0 | 0 | 8 | — | — |
| `pkg-extra/family/create` | 200rpx / 62rpx / 73rpx | --r-sheet / --r-sm / --r-xs / 0 0 4rpx 4rpx / 2rpx / 4rpx 0 0 0 / 4rpx 4rpx 0 0 / 50% / 50% 50% 50% 0 / 62rpx | 无 | 无 | 106 | 0 | 0 | 6 | — | — |
| `pkg-extra/family/invite` | — | --r-pill / --r-xs / 23rpx / 2rpx / 31rpx / 35rpx / 4rpx / 50% / 54rpx / 6rpx | 无 | 无 | 76 | 0 | 0 | 3 | — | — |
| `pkg-extra/family/join` | --ava-cmt / 116rpx / 46rpx | --r-ava / --r-md / --r-xs / 2rpx / 50% | 无 | state-empty | 90 | 0 | 0 | 0 | — | — |
| `pkg-extra/family/members` | — | --r-pill / --r-sm / --r-xs / 0 0 7rpx 7rpx / 2rpx / 50% | 无 | state-empty | 82 | 0 | 0 | 0 | — | — |
| `pkg-extra/import` | --tile-row-sm / 160rpx / 200rpx / 36rpx / 40rpx / 88rpx | --r-card / --r-md / --r-pill / --r-sheet / --r-sm / --r-xs / 18rpx / 20rpx / 22rpx / 26rpx / 28rpx / 50% / 6rpx / 6rpx 6rpx 14rpx 14rpx | 无 | 自绘 | 171 | 0 | 0 | 9 | — | — |
| `pkg-extra/legal/privacy` | — | --r-pill / --r-sm / 18rpx 18rpx 0 0 / 4rpx / 50% / 6rpx | 无 | 无 | 74 | 0 | 0 | 10 | — | — |
| `pkg-extra/legal/terms` | — | --r-pill / 2rpx / 50% / 5rpx | 无 | 无 | 44 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/about` | — | --r-card / --r-md / --r-pill / --r-xs / 26rpx / 50% / 58rpx | 无 | 无 | 73 | 0 | 0 | 1 | — | — |
| `pkg-extra/me/feedback` | 162rpx / 56rpx / 88rpx | --r-card / --r-md / --r-pill / --r-sm / --r-xs / 12rpx / 2rpx / 3rpx / 50% / 5rpx | 无 | 自绘 | 88 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/help-faq` | — | --r-chip / --r-md / 12rpx 12rpx 12rpx 4rpx / 4rpx / 50% | 无 | 无 | 59 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/notifications` | --tile-chip | --r-card / --r-md / --r-pill / --r-sheet / --r-sm / --r-xs / 0 6rpx 6rpx 0 / 50% | 无 | state-empty | 85 | 0 | 0 | 14 | — | — |
| `pkg-extra/me/preference-profile` | — | --r-card / --r-chip / --r-md / --r-sm / 50% | 骨架屏 | state-empty | 55 | 0 | 0 | 0 | — | — |
| `pkg-extra/me/profile-edit` | --ava-hero / 208rpx | --r-ava / --r-pill / --r-xs / 22rpx / 50% / 6rpx | 无 | 无 | 63 | 0 | 0 | 1 | — | — |
| `pkg-extra/me/settings` | — | --r-card / --r-md / --r-pill / 2rpx / 50% | 无 | 无 | 34 | 0 | 0 | 0 | — | — |
| `pkg-extra/payment/checkout` | — | --r-chip / --r-sm / 50% / 6rpx 6rpx 0 0 | 无 | 无 | 62 | 0 | 0 | 0 | — | — |
| `pkg-extra/payment/success` | — | --r-pill / 50% | 无 | 无 | 37 | 0 | 0 | 0 | — | — |
| `pkg-extra/vip` | — | --r-card / --r-pill / --r-sheet / --r-xs / 18rpx / 22rpx / 50% | 无 | 无 | 76 | 1 | 0 | 0 | — | — |
| `pkg-extra/vip/orders` | 50rpx | --r-md / --r-pill / 12rpx / 22rpx / 50% | 骨架屏 | state-empty | 68 | 0 | 0 | 2 | — | — |
| `pkg-extra/vip/upgrade` | — | --r-card / --r-md / --r-pill / --r-sm / 50% / 6rpx | 手写 spinner | 无 | 87 | 0 | 0 | 0 | — | — |
| `components/ad-banner` | — | --r-md / --r-pill / 50% | 无 | 无 | 20 | 0 | 0 | 0 | — | — |
| `components/back-top` | — | 2rpx / 50% | 无 | 无 | 10 | 0 | 0 | 0 | — | — |
| `components/nav-bar` | — | 2rpx / 50% | 无 | 无 | 15 | 0 | 0 | 0 | — | — |
| `components/recipe-card` | --dish-thumb | --r-card / --r-md / --r-pill / --r-xs / 50% | 无 | 无 | 60 | 0 | 0 | 0 | — | — |
| `components/section-head` | — | — | 无 | 无 | 4 | 0 | 0 | 0 | — | — |
| `components/state-dialog` | — | 28rpx / 40rpx / 50% | 无 | 无 | 27 | 0 | 0 | 2 | — | — |
| `components/state-empty` | — | --r-pill / 50% | 无 | 自绘 | 17 | 0 | 0 | 0 | — | — |
| `components/state-loading` | — | --r-card / 50% | 手写 spinner | 无 | 5 | 0 | 0 | 0 | — | — |
| `components/state-sheet` | — | --r-pill / --r-sheet | 无 | 无 | 8 | 0 | 0 | 0 | — | — |
| `components/state-toast` | — | --r-md / --r-pill / 0 0 6rpx 6rpx / 36rpx / 3rpx / 48rpx / 50% | 无 | 无 | 80 | 0 | 0 | 3 | — | — |
| `custom-tab-bar` | — | 0 0 var(--tb-radius) var(--tb-radius) | 无 | 无 | 13 | 0 | 0 | 0 | — | — |

## 已接受的债务（不是待办）

- 全站裸 rpx 共 **3660** 处。本轮**不做 `--sp-*` 全量替换**：现有 spacing token 只有 6 档，而各页众数值（20/28/36rpx 等）压根没有对应 token，全量替换等于在零视觉断言的 CI 下重做 1.3 万行样式——与当初放弃 `--fs-*` 改名同形。**只在某一轮已经要改那个块时顺手用 token**。
- 裸 px 3 处：px 在小程序里不随屏宽缩放，出现即应逐个确认（不是批量替换对象）。
