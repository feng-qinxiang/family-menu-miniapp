# Index: exp-closure-r3

Requirement source: 用户消息，2026-08-22（第三轮全量设计复审：四子代理并行审计 架构/设计系统/交互/产品后端）

## Requirements
- R-1: "你看看我的整个设计还有啥需要改进的，还有ui，交互啥的" | source: 用户消息 2026-08-22（隐含口径：交付可拍板的改进提案；实施范围以 proposal ## What 为准）

## Assets
- A-1: pages/me/profile-edit（已实现、全库零入口） | use: reuse（me 页补入口）
- A-2: utils/api.js request/rawRequest（08-16 已 reject 化；toast 责任、timeout、baseURL 未收口） | use: extend
- A-3: assets/dishes 16 张 jpg 共 996KB | use: shrink（压缩）
- A-4: app.wxss 全局类 + state-dialog/state-empty/ad-banner/section-head/recipe-card 共享组件 | use: extend（token 化）
- A-5: 死码清单：launch/*（未注册）、verify-otp、register、reset-password、wechat-auth、me/favorites、community/audit（注册零入口）、behaviors/tab-select.js、components/empty-state | use: delete
- A-6: theme.json light/dark 双值 + app.json darkmode:true（消费链路断裂的惰性开关） | use: reject（锁浅色，见 escalated E1）

## Exemplars
- E-1: 08-16 激活的页面 loadError 态 → 本轮推广为「错误反馈唯一出口」，api 层默认静默
- E-2: home addItemSubmitting 防重守卫 → shopping addPantryEntry / community submitReport 补齐仿写
- E-3: state-dialog 删除确认模式 → weekly-menu「重排覆盖整周」确认复用
