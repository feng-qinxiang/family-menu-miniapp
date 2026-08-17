# Tasks: ui-visual-polish

> 方案本体见 proposal.md ## What

- [x] 1. recipe-card 扩展 + home/recipes 接入 + 删旧卡样式
- [x] 2. section-head 主路径（home/recipes/menu/pantry/shopping）+ me 英文 eyebrow 中文化
- [x] 2b. section-head 二级页全量（recipe-detail/import/weekly-menu/vip/cook-log/upgrade/members/community/preference-profile）
- [x] 3. 弹层滚动锁：业务弹层 state-sheet / home wish / wechat-auth 已带锁
- [x] 4. theme.json light 暖色回正 + UI设计规范 r-card 16rpx
- [x] 5. 文案/铁律：英文 eyebrow 中文化；功能字形改 CSS（评分装饰 ★ 保留）
- [x] 6. 回归：`node test/dish-logic.test.js` EXIT=0
  - [x] 6.1 静态契约：Grep 无 mh-rcard/rx-card 卡体、无 shead 手写、home/recipes 有 bind:tap/add；真机像素级手测仍建议开发者工具扫一眼