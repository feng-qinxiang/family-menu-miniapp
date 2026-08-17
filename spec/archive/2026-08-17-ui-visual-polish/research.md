# Research: ui-visual-polish

## Practices
- 未做外部行业 web 调研：决策空间全在库内（token/组件/页面手写重复均已存在），修复=复用与收敛；外部设计系统不改变任何一项修法
- 库内可复用：recipe-card（favorites 已接）、section-head（me 已接）、state-sheet 滚动锁、app.wxss 字号标尺与 font-lg、nav-bar 33 页统一返回 | 全部已有生产实现，直接推广
- 前序变更 ui-ux-audit（2026-08-16 verify pass）已消化行为 critical：api reject、支付取消、邀请假码、操作防护、cook-mode 锁屏计时 | 本轮不再重复

## Constraints
- 字号散值仍重：raw `font-size: N rpx` ≈510 处 vs `var(--fs-*)` ≈304 处（采纳率约 37%）；集中页 import/community/home/me/vip | 违反后果：同级文案跨页不一致，大字模式只放大 token 引用处、静态 rpx 不动（app.wxss 已注明局限）
- 组件复用未落地：recipe-card 仅 1 页 json 引用（favorites）；home 手写 mh-rcard/mh-row、recipes 手写 rx-card；section-head 仅 me；另有 ≥14 页手写 `.shead` 同构结构 | 违反后果：改卡/标题样式要动 N 文件，漂移必然
- 状态组件半闲置：state-sheet 仅 community/members/pantry 3 页；state-loading 0 业务页引用；catchtouchmove 仅 home 许愿 + wechat-auth + 组件内置 | 违反后果：其余手写弹层仍可能滚动穿透
- theme.json light 与规范/暖色脱节：light.themePaper=#ffffff、themeMut=#8a8a85（冷灰），而 app.wxss fallback 与规范为 paper #fbf8f3 / mut #7a6e5d；规范文档仍写 `--r-card: 42rpx`，代码已是 16rpx | 违反后果：真机 darkmode 开时浅色主题偏冷白；文档误导后续改圆角
- 英文 eyebrow 残留：me 页 section-head 四处英文（Recently Cooked / Kitchen Tools / Taste Profile / Preference Profile）；join「Got an invite code?」、help-faq「Need a hand?/Still stuck?」、vip/upgrade「Family Sync · Premium」、preference-profile「Most Cooked · Top 5」、splash 品牌英文可保留 | 违反后果：与 warm「eyebrow 中文化」铁律冲突，杂志风完成度打折
- 字形符号当图标：me ★/☏、recipe-card ♥♡、post-detail ♥★、vip/upgrade ★、search ♥、favorites ♥、success ★ | 违反后果：iOS/Android 彩色 emoji 字形不一致
- 大字模式仅 7 页挂 fontScale（home/menu/me/settings/shopping/pantry/recipes）；其余二级页不受益 | 违反后果：设置开大字后大量页面仍小字
- 交付通道：`node test/dish-logic.test.js`（零依赖 assert）；无 CI；UI 项靠微信开发者工具手测/截图对照 smoke-all 基线 | 「通过」必须以该命令 EXIT=0 + 手测清单为准
- 范围铁律：本轮不新建 state-imgview、不重做 tab 信息架构、不动 server/忌口字段、不删 showcase | 违反后果：与 ui-ux-audit DEC-3/4 冲突，范围膨胀

## Open [TBD]
（空——全部进入 Decided）

## Decided
- [DEC-1] 本轮主轴 = recipe-card 推 home/recipes（分侧+手测门禁）+ section-head 仅四 tab/menu/shopping + 弹层只补 catchtouchmove（不默认迁 state-sheet）+ 文案/铁律快修 | source [TBD-1] | auto + 面板 r0 收窄 | 用户问「UI 怎么优化」的最大感知在卡/主题/文案；14 页 shead 全扫与 sheet 迁移被必要性面板否决 | 可逆：逐页 git revert
- [DEC-2] 字号：不在本轮做全库 510→token 机械替换；只做 (a) 规范/app 权威值对齐文档 (b) 被 recipe-card/section-head 迁移顺带吃掉的字号 (c) 主 tab 四页 + import 内 22/24rpx 辅文案升到 --fs-cap/--fs-mini | source [TBD-2] | auto | 全量替换 diff 巨大且易引入排版回归；大字模式局限已文档化，优先让新写法走 token | 可逆：单页还原
- [DEC-3] theme.json light 暖色回正（paper/paper2/ink/mut/line 对齐 app.wxss fallback / 规范暖奶油），dark 保留现有中性深色；docs/UI设计规范.md 订正 --r-card 16rpx、去掉过时 42rpx 描述 | source [TBD-3] | escalated | 用户可见浅色主题从冷白→暖奶油，属产品观感变化；if wrong: 改回 theme.json 单文件 | 可逆：theme.json + 规范 md
- [DEC-4] 英文 eyebrow 中文化范围 = me 四处 section-head + join/help-faq/vip-upgrade/preference-profile 可见英文；splash「FAMILY KITCHEN」与品牌名 VIP 保留 | source [TBD-4] | auto | warm 铁律明确 eyebrow 中文；品牌英文已定可留 | 可逆：文案回滚
- [DEC-5] 字形图标：功能触点（me 绑手机 ☏、VIP ★ 入口、收藏心形按钮）改 CSS/中文单字或既有 mh-ico 画法；评分星 ★ 与装饰心形可保留但统一 class（不扩新 emoji） | source [TBD-5] | auto | 全换 SVG 成本高；铁律针对「功能图标」 | 可逆：wxml 回滚
- [DEC-6] 大字模式：本轮不扩到全 43 页；仅保证四 tab + menu/shopping 已挂页在 onShow 读 font_scale（与 ui-ux-audit 一致），二级页跟随全局 page 类若 App 已设则不动结构 | source [TBD-6] | auto | 全页挂载是机械活、与视觉优化主轴正交，出范围 | 可逆：无
- [DEC-7] state-loading 不强制推广；数据页继续用页内骨架（已有模式）。state-sheet 只迁移「仍无 catchtouchmove 的业务弹层」（community 发帖/举报若未锁则迁或补锁） | source [TBD-7] | auto | loading 组件与页内骨架双轨无行为害；强推纯仪式 | 可逆：单页
- [DEC-8] showcase 保留；不做 GSAP/滚动视差新动效；不新建 share-card 页（分享继续 onShareAppMessage） | source [TBD-8] | auto | YAGNI，与 ui-ux-audit DEC-4 一致