# 点菜小程序-家庭版 · UI 重设计进度快照

> 用途:会话压缩后快速接续。最后更新见 git/文件时间。

## 当前阶段
UI 演示设计**已全部完成并体检通过**(50 屏正式页,零报错/溢出/裂图/emoji)。
用户最新指令:**"演示还要调"** —— 但尚未指明具体页面/问题,等待用户给出"页名+问题"或截图。

## 设计方向(已定稿,勿改)
**精致美食杂志 + 大胆撞色**。标杆文件:`artifacts/home-final.html`。
- 配色:--paper:#fbf8f3奶油底 / --ink:#2c241b / --ink-deep:#3a2e23深棕 / --mut-strong:#7a6e5d(小字) / --gold-deep:#b08949 / --pop:#e8472a番茄红 / --pine:#2f4a3a墨绿 / --serif:Georgia
- 手法:深色大图hero+暖光叠层+底部渐变;镂空白描边标题(-webkit-text-stroke:1.6px #fff)+关键词.pop实心红;Georgia斜体英文eyebrow;卡片白底圆角+双层暖阴影(0 2px 6px rgba(60,40,20,.06),0 18px 40px rgba(120,70,30,.14));section标题左4px红竖线;hero右上超大半透明衬线背景数字;番茄红只点睛~4%
- 头像:文字+品牌色(张/我=红, 妈=金, 爸=绿--pine, 奶=深棕),禁img/avatar-*.jpg(会裂图)
- 导航铁律:仅4个主Tab页(home/recipes/menu/me)有底部TabBar;所有二级页用顶部返回nav(深棕圆按钮)
- 真实菜图:artifacts/img/ 下16张(mapo-tofu/tomato-egg/hongshao-pork/kungpao-chicken/long-beans/shrimp-peas/egg-drop-soup/sweet-sour-chicken/fried-rice/beef-broccoli/hot-sour-soup/chicken-congee/sichuan-eggplant/wontons/lo-mein/orange-chicken),禁外链/SVG画菜/emoji
- 标题两行排版注意行高(line-height过小会两行重叠压出横线;onboarding已修:line1/line2改display:block)

## 50屏正式页清单(artifacts/*.html,演示册 index.html 按7模块归档)
- 主流程13:home-final / recipes-final(含忌口自定义+加载更多+卡角标) / menu-final / me-final(VIP banner+数据徽章) / recipe-detail-final(份量步进+加入买菜清单闭环+写评价) / recipe-edit-final / cook-log-final(补卡+月份分组) / shopping-final / pantry-final / weekly-final / community-final(发帖FAB+热门话题+加载更多) / import-final(小红书复制文案导入) / vip-final
- 登录注册8:auth-final / auth-wxauth / auth-phone / auth-register / auth-otp / auth-reset / family-create / family-join
- 支付4:vip-confirm / pay-wechat(微信绿收银台) / pay-success / my-orders
- 功能子页8:search-result / post-detail / member-manage / member-invite / profile-edit / settings / notifications / my-favorites
- 合规5:legal-terms / legal-privacy / about / feedback / help-faq
- 扩展6:splash / onboarding / cook-mode / preference-profile / share-card / community-audit
- 弹窗状态6:state-dialog / state-loading / state-empty / state-toast / state-sheet / state-imgview

## 演示动效
GSAP 库在 artifacts/lib/(gsap.min.js+ScrollTrigger+gsap-motion.js),仅演示原型用。小程序落地时不能用GSAP(无DOM),需用原生动画(IntersectionObserver+WXSS keyframes+setData)按相同缓动1:1还原。

## 待办
1. (当前)等用户指明演示还要调哪些页/哪里
2. 旧稿待清理(用户未授权删除):artifacts里的 *-glass / *-redesign / home-warm-v2 / home-warmlight / home-immersive / home-magazine / sample-* 是被否的旧设计稿,留着干扰演示册,可问用户是否删
3. 用户确认演示OK后→落地微信小程序真实代码:app.wxss重写+50页wxml/wxss+custom-tab-bar+组件+真实图打包进项目(不依赖外链,微信需配download域名或走自己后端)+原生动效+接后端

## 后端事实(server/,Spring Boot,42接口/18表)
- 接口:auth(guest/login/me) / family / home/dashboard / recipes(+filter+detail+CRUD) / daily-menu / shopping-list / cook-history / community(posts/comments/favorite/report/reports审核) / import/preview / vip / weekly-menu / preference/profile / pantry(+match)
- "做过N次"真实可算(cook_history表COUNT);小红书导入是parser.js纯文本解析(识别xiaohongshu/xhslink链接但需复制文案,不自动爬取),用户确认保持"复制文案导入"不改后端
- 忌口筛选是本次UI新增,后端无avoid字段,落地需加 family_member.avoid_tags_json 列+接口

## 用户偏好(重要)
- 称呼"魔尊";中文回复;C盘空间铁律(临时文件放E:\rjd\Claudecode\temp\)
- 看图挑选>口头描述(用户说不清"好看",靠样张/截图选)。之前否决:牛皮纸复古手账风、玻璃拟态清新绿。最终从18种风格样张选定5号(精致Recipe)+8号(大胆撞色)融合
- 图片渲染在本会话读不出,验证靠playwright数值+MCP browser_evaluate+派有视觉能力的subagent看图
