# Research: miniapp-full-test

## Practices
- **注册页烟测（主选）**：`app.json` 每个 path 打开一次，确认不是白屏/崩，主按钮点一下 | 用户要「所有东西」，页面清单是唯一可穷尽的范围
- **每张表单填完 + 真支付（弃）**：43 页里含支付/VIP/家庭邀请 | 会花钱、写脏数据、测不完
- **只跑 node/Maven 当验收（弃）**：用户要测的是小程序界面 | 单测过了仍可能白屏

Key references: 微信开发者工具 MCP https://developers.weixin.qq.com/miniprogram/dev/devtools/mcp.html

## Constraints
- 只用官方 `wechat-devtools`；`weapp-dev` 已删 | 再用旧包等于接回已拆掉的通道
- develop API 是 `http://localhost:9088`；上次手测首页 `loadError` | 厨房没起来时有数据页只能测失败态，setData 假装成功不算过
- 后端要本机 MySQL 8 + `cd server; ./mvnw spring-boot:run` | 库没开则 9088 起不来
- `app.json` 列了 43 个页面；`launch/splash` 等未注册页 navigateTo 会失败 | 未注册页不写进验收
- 无密码三登录：微信 / OTP / 游客；所谓注册改密前端收口到验证码 | 去找密码接口会测到不存在的能力
- 交付：改了 `dish-logic`/`recipe-steps` 须 `node test/*.test.js` EXIT=0；无 CI | 「不用单测」不能当改了工具函数的借口
- `spec/changes/ui-layout-bugs` 空目录被锁删不掉 | 若钩子按目录计数会误判双 change；该目录无 proposal
- 未扫：真机预览、体验版域名、生产支付 | 不把未跑环境写成已测

## Open [TBD]
（空——已 auto-triage）

## Decided
- [DEC-1] 范围= `app.json` 每个页面打开 + 主按钮点一次；不填完所有表单、不走完每条分支 | source [TBD-1] | escalated | 「所有东西」按注册页穷尽，不按每张表单穷尽 | if wrong: 把点名的深路径加进 What
- [DEC-2] 只修阻断：白屏、崩、点了去错页、看起来能点却没反应；其余只写 verify ledger | source [TBD-2] | escalated | 全量修等于再开设计档 | if wrong: 用户点名某条非阻断也修
- [DEC-3] 先试启 9088；起不来就测失败态/登录/法律页，不把 setData 假成功当通过 | source [TBD-3] | auto | 厨房挂着是环境，不是产品绿 | reversibility: 库起来后重跑有数据页
- [DEC-4] VIP/结账只打开页面；支付面板出现就取消，不真付钱 | source [TBD-4] | auto | 真支付不可逆 | reversibility: 另开沙箱支付档
- [DEC-5] 不测 showcase 像素 | source [TBD-5] | auto | 橱窗页不是点菜路径 | reversibility: 加一条打开即过
- [DEC-6] 证据写本 change 的 verify.md + 截图；不新造测试框架 | source [TBD-6] | auto | 学上一档 MCP 手测记录 | reversibility: 以后再加自动化套件
- [DEC-7] 只用官方 wechat-devtools | source [TBD-7] | decided from status quo: knowledge.md 2026-08-23
