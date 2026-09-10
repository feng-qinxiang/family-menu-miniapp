/**
 * TabBar 的唯一数据源。
 *
 * 为什么单独抽出来：app.json 的 tabBar.list 必须静态声明（微信要求，不能按开关动态生成），
 * 而自定义 tabBar 组件需要按 features 开关决定渲染几项 —— 同一份 tab 曾经写在两个地方，
 * 一旦只改了一边就会「组件里有这个 tab、app.json 里没有它」，或者索引错位。
 *
 * 约定：
 *  - ALL_TABS 必须与 app.json 的 tabBar.list 完全一致（顺序、路径、数量）。
 *    这个一致性由 miniapp/test/static-check.js 自动校验，改一边不改另一边会直接报错。
 *  - 运行时渲染用 visibleTabs()，它只影响「显示几项」，不改变 app.json 的声明。
 */
const features = require('./features');

const ALL_TABS = [
  {
    pagePath: '/pages/home/index',
    text: '今日',
    icon: '/assets/icons/tab-home.svg',
    activeIcon: '/assets/icons/tab-home-active.svg'
  },
  {
    pagePath: '/pages/recipes/index',
    text: '菜谱',
    icon: '/assets/icons/tab-recipe.svg',
    activeIcon: '/assets/icons/tab-recipe-active.svg'
  },
  {
    pagePath: '/pages/community/index',
    text: '社区',
    icon: '/assets/icons/tab-community.svg',
    activeIcon: '/assets/icons/tab-community-active.svg',
    // 社区受资质/运营开关控制：关闭时只是不渲染，app.json 里仍然要声明
    feature: 'COMMUNITY'
  },
  {
    pagePath: '/pages/pantry/index',
    text: '冰箱',
    icon: '/assets/icons/tab-fridge.svg',
    activeIcon: '/assets/icons/tab-fridge-active.svg'
  },
  {
    pagePath: '/pages/me/index',
    text: '我的',
    icon: '/assets/icons/tab-profile.svg',
    activeIcon: '/assets/icons/tab-profile-active.svg'
  }
];

/** 当前开关下应该渲染的 tab。 */
function visibleTabs() {
  return ALL_TABS.filter((tab) => !tab.feature || features[tab.feature]);
}

module.exports = {
  ALL_TABS,
  visibleTabs
};
