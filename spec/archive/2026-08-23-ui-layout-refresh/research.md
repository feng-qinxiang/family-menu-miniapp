# Research: ui-layout-refresh

## Practices
- **偷模式 + 自有 token（主选）**：下厨房式食物卡密度/暖纸；Linear 式层级与错误态文案结构；Stripe 式间距阶梯（8/12/16/24 逻辑 rpx 化）。零依赖，不打杂志品牌 | 适用：已有 recipe-card/section-head/state-* 的项目
- **Vant Weapp 精选**：`@vant/weapp` 原生 npm，可摘 empty/loading/toast | 整库默认电商蓝打暖色；主包体积；构建 npm 成本 | https://vant-ui.github.io/vant-weapp/ https://github.com/youzan/vant-weapp
- **TDesign 小程序**：`tdesign-miniprogram` 系统感强 | 企业风皮肤 remap 成本高 | https://tdesign.tencent.com/miniprogram/overview https://github.com/Tencent/tdesign-miniprogram
- **WeUI extendedLib**：官方弹层/msg，可不计主包 | 视觉过「微信灰」，作隐藏基建即可 | https://wechat-miniprogram.github.io/weui/docs/quickstart.html
- **ColorUI**：布局 class 灵感 | 高饱和全局 CSS 污染暖色板，禁止整库 import | https://github.com/weilanwl/ColorUI
- **NutUI**：Vue/Taro 生态，**非**原生 wxml 整库 | 仅视觉参考 | https://nutui.jd.com/

Key references: 下厨房 m https://m.xiachufang.com/ · Linear https://linear.app/ · Stripe style https://docs.stripe.com/stripe-apps/style · 分包体积 https://developers.weixin.qq.com/miniprogram/dev/framework/subpackages.html · npm 构建 https://developers.weixin.qq.com/miniprogram/dev/devtools/npm.html · custom-tab-bar https://developers.weixin.qq.com/miniprogram/dev/framework/ability/custom-tab-bar.html

## Constraints
- 原生 wxml/wxss + 已有暖奶油 token（#fbf8f3 / #e8472a / #2c241b）；整库默认皮必撞品牌 | 违反：视觉回退成电商/企业灰
- 主包 ≤2M；tab 页必须在主包；已有 custom-tab-bar | 违反：体积爆或 tab 双实例
- 截图实证：错误态 bowl+spin 像「加载中」非失败；section-head `.arrow-line` 双斜线在真机像 ×；错误与下方内容同屏导致「空一半」；餐次 chip 与「本周」语义混排 | 违反：继续显得廉价/难用
- knowledge：section-head / recipe-card / theme light 已定；功能图标禁 emoji | 违反：与上轮归档冲突
- 交付：`node test/dish-logic.test.js` EXIT=0；UI 靠开发者工具截图对照

## Open [TBD]
（空——全部 Decided）

## Decided
- [DEC-1] **不引入** Vant/TDesign/WeUI/ColorUI 整库；本轮零新 npm 依赖 | source [TBD-1] | auto | 偷模式性价比最高；整库换肤与杂志暖色+主包冲突 | 可逆：日后可 cherry-pick
- [DEC-2] 本轮范围 = **错误态去 spin + section-head 箭头 + 冷启动失败全屏**；成功路径密度包出范围（面板 N1） | source [TBD-2] | auto + 面板 r0 | 截图实证两痛点；品味间距另开 | 可逆
- [DEC-3] 错误态：只改 mh-load-error 去无限 spin + 静态图示；不接入 state-empty、不做插画体系（N3） | source [TBD-3] | auto + 面板 r0 | 最小修复对准「失败像加载」 | 可逆
- [DEC-4] section-head 箭头：只改几何，保留 seeall/tapmore 契约（RC-3） | source [TBD-4] | auto | 截图「全部×」 | 可逆
- [DEC-5] 仅 `loadError && !hasHomeData` 时藏 slot/wish/sheet；有缓存的刷新失败保留结构（N2/RC-1）；条件不用 !loading（RC-2） | source [TBD-5] | escalated + 面板 r0 | 冷启动全屏错误；软失败不摘许愿 | if wrong: 去掉藏内容条件
- [DEC-6] chip/许愿/shead 成功路径密度：**本轮不做**（N1 cut） | source [TBD-6] | auto + 面板 r0 | 无失败证据的品味项 | 可逆：无