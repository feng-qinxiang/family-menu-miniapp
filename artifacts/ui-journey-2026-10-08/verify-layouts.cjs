// Native rendering checks only: temporary Page data, no order/save/publish/payment requests.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const selected = new Set(process.argv.slice(2));
const evidenceFile = path.join(__dirname, process.env.MEAL_UI_LAYOUT_EVIDENCE || 'layout-evidence.json');
const evidence = selected.size && fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile, 'utf8')) : { screens: [], layouts: [], runtime: [] };
evidence.checkedAt = new Date().toISOString();
evidence.source = 'temporary Page data; existing runtime state restored';
evidence.passed = false;
let lastCall = 0;
let layoutCache;
function cli(tool, args = []) {
  // DevTools limits this client to 60 calls per minute.
  const cooldown = 1500 - (Date.now() - lastCall);
  if (cooldown > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cooldown);
  lastCall = Date.now();
  const run = spawnSync('/usr/local/bin/wechatide', ['-c', 'Codex', tool, '--project', root, ...args], { encoding: 'utf8', timeout: 55000 });
  assert.equal(run.status, 0, `${tool}: ${run.error ? run.error.message : run.stdout}`);
  const result = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
  assert.equal(result.ok, true, `${tool}: ${result.message || result.errorType}`);
  return result.result;
}
const data = () => cli('automation_page_action', ['--action', 'getData']).data;
const patch = (value) => { layoutCache = null; return cli('automation_page_action', ['--action', 'setData', '--patch', JSON.stringify(value)]); };
const scroll = (top) => { layoutCache = null; return cli('automation_viewport_action', ['--action', 'pageScrollTo', '--scroll-top', String(top)]); };
function bounds(selector) {
  const selectors = ['.m-overview-photo', '.m-overview', '.m-overview-copy', '.mag-shortcut', '.mag-shortcuts', '.mag-profile-copy', '.mag-profile', '.hm-menu-action-primary', '.hm-menu-card', '.m-thumb', '.m-row', '.m-act-cook', '.thumb-img', '.tcard', '.cl-share', '.pphoto', '.pcard', '.pactions', '.pa-report', '.ptop', '.mkt-del', '.mkt-item', '.sp-seg-item', '.sp-seg', '.parsebtn', '.ta-wrap', '.wm-refresh', '.cpt-head', '.wm-thumb', '.wm-daycard', '.wm-wb-date', '.wm-wb', '.fc-createbtn', '.fc-sheet', '.k-img', '.k-col', '.k-timer', '.k-clock', '.k-card-head', '.k-tbtns', '.k-card', '.k-acts', '.cook-dock', '.cook', '.btn.next', '.footer', '.stepwrap', '.timer-acts', '.timer', '.btn.prev', '.btn-prev-label'];
  if (!layoutCache) {
    const boxes = cli('automation_evaluate', ['--fn-source', `function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); ${JSON.stringify(selectors)}.forEach(s => q.select(s).boundingClientRect()); q.exec(resolve); }); }`]).result.result;
    layoutCache = Object.fromEntries(selectors.map((key, index) => [key, boxes[index]]));
  }
  assert.ok(layoutCache[selector], `${selector} rendered`);
  return layoutCache[selector];
}
function inside(selector, parent, state) {
  const child = bounds(selector), box = bounds(parent);
  assert.ok(child.width > 0 && child.height > 0, `${state}: ${selector} rendered`);
  assert.ok(child.left >= box.left - 1 && child.left + child.width <= box.left + box.width + 1, `${state}: ${selector} stays inside ${parent}`);
  evidence.layouts.push({ state, selector, parent, child, box, passed: true });
}
function capture(name, selector) {
  const image = `screens/app-${name}.jpg`;
  const result = cli('simulator_screenshot', ['--wait-for-selector', selector, '--wait', '0.3', '--path', path.join(__dirname, image)]);
  evidence.screens = evidence.screens.filter(entry => entry.state !== name);
  evidence.screens.push({ state: name, image, width: result.imageWidth, height: result.imageHeight });
  console.log(`Captured ${name}`);
}
function sample(page, name, value, selector, check, large = false) {
  if (selected.size && !selected.has(name)) return;
  console.log(`Checking ${name}`);
  const tabs = ['pages/home/index', 'pages/menu/index', 'pages/cook-log/index', 'pages/community/index', 'pages/me/index'];
  if (cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path !== page) {
    cli('automation_navigate', ['--action', tabs.includes(page) ? 'switchTab' : 'reLaunch', '--url', '/' + page]);
  }
  assert.equal(cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path, page);
  let original = data();
  for (let attempt = 0; original.loading && attempt < 4; attempt++) {
    original = cli('automation_page_action', ['--action', 'getData', '--wait', '1']).data;
  }
  assert.notEqual(original.loading, true, `${page}: runtime load must settle before temporary data`);
  evidence.screens = evidence.screens.filter((entry) => entry.state !== name && !entry.state.startsWith(`${name}-`));
  evidence.layouts = evidence.layouts.filter((entry) => entry.state !== name && !entry.state.startsWith(`${name}-`));
  evidence.runtime = evidence.runtime.filter((entry) => entry.page !== page);
  evidence.runtime.push({ page, loadError: original.loadError || false, loaded: original.loaded });
  delete original.__webviewId__;
  try {
    patch({ ...value, loading: false, loadError: false, fontScale: 'normal', revealOn: false });
    if (page === 'pages/home/index') cli('automation_page_action', ['--action', 'callMethod', '--method', 'updateSlotMenu']);
    scroll(0);
    if (check) check(name);
    capture(name, selector);
    if (large) {
      patch({ fontScale: 'lg' });
      if (check) check(`${name}-large`);
      capture(`${name}-large`, selector);
    }
    if (name === 'community') {
      patch({ fontScale: 'normal', 'posts[0].photo': '' });
      const images = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => wx.createSelectorQuery().selectAll(".pphoto-wrap").boundingClientRect().exec(resolve)); }']).result.result;
      assert.equal(images[0].length, 0, '无图片帖子不保留空白大图');
      capture('community-text', '.pactions');
    }
    if (name === 'kitchen') {
      patch({ 'items[0].timer': { running: true }, 'items[0].timerText': '02:34', fontScale: 'normal' });
      check('kitchen-running'); inside('.k-clock', '.k-timer', 'kitchen-running'); capture('kitchen-running', '.k-clock');
      patch({ 'items[0].timer.running': false, fontScale: 'lg' });
      check('kitchen-paused-large'); inside('.k-clock', '.k-timer', 'kitchen-paused-large'); capture('kitchen-paused-large', '.k-clock');
    }
    if (name === 'cook-mode') {
      patch({ hasTimer: true, timerTotal: 300, timerLeft: 154, timerText: '02:34', running: true, fontScale: 'normal', dotsHint: false });
      check('cook-mode-running'); capture('cook-mode-running', '.timer');
      patch({ running: false, fontScale: 'lg' });
      check('cook-mode-paused-large'); capture('cook-mode-paused-large', '.timer');
      patch({ bgIdx: 1, bgName: '第二步', bgText: '01:20', bgExtra: 1 });
      check('cook-mode-background-large'); capture('cook-mode-background-large', '.bgchip');
      patch({ 'steps[0].text': '番茄切块，鸡蛋打散，加少许盐搅匀。锅里热油后先炒鸡蛋，凝固后盛出备用。接着炒软番茄，保留汤汁，最后倒回鸡蛋翻匀。每个步骤都可以慢慢读，计时和下一步一直留在屏幕底部。', stepTop: 300 });
      check('cook-mode-long-large'); capture('cook-mode-long-large', '.cook-dock');
    }
  } finally {
    patch(original);
    scroll(0);
  }
}
const recipes = [
  { id: 101, title: '红烧肉', coverImage: '/assets/dishes/hongshao-pork.jpg', dishImg: '/assets/dishes/hongshao-pork.jpg', cuisine: '家常', timeCost: 45, servings: 4 },
  { id: 102, title: '妈妈拿手的番茄鸡蛋炒香菇', coverImage: '/assets/dishes/tomato-egg.jpg', dishImg: '/assets/dishes/tomato-egg.jpg', cuisine: '家常', timeCost: 15, servings: 3 }
];
const menu = recipes.map((recipe, index) => ({ recipeId: recipe.id, recipe, mealType: 'dinner', addedByName: index ? '妈妈' : '爸爸', status: index ? 'todo' : 'cooking', dishImg: recipe.dishImg, dishImage: recipe.dishImg }));
const records = recipes.map((recipe, index) => ({ id: index + 1, recipeId: recipe.id, title: recipe.title, cover: recipe.coverImage, dateLabel: '10.08 晚', cookName: index ? '妈妈' : '爸爸', score: 5, stars: [true, true, true, true, true], remark: index ? '火候刚刚好，下次还想吃。' : '一家人围着餐桌，就是最好的味道。' }));
const week = ['一', '二', '三', '四', '五', '六', '日'].map((dw, index) => ({ key: String(index), dw, dd: index + 5, state: index === 3 ? 'today' : (index < 3 ? 'done' : '') }));
const foods = [
  { itemId: 1, ingredientName: '番茄', amount: '2', unit: '个', categoryKey: 'veg', initial: '番', cover: '/assets/ingredients/tomato.jpg', sourceText: '来自 番茄炒蛋', pantryText: '家里还有 1 个', purchased: false },
  { itemId: 2, ingredientName: '香菇', amount: '200', unit: '克', categoryKey: 'veg', initial: '香', cover: '', sourceText: '来自 番茄鸡蛋炒香菇', purchased: false }
];
fs.mkdirSync(path.join(__dirname, 'screens'), { recursive: true });
try {
  sample('pages/home/index', 'home', {
    hasHomeData: true, currentUser: { nickname: '家人' }, currentSlot: 'dinner', greeting: '晚上好', mealWord: '晚上', heroMealWord: '晚上',
    heroRecipe: { ...recipes[0], summary: '慢慢炖一锅，等家人一起上桌。', tasteTags: ['下饭'] }, todayMenu: menu, shoppingPending: 2, wishes: [],
    visibleRecipes: recipes, allRecipes: recipes, cuisineTiles: [{ key: 'all', label: '全部' }, { key: 'home', label: '家常' }]
  }, '.hm-menu-card', (state) => inside('.hm-menu-action-primary', '.hm-menu-card', state));
  sample('pages/menu/index', 'cook', {
    view: 'today', todayMenu: menu, mealGroups: [{ meal: 'dinner', label: '晚餐', items: menu, cookOrderText: '红烧肉 45分 → 番茄炒蛋 15分' }],
    totalCount: 2, doneCount: 0, cookingCount: 1, cookPercent: 0, basketText: '还差 2 样食材', pantryReadyCount: 5, weeklyDays: []
  }, '.m-row', (state) => { inside('.m-overview-photo', '.m-overview', state); inside('.m-overview-copy', '.m-overview', state); inside('.m-thumb', '.m-row', state); inside('.m-act-cook', '.m-row', state); }, true);
  sample('pages/cook-log/index', 'record', {
    stats: { dishes: 12, fireDays: 6, praise: 10 }, week, weekDoneText: '3 / 7 天', cooks: [{ name: '妈妈' }, { name: '爸爸' }],
    totalCount: 2, filteredCount: 2, hiddenCount: 0, expanded: false, activeFilter: 'all',
    groups: [{ key: '2026-10', year: 2026, label: '10月', count: 2, items: records }], visibleGroups: [{ key: '2026-10', year: 2026, label: '10月', count: 2, items: records }]
  }, '.tcard', (state) => { inside('.thumb-img', '.tcard', state); inside('.cl-share', '.tcard', state); }, true);
  sample('pages/community/index', 'community', {
    hasMore: false, posts: [{ id: 1, author: '隔壁家的妈妈', authorInitial: '妈', avatarColor: '#795f4a', timeText: '刚刚', title: '今晚这盘番茄炒蛋，被全家夸了', content: '鸡蛋炒得嫩一点，番茄多留一点汤汁，拌饭刚刚好。', photo: recipes[1].coverImage, imageCount: 1, recipe: recipes[1], recipeThumb: recipes[1].coverImage, tags: ['家常菜', '今日餐桌'], likeCount: 12, commentCount: 3, favoriteCount: 5 }],
    communitySummary: { postCount: 1, commentCount: 3, favoriteCount: 5 }
  }, '.pcard', (state) => { inside('.pphoto', '.pcard', state); inside('.pactions', '.pcard', state); inside('.pa-report', '.ptop', state); }, true);
  sample('pages/me/index', 'me', {
    familyProfile: { familyName: '有滋有味的一家', members: [{ userId: 1, initial: '爸', tone: 'mavt-a' }, { userId: 2, initial: '妈', tone: 'mavt-b' }, { userId: 3, initial: '我', tone: 'mavt-c' }] },
    profile: { nickname: '今天的掌勺人', avatarUrl: '', initial: '厨' }, todayDishes: menu.map(item => ({ recipeId: item.recipeId, title: item.recipe.title, cover: item.dishImage })), todayTotal: 2, todayDone: 0, memberCount: 3, savedCount: 24, monthCookCount: 12, bindCard: { show: false }, cookHistory: [{ ...records[0], recipeTitle: '红烧肉', whenLabel: '今天晚餐' }]
  }, '.mag-stats', (state) => { inside('.mag-shortcut', '.mag-shortcuts', state); inside('.mag-profile-copy', '.mag-profile', state); }, true);
  sample('pages/recipes/index', 'recipes', { recipes, filteredRecipes: recipes, displayedRecipes: recipes, menuTray: { count: 0 }, hasMore: false }, '.rx-grid');
  sample('pages/pantry/index', 'pantry', {
    loaded: true, pantrySummary: { count: 3, expiringCount: 1 }, categories: [{ key: 'veg', icon: 'veg', label: '蔬菜', qty: 2, items: foods.map((food) => ({ ...food, id: food.itemId, expiresText: '还可保存 3 天', amountText: food.amount + food.unit })) }]
  }, '.pcard');
  sample('pages/shopping/index', 'shopping', {
    tab: 'shopping', shoppingList: { items: foods }, summary: { totalCount: 3, purchasedCount: 1, progressPercent: 33 },
    groupedPending: [{ key: 'veg', label: '蔬菜', items: foods }], purchasedItems: [], groupedPurchased: []
  }, '.mkt-item', (state) => { inside('.mkt-del', '.mkt-item', state); inside('.sp-seg-item', '.sp-seg', state); }, true);
  sample('pkg-extra/import/index', 'import', { rawText: '', charCount: 0, preview: null, recentImports: [], activeTab: 'xhs' }, '.ta-input', (state) => inside('.parsebtn', '.ta-wrap', state), true);
  const days = week.map((day, index) => ({ date: `2026-10-${String(index + 5).padStart(2, '0')}`, wkLabel: `周${day.dw}`, dateLabel: `10月${index + 5}日`, isToday: index === 4, recipeCount: index === 1 ? 1 : 2, lunch: { ...recipes[1], image: recipes[1].coverImage }, dinner: index === 1 ? null : { ...recipes[0], image: recipes[0].coverImage } }));
  sample('pkg-extra/weekly-menu/index', 'weekly', {
    heroSub: '10月5日 — 10月11日 · 已排好 7 天，还差 1 个空位', weeklyMenu: { days }, activeIndex: 4,
    weekbar: week.map((day, index) => ({ index, short: day.dw, dateNumber: index + 5, isToday: index === 4, filled: true })), menuSummary: { dayCount: 7, recipeCount: 13, blankCount: 1 }
  }, '.wm-daycard', (state) => { inside('.wm-refresh', '.cpt-head', state); inside('.wm-thumb', '.wm-daycard', state); inside('.wm-wb-date', '.wm-wb', state); }, true);
  sample('pkg-extra/family/create/index', 'family', { familyName: '', nameError: false, avatar: '', regionText: '', submitting: false }, '.fc-createbtn', (state) => inside('.fc-createbtn', '.fc-sheet', state), true);
  sample('pkg-extra/kitchen/index', 'kitchen', {
    activeMeal: 'dinner', groups: [{ meal: 'dinner', label: '晚餐', items: menu }], doneCount: 0,
    items: menu.map((item, index) => ({ id: item.recipeId, title: item.recipe.title, img: item.dishImage, status: item.status, main: index === 0, timeCost: item.recipe.timeCost, servings: item.recipe.servings, mealLabel: '晚餐' })), orderText: '先炖红烧肉，再炒番茄鸡蛋。'
  }, '.k-card', (state) => { inside('.k-img', '.k-card-head', state); inside('.k-timer', '.k-col', state); inside('.k-tbtns', '.k-timer', state); inside('.k-acts', '.k-card', state); }, true);
  sample('pkg-extra/cook-mode/index', 'cook-mode', {
    recipeId: 102, recipe: recipes[1], dishName: '番茄炒蛋', dishImg: recipes[1].coverImage, current: 0, total: 3, dots: ['now', '', ''],
    steps: [{ cn: '第一步', num: '01', text: '番茄切块，鸡蛋打散，加少许盐搅匀。', image: recipes[1].coverImage }, { cn: '第二步', num: '02', text: '鸡蛋炒至凝固，盛出备用。', image: recipes[1].coverImage }, { cn: '第三步', num: '03', text: '炒软番茄，加入鸡蛋，翻匀即可。', image: recipes[1].coverImage }],
    ingredients: [{ name: '番茄', label: '番茄 2个' }, { name: '鸡蛋', label: '鸡蛋 3个' }], hasTimer: false, timerText: '00:00', running: false
  }, '.stepimg', (state) => {
    inside('.cook-dock', '.cook', state); inside('.btn.next', '.footer', state);
    const dock = bounds('.cook-dock'), screen = bounds('.cook'), step = bounds('.stepwrap');
    assert.ok(dock.top >= step.top + step.height - 1 && dock.top + dock.height <= screen.top + screen.height + 1, `${state}: 计时与翻步在视口内，正文不被覆盖`);
    evidence.layouts.push({ state, dock, screen, step, passed: true });
    if (data().hasTimer) inside('.timer-acts', '.timer', state);
    const previous = bounds('.btn.prev'), label = bounds('.btn-prev-label');
    assert.ok(label.height < previous.height * 0.7, `${state}: 上一步保持一行`);
  }, true);
  evidence.passed = evidence.screens.length > 0 && evidence.layouts.every((entry) => entry.passed);
} finally {
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
  if (cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path !== 'pages/home/index') {
    cli('automation_navigate', ['--action', 'switchTab', '--url', '/pages/home/index']);
  }
}
console.log('Native layout checks passed; runtime data restored.');
