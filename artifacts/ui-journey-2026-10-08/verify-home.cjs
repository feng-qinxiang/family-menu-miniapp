// Run after compiling the real home page; temporary Page data is restored after verification.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const evidence = { checkedAt: new Date().toISOString(), dataSource: 'temporary Page data', screens: [], routes: [], interactions: [], layouts: [] };
function cli(tool, args = []) {
  const run = spawnSync('/usr/local/bin/wechatide', ['-c', 'Codex', tool, '--project', root, ...args], { encoding: 'utf8', timeout: 55000 });
  const result = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
  assert.equal(run.status, 0, `${tool}: ${result.message || result.errorType || 'nonzero exit'}`);
  assert.equal(result.ok, true, `${tool}: ${result.message || result.errorType || 'failed'}`);
  return result.result;
}
const data = () => cli('automation_page_action', ['--action', 'getData']).data;
const patch = (value) => cli('automation_page_action', ['--action', 'setData', '--patch', JSON.stringify(value)]);
const update = () => cli('automation_page_action', ['--action', 'callMethod', '--method', 'updateSlotMenu']);
const tap = (selector) => cli('automation_element_action', ['--action', 'tap', '--selector', selector, '--wait-for-selector', selector]);
const scroll = (top) => cli('automation_viewport_action', ['--action', 'pageScrollTo', '--scroll-top', String(top)]);
const home = () => cli('automation_navigate', ['--action', 'switchTab', '--url', '/pages/home/index']);
function bounds(selector) {
  const { width, height } = cli('automation_element_action', ['--action', 'size', '--selector', selector]);
  const { left, top } = cli('automation_element_action', ['--action', 'offset', '--selector', selector]);
  return { width, height, left, top };
}
function focus(selector) {
  scroll(0);
  const { top } = cli('automation_element_action', ['--action', 'offset', '--selector', selector]);
  scroll(Math.max(0, top - 104));
}
function checkWishActions(state) {
  const row = bounds('.fp-wish-item');
  const copy = bounds('.fp-wish-item-copy');
  const meta = bounds('.fp-wish-item-meta');
  const by = bounds('.fp-wish-by');
  const pending = bounds('.fp-wish-pending');
  const more = bounds('.fp-wish-more[data-id="layout-long"]');
  assert.ok(copy.width >= row.width * 0.85, 'Wish text uses a full row above the actions');
  assert.ok(more.width >= 44 && more.height >= 44, 'Wish overflow action has a finger-sized target');
  assert.ok(copy.top + copy.height <= meta.top + 1, 'Wish title stays above its metadata and actions');
  assert.ok(by.width > 0 && by.left + by.width <= pending.left + 1 && pending.left + pending.width <= more.left + 1, 'Wish metadata and action targets do not overlap');
  assert.ok(more.left + more.width <= row.left + row.width, 'More remains inside its card');
  evidence.layouts.push({ state, row, copy, meta, by, pending, more, result: 'PASS' });
}
function checkMenuLayout(state) {
  const actions = bounds('.hm-menu-actions');
  const list = bounds('.hm-menu-list');
  const firstRow = bounds('.hm-menu-row');
  const primary = bounds('.hm-menu-action-primary');
  const secondary = bounds('.hm-menu-action-secondary');
  assert.ok(actions.top + actions.height < list.top && list.top <= firstRow.top, 'Cooking and shopping actions appear before the dish list');
  assert.ok(primary.height >= 44 && secondary.height >= 44 && secondary.left + secondary.width <= primary.left, 'Menu actions retain separate finger-sized targets');
  evidence.layouts.push({ state, actions, list, firstRow, primary, secondary, result: 'PASS' });
}
function capture(name) {
  const file = `home-updated-${name}.jpg`;
  const result = cli('simulator_screenshot', ['--wait-for-selector', '.hm-journey', '--wait', '0.4', '--path', path.join(__dirname, 'screens', file)]);
  evidence.screens.push({ state: name, image: `screens/${file}`, width: result.imageWidth, height: result.imageHeight });
  console.log(`Home / ${name}: captured`);
}
const menu = [
  { recipeId: 101, mealType: 'dinner', status: 'cooking', addedByName: '爸爸', dishImg: '/assets/dishes/sweet-sour-chicken.jpg', recipe: { title: '糖醋排骨' } },
  { recipeId: 102, mealType: 'dinner', status: 'todo', addedByName: '妈妈', dishImg: '/assets/dishes/tomato-egg.jpg', recipe: { title: '番茄炒蛋' } },
  { recipeId: 103, mealType: 'dinner', status: 'done', addedByName: '我', dishImg: '/assets/dishes/stir-fry-veg.jpg', recipe: { title: '清炒时蔬' } },
  { recipeId: 104, mealType: 'dinner', status: 'todo', addedByName: '奶奶', dishImg: '/assets/dishes/egg-drop-soup.jpg', recipe: { title: '紫菜蛋花汤' } },
  { recipeId: 105, mealType: 'breakfast', status: 'todo', addedByName: '我', dishImg: '/assets/dishes/chicken-congee.jpg', recipe: { title: '鸡丝粥' } }
];
const demo = {
  loading: false, loadError: '', hasHomeData: true, currentSlot: 'dinner', heroMealWord: '晚上',
  greeting: '晚上好', mealWord: '晚上', currentUser: { nickname: '家人' }, fontScale: 'normal',
  todayMenu: [], shoppingPending: 0, wishes: [], wishExpanded: false,
  heroRecipe: { id: 101, title: '糖醋排骨', titleClass: '', summary: '外酥里嫩，酸甜适口的家常菜', dishImg: '/assets/dishes/sweet-sour-chicken.jpg', timeCost: 40, servings: 4, cuisine: '家常', tasteTags: ['酸甜'] },
  visibleRecipes: [], allRecipes: [],
  cuisineTiles: [{ key: 'all', label: '全部' }, { key: 'home', label: '家常' }, { key: 'quick', label: '快手' }]
};
const longHero = {
  ...demo.heroRecipe,
  title: '奶奶拿手的香菇冬笋炖土鸡配山药', titleClass: 't11',
  summary: '小火慢炖的家常味道，香菇、冬笋、山药和鸡肉一起煮到软烂，盛上一碗热汤，一家人慢慢吃。'
};
const wishes = [
  { id: 'layout-long', slot: 'dinner', by: '家里最会做饭的妈妈', text: '妈妈拿手的番茄鸡蛋炒香菇配青椒和小葱' },
  { id: 'layout-short', slot: 'dinner', by: '爸爸', text: '糖醋排骨', recipeId: 101 }
];
const recipes = [
  { id: 102, title: '番茄炒蛋', dishImg: '/assets/dishes/tomato-egg.jpg', timeCost: 15, servings: 3, cuisine: '家常', tasteTags: ['下饭'] },
  { id: 103, title: '清炒时蔬', dishImg: '/assets/dishes/stir-fry-veg.jpg', timeCost: 10, servings: 3, cuisine: '快手', tasteTags: ['清爽'] }
];
function route(selector, expected) {
  tap(selector);
  const actual = cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path;
  assert.equal(actual, expected);
  evidence.routes.push({ selector, page: actual, result: 'PASS' });
  home();
  patch(demo); update();
}
assert.equal(cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path, 'pages/home/index');
const snapshot = data();
delete snapshot.__webviewId__;
assert.equal(snapshot.loading, false, 'Wait for the business load to settle before adding temporary data');
fs.mkdirSync(path.join(__dirname, 'screens'), { recursive: true });
try {
  patch(demo); update(); scroll(0);
  assert.equal(data().journeySteps[0].active, true);
  capture('empty');
  // The empty meal offers ordering; no menu writes are made by these route taps.
  route('.hm-journey-step[data-step="cook"]', 'pages/recipes/index');
  patch({ todayMenu: menu, shoppingPending: 5 }); update();
  assert.equal(data().slotMenu.length, 4);
  assert.equal(data().homeMenuItems.length, 3);
  assert.equal(data().menuMoreCount, 1);
  assert.equal(data().menuProgress, 25);
  assert.equal(data().menuReady, false);
  scroll(0); checkMenuLayout('menu-top'); capture('menu-top');
  focus('.hm-menu-card');
  assert.equal(data().navSolid, true, 'Scrolling reveals the opaque navigation bar');
  const nav = bounds('.hm-scroll-nav');
  const focusedMenu = bounds('.hm-menu-card');
  assert.ok(Math.abs(nav.top) < 1 && nav.height > 44 && nav.top + nav.height <= focusedMenu.top, 'The fixed header covers the system area and leaves the focused menu visible');
  evidence.layouts.push({ state: 'scroll-navigation', nav, focusedMenu, result: 'PASS' });
  capture('menu');
  // Dinner/breakfast/lunch remain isolated when the meal capsules are tapped.
  tap('.fp-slot[data-slot="breakfast"]');
  assert.equal(data().slotMenu.length, 1);
  tap('.fp-slot[data-slot="lunch"]');
  assert.equal(data().slotMenu.length, 0);
  assert.equal(data().menuProgress, 0);
  assert.equal(data().menuReady, false);
  tap('.fp-slot[data-slot="dinner"]');
  assert.equal(data().slotMenu.length, 4);
  patch({ fontScale: 'lg', todayMenu: menu.map((item, index) => index === 1 ? { ...item, recipe: { title: '妈妈拿手的番茄鸡蛋炒香菇' }, addedByName: '家里最会做饭的妈妈' } : item) });
  update(); focus('.hm-menu-card'); checkMenuLayout('menu-large'); capture('large');
  patch({ fontScale: 'normal', todayMenu: menu.map((item) => ({ ...item, status: 'done' })) });
  update(); assert.equal(data().journeySteps[2].active, true);
  assert.equal(data().menuProgress, 100);
  assert.equal(data().menuReady, true);
  focus('.hm-menu-card'); capture('done');
  route('.hm-menu-action-primary', 'pages/cook-log/index');
  patch({ todayMenu: menu }); update();
  route('.hm-menu-row[data-id="101"]', 'pkg-extra/recipe-detail/index');
  patch({ todayMenu: menu, shoppingPending: 5 }); update();
  route('.hm-menu-action-secondary', 'pages/shopping/index');
  patch({ todayMenu: menu }); update();
  route('.hm-menu-action-primary', 'pkg-extra/kitchen/index');
  route('.hm-journey-step[data-step="record"]', 'pages/cook-log/index');
  if (data().journeySteps.some((step) => step.key === 'community')) {
    route('.hm-journey-step[data-step="community"]', 'pages/community/index');
  }
  for (const fontScale of ['normal', 'lg']) {
    patch({ heroRecipe: longHero, currentUser: { nickname: '家里最会做饭的妈妈' }, fontScale });
    scroll(0);
    assert.equal(data().navSolid, false, 'The photo header returns when scrolling back to the top');
    const header = bounds('.mh-hero-top');
    const body = bounds('.mh-hero-body');
    const greeting = bounds('.mh-greet');
    const icons = bounds('.mh-iconbtns');
    const add = bounds('.mh-hero-add');
    const shuffle = bounds('.mh-hero-shuffle');
    assert.ok(header.top + header.height <= body.top, 'Long hero content stays below the greeting and shortcut buttons');
    assert.ok(greeting.left + greeting.width <= icons.left, 'Long nicknames do not overlap the shortcut buttons');
    assert.ok(add.height >= 44 && shuffle.height >= 44 && Math.abs(add.height - shuffle.height) < 1, 'Hero actions share the same finger-sized height');
    evidence.layouts.push({ state: `hero-${fontScale}`, header, body, greeting, icons, add, shuffle, result: 'PASS' });
    capture(`hero-${fontScale}`);
  }
  patch({ heroRecipe: demo.heroRecipe, currentUser: demo.currentUser, fontScale: 'normal', todayMenu: menu, wishes, wishExpanded: false });
  update(); focus('.fp-wish'); capture('wish-folded');
  tap('.fp-wish-preview');
  assert.equal(data().wishExpanded, true);
  focus('.fp-wish'); checkWishActions('wish-expanded'); capture('wish-expanded');
  patch({ fontScale: 'lg' });
  focus('.fp-wish'); checkWishActions('wish-large'); capture('wish-large');
  evidence.interactions.push({ action: 'Expand long family wishes from the folded preview', result: 'PASS' });
  patch({ fontScale: 'normal', wishes: [], wishExpanded: false });
  focus('.fp-wish');
  tap('.fp-wish-add');
  assert.equal(data().wishExpanded, false, 'Adding a wish does not also toggle the folded list');
  assert.equal(data().showWishModal, true);
  cli('automation_page_action', ['--action', 'callMethod', '--method', 'closeWishModal']);
  assert.equal(data().showWishModal, false);
  tap('.fp-wish-head--toggle');
  assert.equal(data().wishExpanded, true);
  tap('.fp-wish-head--toggle');
  assert.equal(data().wishExpanded, false);
  evidence.interactions.push({ action: 'Add a wish while folded; close without saving; expand and collapse', result: 'PASS' });
  patch({ visibleRecipes: recipes, allRecipes: recipes, revealOn: false, activeCuisine: 'all' });
  focus('.hm-recipes-head');
  const heading = bounds('.hm-recipes-head');
  const chips = bounds('.mh-chips');
  const cards = bounds('.mh-hcards');
  assert.ok(heading.top + heading.height <= chips.top && chips.top + chips.height <= cards.top, 'Recommendation heading precedes filters and recipe cards');
  evidence.layouts.push({ state: 'recommendations', heading, chips, cards, result: 'PASS' });
  capture('recipes');
  evidence.result = 'PASS';
  fs.writeFileSync(path.join(__dirname, 'home-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  console.log('Native home states and routes: PASS');
} finally {
  const current = cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path;
  if (current !== 'pages/home/index') home();
  patch(snapshot); scroll(0);
}
