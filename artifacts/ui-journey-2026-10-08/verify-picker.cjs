// Native layout/interaction checks with temporary Page data; never submit an order or edit stock.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { spawnSync } = require('node:child_process');
const { normalizeMatches, pantrySummary } = require('../../miniapp/utils/pantry-match');
const { todayDateKey } = require('../../miniapp/utils/dish-logic');
const root = path.resolve(__dirname, '../..');
const selected = new Set(process.argv.slice(2));
const evidenceFile = path.join(__dirname, process.env.MEAL_UI_LAYOUT_EVIDENCE || 'picker-layouts.json');
const evidence = selected.size && fs.existsSync(evidenceFile) ? JSON.parse(fs.readFileSync(evidenceFile)) : { screens: [], checks: [] };
evidence.checkedAt = new Date().toISOString();
evidence.source = 'Native pages with temporary sample data; no write APIs; Page data restored.';
evidence.passed = false;
let lastCall = 0;
let layoutCache;
function cli(tool, args = []) {
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
const patch = value => { layoutCache = null; return cli('automation_page_action', ['--action', 'setData', '--patch', JSON.stringify(value)]); };
function method(name, args = []) {
  layoutCache = null;
  if (!args.length) return cli('automation_page_action', ['--action', 'callMethod', '--method', name]);
  const argsFile = path.join(os.tmpdir(), `meal-picker-args-${process.pid}.json`);
  fs.writeFileSync(argsFile, JSON.stringify(args));
  try { return cli('automation_page_action', ['--action', 'callMethod', '--method', name, '--args-file', argsFile]); }
  finally { fs.unlinkSync(argsFile); }
}
const scroll = top => { layoutCache = null; return cli('automation_viewport_action', ['--action', 'pageScrollTo', '--scroll-top', String(Math.max(0, top))]); };
function bounds(selector) {
  const selectors = ['.hm-pick-tool', '.hm-pick-tools', '.hm-menu-card', '.hm-menu-open', '.fp-wish', '.fp-wish-preview-dish', '.fp-wish-preview', '.fp-wish-more', '.fp-wish-item', '.hm-recipes-head', '.hm-search-submit', '.hm-recipe-search', '.rx-source-rail', '.rx-results', '.rx-picker-add', '.rx-picker', '.pantry-pick-btn', '.pantry-pick', '.pantry-add', '.pantry-list-head', '.pi-edit', '.pitem', '.af-date', '.add-form', '.af-date-clear', '.af-date-row', '.mkt-del', '.mkt-item', '.mkt-tags', '.rx-browse-controls', '.rx-rail-tabs', '.rx-current-filter', '.pantry-reminder', '.pantry-reminder-button', '.pi-nm', '.pi-qt', '.pi-bottom', '.pi-ex', '.mkt-namebar .nm', '.mkt-namebar .amt', '.pantry-overview', '.rx-source.on', '.rx-filter-selected', '.mkt-addbar', '.mkt-add-fields', '.mkt-draft-photo', '.mkt-add-footer', '.mkt-addbtn', '.mkt-add-quantity', '.mkt-draft-name', '.mkt-draft-photo .mkt-photo-hint', '.mkt-item-actions', '.mkt-buy', '.pantry-reminder-head', '.pantry-reminder-title', '.pantry-reminder-link', '.pantry-reminder-row', '.pantry-reminder-copy'];
  if (!layoutCache) {
    const boxes = cli('automation_evaluate', ['--fn-source', `function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); ${JSON.stringify(selectors)}.forEach(s => q.select(s).boundingClientRect()); q.exec(resolve); }); }`]).result.result;
    layoutCache = Object.fromEntries(selectors.map((key, index) => [key, boxes[index]]));
  }
  assert.ok(layoutCache[selector], `${selector} rendered`);
  return layoutCache[selector];
}
function inside(child, parent, name) {
  const a = bounds(child), b = bounds(parent);
  assert.ok(a.width > 0 && a.height > 0 && a.left >= b.left - 1 && a.left + a.width <= b.left + b.width + 1, `${name}: ${child} inside ${parent}`);
  evidence.checks = evidence.checks.filter(item => item.name !== name);
  evidence.checks.push({ name, child, parent, a, b, passed: true });
}
function nameAmount(name, amount, label) {
  const a = bounds(name), b = bounds(amount);
  assert.ok(a.right <= b.left + 1 && Math.abs(a.top - b.top) < Math.min(a.height, b.height), `${label}: name and amount share a row without overlap`);
  evidence.checks = evidence.checks.filter(item => item.name !== label);
  evidence.checks.push({ name: label, a, b, passed: true });
}
function recipeRowsInside(name) {
  // Page selectors do not enter components; >>> is the native cross-component selector.
  const groups = cli('automation_evaluate', ['--fn-source', `function() {
    return new Promise(resolve => {
      const query = wx.createSelectorQuery();
      ['.rc-row', '.rc-row-add', '.rc-row-title', '.rc-row-thumb', '.rc-row-details', '.rc-row-footer', '.rc-row-main', '.rc-row-mid', '.rc-row-media', '.rc-row-footer-copy'].forEach(selector => query.selectAll('.rx-grid >>> ' + selector).boundingClientRect());
      query.exec(resolve);
    });
  }`]).result.result;
  const rows = groups[0].map((_, index) => groups.map(group => group[index]));
  assert.ok(rows.length > 0, 'native recipe cards rendered');
  for (const [row, add, title, thumb, details, footer, main, mid, media, footerCopy] of rows) {
    assert.ok(row && add && title && thumb && details && footer && main && mid && media && footerCopy, 'component nodes rendered');
    assert.ok(details.left >= mid.left - 1 && details.right <= mid.right + 1 && details.top >= title.bottom - 1 && details.bottom <= mid.bottom + 1, 'summary and ingredients stay in the right information column');
    assert.ok(Math.abs(details.width - mid.width) < 1 && mid.width >= row.width * .45, 'recipe information uses the right column width');
    assert.ok(Math.abs(thumb.width - thumb.height) < 1, 'dish photos keep a stable square');
    assert.ok(footer.top >= main.bottom - 1 && Math.abs(footer.width - main.width) < 1 && footer.left >= row.left - 1, 'stock and ordering use the full width below the photo and information');
    assert.ok(add.height >= 43 && add.width >= 43, 'order action remains tappable');
    assert.ok(add.right <= row.right + 1 && add.bottom <= row.bottom + 1, 'add stays inside row');
    assert.ok(media.right <= mid.left + 1 && footerCopy.right <= add.left + 1 && add.top >= footer.top - 1, 'image, text, stock and action do not overlap');
  }
  evidence.checks = evidence.checks.filter(item => item.name !== name);
  evidence.checks.push({ name, rows, passed: true });
}
function recipeToolbar(name, active = false) {
  const selectors = ['.recipes-mag', '.rx-searchrow', '.rx-search', '.rx-search-input', '.rx-filter-btn', '.rx-pickbar', '.rx-pick-option', '.rx-pick-stock', '.rx-browser', '.rx-source-rail', '.rx-rail-mode', '.rx-listbar', '.rx-card-slot', '.rx-stock-toggle', '.rx-current-filter', '.rx-filter-selected', '.rx-quickfilters', '.rx-qf-chip', '.rx-qf-reset', '.rx-qf-row', '.rx-qf-text'];
  const groups = cli('automation_evaluate', ['--fn-source', `function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); ${JSON.stringify(selectors)}.forEach(s => q.selectAll(s).boundingClientRect()); q.exec(resolve); }); }`]).result.result;
  const nodes = Object.fromEntries(selectors.map((selector, i) => [selector, groups[i]]));
  const page = nodes['.recipes-mag'][0], search = nodes['.rx-searchrow'][0], input = nodes['.rx-search-input'][0], filter = nodes['.rx-filter-btn'][0], pickbar = nodes['.rx-pickbar'][0], stock = nodes['.rx-pick-stock'][0], browser = nodes['.rx-browser'][0], rail = nodes['.rx-source-rail'][0], mode = nodes['.rx-rail-mode'][0], listbar = nodes['.rx-listbar'][0], firstCard = nodes['.rx-card-slot'][0];
  assert.ok(input.right <= filter.left + 1 && filter.right <= search.right + 1 && filter.height >= 43 && filter.width >= 43, `${name}: search and filter share a row without overlap`);
  const choices = nodes['.rx-pick-option'];
  assert.equal(choices.length, 2);
  assert.ok(choices[0].right <= choices[1].left + 1 && choices[1].right <= stock.left + 1 && stock.right <= pickbar.right + 1, `${name}: random, pantry and stock links stay separate`);
  for (const control of [...choices, stock, mode, ...nodes['.rx-filter-selected'], ...nodes['.rx-qf-chip'], ...nodes['.rx-qf-reset']]) assert.ok(control.height >= 43 && control.width >= 43 && control.left >= page.left - 1 && control.right <= page.right + 1, `${name}: controls fit and remain tappable`);
  assert.ok(rail.right <= listbar.left + 1 && listbar.right <= browser.right + 1 && firstCard.left >= listbar.left - 1 && firstCard.right <= browser.right + 1, `${name}: category picker and recipe list fit beside each other`);
  assert.ok(mode.bottom <= firstCard.top + 1 && firstCard.top - listbar.bottom <= 12, `${name}: cards follow the result row without unused vertical space`);
  assert.equal(nodes['.rx-current-filter'].length, active ? 1 : 0, `${name}: only active filters need a summary row`);
  const selected = nodes['.rx-filter-selected'];
  for (let i = 1; i < selected.length; i++) assert.ok(selected[i].top >= selected[i - 1].bottom - 1 || selected[i].left >= selected[i - 1].right - 1, `${name}: selected filters wrap without overlap`);
  if (!nodes['.rx-quickfilters'].length) {
    assert.ok(pickbar.bottom - search.top <= 108, `${name}: default tools stay within two compact rows`);
    assert.equal(nodes['.rx-stock-toggle'].length, 0, `${name}: stock display setting is hidden with the filters`);
  }
  else {
    const panel = nodes['.rx-quickfilters'][0], rows = nodes['.rx-qf-row'], reset = nodes['.rx-qf-reset'][0];
    assert.ok(Math.abs(panel.top - search.bottom) < 2 && panel.bottom <= pickbar.top + 1, `${name}: conditions stay attached to search, before random choices`);
    const stockToggle = nodes['.rx-stock-toggle'][0];
    assert.ok(rows.length === 2 && rows[0].bottom <= rows[1].top + 1 && stockToggle.top >= rows[1].bottom - 1 && stockToggle.bottom <= panel.bottom + 1, `${name}: two condition rows and the stock display setting stay in the filter panel`);
    assert.ok(reset.top >= rows[1].top - 1 && reset.bottom <= rows[1].bottom + 1, `${name}: reset shares the second row`);
    for (const label of nodes['.rx-qf-text']) assert.ok(label.height <= 32 && label.left >= panel.left - 1 && label.right <= panel.right + 1, `${name}: visual labels stay small inside full touch areas`);
  }
  evidence.checks = evidence.checks.filter(item => item.name !== name);
  evidence.checks.push({ name, nodes, passed: true });
}
function shoppingActions(name) {
  inside('.mkt-item-actions', '.mkt-item', name + '-row');
  inside('.mkt-buy', '.mkt-item-actions', name + '-buy');
  inside('.mkt-del', '.mkt-item-actions', name + '-remove');
  const buy = bounds('.mkt-buy'), remove = bounds('.mkt-del'), item = bounds('.mkt-item');
  assert.ok(buy.right <= remove.left + 1 && buy.height >= 43 && remove.height >= 43, 'shopping buttons are separate and tappable');
  assert.ok(buy.bottom <= item.bottom + 1 && remove.bottom <= item.bottom + 1, 'shopping buttons stay inside the ingredient item');
}
function reminderActions(name) {
  inside('.pantry-reminder-link', '.pantry-reminder-head', name + '-messages');
  inside('.pantry-reminder-button', '.pantry-reminder-row', name + '-subscribe');
  const title = bounds('.pantry-reminder-head .pantry-reminder-title'), link = bounds('.pantry-reminder-link'), copy = bounds('.pantry-reminder-copy'), button = bounds('.pantry-reminder-button'), row = bounds('.pantry-reminder-row');
  assert.ok(title.right <= link.left + 1 && copy.right <= button.left + 1, 'reminder text stays separate from both actions');
  assert.ok(button.height >= 43 && button.bottom <= row.bottom + 1 && button.top >= row.top - 1, 'reminder action is tappable and fully inside its row');
  assert.ok(button.width < row.width * .35 && copy.width > row.width * .6, 'reminder copy keeps most of the row; platform button width cannot crowd it');
  const textBoxes = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); [".pantry-reminder-link-label", ".pantry-reminder-button-label"].forEach(s => q.select(s).boundingClientRect()); q.exec(resolve); }); }']).result.result;
  [link, button].forEach((control, index) => {
    const label = textBoxes[index];
    assert.ok(label && label.left >= control.left - 1 && label.right <= control.right + 1 && label.top >= control.top - 1 && label.bottom <= control.bottom + 1 && label.height <= control.height * .6, 'reminder labels fit as one line inside their controls');
  });
}
function capture(name, selector, filename = `picker-${name}.jpg`) {
  const image = `screens/${filename}`;
  cli('simulator_screenshot', ['--wait-for-selector', selector, '--wait', '0.3', '--path', path.join(__dirname, image)]);
  evidence.screens = evidence.screens.filter(item => item.name !== name);
  evidence.screens.push({ name, image });
  console.log(`Captured ${name}`);
}
function page(name, route, sample, check) {
  if (selected.size && !selected.has(name)) return;
  console.log(`Checking ${name}`);
  if (cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path !== route) {
    cli('automation_navigate', ['--action', route === 'pages/home/index' ? 'switchTab' : 'reLaunch', '--url', '/' + route]);
  }
  assert.equal(cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path, route);
  let original = data();
  for (let i = 0; original.loading && i < 4; i++) original = cli('automation_page_action', ['--action', 'getData', '--wait', '1']).data;
  assert.notEqual(original.loading, true, `${route} load settled`);
  delete original.__webviewId__;
  try {
    patch({ ...sample, loading: false, loadError: false, fontScale: 'normal', revealOn: false });
    scroll(0);
    check();
  } finally {
    patch(original);
    scroll(0);
  }
}
const recipes = [
  { id: 101, title: '红烧肉', coverImage: '/assets/dishes/hongshao-pork.jpg', cuisine: '家常', timeCost: 45, servings: 4 },
  { id: 102, title: '妈妈拿手的番茄鸡蛋炒香菇', coverImage: '/assets/dishes/tomato-egg.jpg', cuisine: '家常', timeCost: 15, servings: 3 },
  { id: 103, title: '清炒时蔬', coverImage: '/assets/dishes/stir-fry-veg.jpg', cuisine: '快手', timeCost: 10, servings: 2 },
  { id: 104, title: '番茄鸡蛋汤', coverImage: '/assets/dishes/egg-drop-soup.jpg', cuisine: '家常', timeCost: 10, servings: 2 }
].map(recipe => ({ ...recipe, cover: recipe.coverImage, dishImg: recipe.coverImage, sourceType: 'owned', mine: true, tasteTags: ['鲜香', '下饭'], ingredients: (recipe.id === 101 ? ['五花肉', '冰糖'] : ['番茄', '鸡蛋', '香菇']).map(name => ({ name })), summary: recipe.id === 101 ? '小火慢炖，酱香浓郁，适合全家一起吃。' : '食材简单，趁热上桌，家里常做的一道菜。', sourceLabel: '自建' }));
const today = new Date();
const date = delta => todayDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta));
const stock = [
  { id: 1, ingredientName: '番茄', amount: '4', unit: '个', expiresAt: date(0) },
  { id: 2, ingredientName: '鸡蛋', amount: '6', unit: '个', expiresAt: date(2) },
  { id: 3, ingredientName: '香菇', amount: '200', unit: '克', expiresAt: date(1) },
  { id: 4, ingredientName: '牛奶', amount: '1', unit: '盒', expiresAt: date(-1) },
  { id: 5, ingredientName: '大米', amount: '1', unit: '袋', expiresAt: '' }
];
const matches = normalizeMatches(recipes.map((recipe, i) => ({ recipe, totalCount: 3, matchedCount: i === 0 ? 1 : 3, missingIngredients: i === 0 ? ['五花肉', '冰糖'] : [], expiringIngredients: i === 0 || i === 2 ? [] : ['番茄', '鸡蛋'] })));
fs.mkdirSync(path.join(__dirname, 'screens'), { recursive: true });
try {
  page('home', 'pages/home/index', {
    hasHomeData: true, currentUser: { nickname: '家人' }, currentSlot: 'dinner', greeting: '晚上好', mealWord: '晚上', heroMealWord: '晚上',
    heroRecipe: { ...recipes[0], summary: '慢慢炖一锅，等家人一起上桌。' }, todayMenu: [{ recipeId: 101, recipe: recipes[0], mealType: 'dinner', status: 'cooking', addedByName: '爸爸' }, { recipeId: 102, recipe: recipes[1], mealType: 'dinner', status: 'todo', addedByName: '妈妈' }],
    shoppingPending: 2, wishes: [{ id: 1, text: '妈妈拿手的番茄鸡蛋炒香菇配青椒和小葱', by: '家里最会做饭的妈妈' }, { id: 2, text: '糖醋排骨', by: '爸爸' }], wishExpanded: false,
    allRecipes: recipes, visibleRecipes: recipes.slice(1), cuisineTiles: [{ key: 'all', label: '全部' }, { key: '家常', label: '家常' }, { key: '快手', label: '快手' }]
  }, () => {
    method('updateSlotMenu'); inside('.hm-pick-tool', '.hm-pick-tools', 'home-tools'); capture('home', '.hm-menu-card', 'app-home.jpg');
    scroll(bounds('.hm-menu-card').top - 95); inside('.hm-menu-open', '.hm-menu-card', 'home-compact-menu'); capture('home-menu', '.hm-menu-card');
    patch({ fontScale: 'lg' }); inside('.hm-menu-open', '.hm-menu-card', 'home-compact-menu-large'); capture('home-menu-large', '.hm-menu-card'); patch({ fontScale: 'normal' });
    scroll(0); scroll(bounds('.fp-wish').top - 95);
    inside('.fp-wish-preview-dish', '.fp-wish-preview', 'home-wish-preview'); capture('home-wish-preview', '.fp-wish-preview');
    patch({ fontScale: 'lg' }); inside('.fp-wish-preview-dish', '.fp-wish-preview', 'home-wish-preview-large'); capture('home-wish-preview-large', '.fp-wish-preview'); patch({ fontScale: 'normal' });
    method('toggleWishExpand'); scroll(bounds('.fp-wish').top - 95);
    inside('.fp-wish-more', '.fp-wish-item', 'home-wish'); capture('home-wishes', '.fp-wish-item');
    patch({ fontScale: 'lg' }); inside('.fp-wish-more', '.fp-wish-item', 'home-wish-large'); capture('home-wishes-large', '.fp-wish-item');
    patch({ fontScale: 'normal', wishExpanded: false }); scroll(0); scroll(bounds('.hm-recipes-head').top - 95);
    inside('.hm-search-submit', '.hm-recipe-search', 'home-search'); capture('home-search', '.hm-recipe-search');
  });
  if (selected.has('hero')) page('hero', 'pages/home/index', {
    hasHomeData: true, currentUser: { nickname: '家人' }, currentSlot: 'dinner', greeting: '晚上好', mealWord: '晚上', heroMealWord: '晚上', todayMenu: [], wishes: [],
    heroRecipe: { ...recipes[0], title: '奶奶拿手的香菇冬笋炖土鸡配山药', titleClass: 't11', summary: '小火慢炖的家常味道，香菇、冬笋、山药和鸡肉一起煮到软烂，盛上一碗热汤，一家人慢慢吃。' }
  }, () => {
    for (const fontScale of ['normal', 'lg']) {
      patch({ fontScale });
      const boxes = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); [".mh-hero-title", ".mh-hero-sub", ".mh-hero-meta", ".mh-hero-acts"].forEach(s => q.select(s).boundingClientRect()); q.exec(resolve); }); }']).result.result;
      assert.ok(boxes.every(box => box && box.width > 0 && box.height > 0));
      assert.ok(boxes.slice(0, -1).every((box, i) => box.top + box.height <= boxes[i + 1].top + 1), 'hero title, description, facts and actions do not overlap');
      evidence.checks = evidence.checks.filter(item => item.name !== 'hero-' + fontScale);
      evidence.checks.push({ name: 'hero-' + fontScale, boxes, passed: true });
      capture('hero-' + fontScale, '.mh-hero-title', 'home-updated-hero-' + fontScale + '.jpg');
    }
  });
  if (selected.has('candidates')) page('candidates', 'pages/recipes/index', { recipes, filteredRecipes: recipes, displayedRecipes: recipes, pantryMatches: matches, pantrySummary: pantrySummary(stock), pantryItems: stock.map(item => ({ ...item, amountText: item.amount + item.unit })), pantryLoading: false, pantryFailed: false, pantryStockLoading: false, pantryStockFailed: false, pickerOpen: true, pickMode: 'pantry', todayDishIds: [], menuTray: { count: 0 }, hasMore: false, avoidTags: [] }, () => {
    method('applyFilter');
    scroll(bounds('.rx-results').top - 100);
    recipeRowsInside('pantry-candidate-rows'); capture('pantry-candidates', '.rx-grid');
  });
  page('recipes', 'pages/recipes/index', { recipes, filteredRecipes: recipes, displayedRecipes: recipes, pantryMatches: matches, pantrySummary: pantrySummary(stock), pantryItems: stock.map(item => ({ ...item, amountText: item.amount + item.unit })), pantryLoading: false, pantryFailed: false, pantryStockLoading: false, pantryStockFailed: false, pickerOpen: false, pickMode: 'all', todayDishIds: [], menuTray: { count: 0 }, hasMore: false, avoidTags: [] }, () => {
    method('applyFilter');
    const rail = bounds('.rx-source-rail'), results = bounds('.rx-results');
    assert.ok(rail.left + rail.width < results.left, '来源栏在菜谱列表左侧');
    evidence.checks = evidence.checks.filter(item => item.name !== 'source-left');
    evidence.checks.push({ name: 'source-left', rail, results, passed: true });
    patch({ railMode: 'cuisine', cuisineList: ['家常', '川菜', '粤菜', '湘菜', '鲁菜', '西餐', '日料', '快手'] });
    patch({ showAdvFilter: false });
    recipeToolbar('toolbar-normal'); capture('recipes', '.rx-grid', 'app-recipes.jpg'); recipeRowsInside('source-row-add');
    method('toggleAdvFilter'); recipeToolbar('toolbar-expanded'); capture('recipes-filters', '.rx-quickfilters');
    method('setFilterTime', [{ currentTarget: { dataset: { val: '30' } } }]);
    method('setFilterServings', [{ currentTarget: { dataset: { val: '2' } } }]);
    assert.ok(data().filteredRecipes.every(recipe => recipe.timeCost <= 30 && recipe.servings >= 2));
    method('toggleAdvFilter'); recipeToolbar('toolbar-active', true); capture('recipes-filter-selected', '.rx-current-filter');
    method('setFilterTime', [{ currentTarget: { dataset: { val: '0' } } }]);
    assert.equal(data().advFilter.minServings, 2, 'clearing time keeps the person filter');
    method('setFilterServings', [{ currentTarget: { dataset: { val: '0' } } }]);
    recipeToolbar('toolbar-cleared');
    scroll(bounds('.rx-source-rail').top - 100); capture('recipes-list', '.rx-grid'); scroll(0);
    method('setFilterCuisine', [{ currentTarget: { dataset: { val: '家常' } } }]);
    assert.ok(data().filteredRecipes.every(recipe => recipe.cuisine === '家常'));
    inside('.rx-source.on', '.rx-source-rail', 'selected-cuisine'); inside('.rx-filter-selected', '.rx-current-filter', 'active-filter-clear');
    capture('recipes-cuisine', '.rx-grid');
    method('selectRailMode', [{ currentTarget: { dataset: { mode: 'source' } } }]);
    method('selectSource', [{ currentTarget: { dataset: { source: 'owned' } } }]);
    assert.equal(data().advFilter.cuisine, '家常', '来源切换保留菜系');
    capture('recipes-source', '.rx-grid');
    method('clearFilter'); method('selectRailMode', [{ currentTarget: { dataset: { mode: 'cuisine' } } }]);
    patch({ fontScale: 'lg' }); recipeToolbar('toolbar-large'); recipeRowsInside('source-row-add-large'); capture('recipes-large', '.rx-grid');
    method('toggleAdvFilter'); recipeToolbar('toolbar-expanded-large'); capture('recipes-filters-large', '.rx-quickfilters'); method('toggleAdvFilter'); patch({ fontScale: 'normal' });
    patch({ showPantryDetails: false }); recipeRowsInside('source-row-no-stock'); capture('recipes-no-stock', '.rx-grid'); patch({ showPantryDetails: true });
    method('openPicker', [{ currentTarget: { dataset: { mode: 'all' } } }]);
    assert.ok(data().pickedRecipe); inside('.rx-picker-add', '.rx-picker', 'random-picker'); capture('random', '.rx-picked-main');
    patch({ pantryItems: [], pantrySummary: pantrySummary([]) }); capture('random-empty-fridge', '.rx-stock-note');
    patch({ pantryStockFailed: true }); capture('random-stock-failed', '.rx-stock-note');
    patch({ pantryItems: stock.map(item => ({ ...item, amountText: item.amount + item.unit })), pantrySummary: pantrySummary(stock), pantryStockFailed: false });
    method('openPicker', [{ currentTarget: { dataset: { mode: 'pantry' } } }]);
    let picked = data().pickedRecipe;
    assert.ok([102, 104].includes(picked.id));
    method('pickRandom'); assert.notEqual(data().pickedRecipe.id, picked.id);
    inside('.rx-picker-add', '.rx-picker', 'pantry-picker'); capture('pantry-pick', '.rx-picked-main');
    patch({ fontScale: 'lg' }); inside('.rx-picker-add', '.rx-picker', 'pantry-picker-large'); capture('pantry-pick-large', '.rx-picked-main');
    patch({ fontScale: 'normal', pantryMatches: [], pickedRecipe: null }); method('applyFilter');
    assert.equal(data().pickedRecipe, null); capture('pantry-pick-empty', '.rx-picker-empty');
    patch({ pantryFailed: true }); method('applyFilter'); capture('pantry-pick-failed', '.rx-picker-retry');
  });
  page('pantry', 'pages/pantry/index', { loaded: true, pantryItems: stock, pantrySummary: pantrySummary(stock), pantryFilter: 'all', matchResults: matches, matchReadyCount: 3, matchFailed: false, matchLoading: false, showMatch: true, ingredientPhotos: { '番茄': '/assets/ingredients/tomato.jpg' }, ingredientPhotosFailed: false, reminderSettingsLoaded: true, reminderTemplateReady: true, reminderSubscribed: false }, () => {
    // Enrich and group with the same Page methods used after reading real stock.
    const result = method('enrichPantryItems', [stock]);
    const enriched = result.result;
    assert.ok(Array.isArray(enriched), 'enrichment returned stock');
    patch({ pantryItems: enriched, reminderExpanded: false }); method('applyPantryFilter');
    inside('.pantry-pick-btn', '.pantry-pick', 'pantry-pick-button'); inside('.pantry-add', '.pantry-list-head', 'pantry-add-button'); inside('.pi-edit', '.pitem', 'pantry-edit'); capture('pantry', '.pcard', 'app-pantry.jpg');
    inside('.pantry-reminder-toggle', '.pantry-reminder', 'reminder-collapsed');
    method('toggleReminder'); assert.equal(data().reminderExpanded, true);
    inside('.pantry-reminder-button', '.pantry-reminder', 'reminder-button'); reminderActions('reminder-normal');
    nameAmount('.pi-nm', '.pi-qt', 'pantry-name-amount'); inside('.pi-edit', '.pi-bottom', 'pantry-manage-with-date'); inside('.pantry-pick', '.pantry-overview', 'pick-in-overview'); inside('.pantry-reminder', '.pantry-overview', 'reminder-in-overview');
    patch({ reminderSubscribed: true }); reminderActions('reminder-once'); capture('pantry-reminder-once', '.pantry-reminder');
    patch({ reminderTemplateReady: false, reminderSubscribed: false }); reminderActions('reminder-unavailable'); capture('pantry-reminder-unavailable', '.pantry-reminder');
    patch({ reminderTemplateReady: true });
    patch({ fontScale: 'lg' }); inside('.pi-edit', '.pitem', 'pantry-large'); inside('.pantry-reminder-button', '.pantry-reminder', 'reminder-button-large'); reminderActions('reminder-large'); capture('pantry-large', '.pcard');
    patch({ fontScale: 'normal' }); method('onPhotoError', [{ currentTarget: { dataset: { id: 1 } } }]);
    assert.equal(data().categories[0].items[0].coverBroken, true); capture('pantry-image-fallback', '.pi-thumb text');
    patch({ pantryItems: enriched }); method('applyPantryFilter');
    patch({ fontScale: 'normal', newItem: { ingredientName: '青菜', amount: '1', unit: '把', expiresAt: date(2) } });
    method('toggleAddForm'); inside('.af-date', '.add-form', 'pantry-add-date'); capture('pantry-add', '.add-form'); method('toggleAddForm');
    method('openEditSheet', [{ currentTarget: { dataset: { id: 1 } } }]);
    assert.equal(data().editDraft.expiresAt, date(0)); inside('.af-date-clear', '.af-date-row', 'pantry-edit-date'); capture('pantry-edit-date', '.af-date-clear');
    method('clearExpiry'); assert.equal(data().editDraft.expiresAt, ''); method('closeEditSheet');
    method('selectPantryFilter', [{ currentTarget: { dataset: { filter: 'expired' } } }]);
    assert.equal(data().categories[0].items[0].ingredientName, '牛奶'); capture('pantry-expired', '.pitem.expired');
  });
  const food = [{ itemId: 1, ingredientName: '番茄', amount: '2', unit: '个', cover: '/assets/ingredients/tomato.jpg', initial: '番', categoryKey: 'veg', sourceText: '来自 番茄鸡蛋炒香菇、番茄鸡蛋汤', pantryText: '家里还有 1 个' }, { itemId: 2, ingredientName: '香菇', amount: '200', unit: '克', cover: '', initial: '香', categoryKey: 'veg', sourceText: '来自 番茄鸡蛋炒香菇' }];
  page('shopping', 'pages/shopping/index', { tab: 'shopping', ingredientPhotos: { '番茄': '/assets/ingredients/tomato.jpg' }, ingredientPhotosFailed: false, shoppingList: { items: food }, summary: { totalCount: 3, purchasedCount: 1, progressPercent: 33 }, groupedPending: [{ key: 'veg', label: '蔬菜', items: food }], purchasedItems: [], groupedPurchased: [] }, () => {
    inside('.mkt-del', '.mkt-item', 'shopping'); inside('.mkt-tags', '.mkt-item', 'shopping-source'); shoppingActions('shopping-normal'); capture('shopping', '.mkt-item', 'app-shopping.jpg');
    nameAmount('.mkt-namebar .nm', '.mkt-namebar .amt', 'shopping-name-amount');
    patch({ fontScale: 'lg' }); inside('.mkt-del', '.mkt-item', 'shopping-large'); inside('.mkt-tags', '.mkt-item', 'shopping-source-large'); shoppingActions('shopping-large'); capture('shopping-large', '.mkt-item', 'app-shopping-large.jpg');
    patch({ fontScale: 'normal', newItem: { ingredientName: '', amount: '', unit: '' }, newItemCover: '', newItemCoverBroken: false });
    scroll(bounds('.mkt-addbar').top - 110);
    for (const selector of ['.mkt-draft-photo', '.mkt-add-fields', '.mkt-add-footer', '.mkt-addbtn']) inside(selector, '.mkt-addbar', 'shopping-form-' + selector);
    const photo = bounds('.mkt-draft-photo'), fields = bounds('.mkt-add-fields'), footer = bounds('.mkt-add-footer');
    assert.ok(photo.right <= fields.left + 1 && footer.top >= fields.bottom - 1, 'form photo stays left, fields right and actions below');
    capture('shopping-add-empty', '.mkt-addbar');
    patch({ newItem: { ingredientName: '番茄', amount: '2', unit: '个' }, newItemCover: '/assets/ingredients/tomato.jpg' });
    capture('shopping-add-photo', '.mkt-draft-photo');
    patch({ fontScale: 'lg', newItem: { ingredientName: '妈妈爱吃的新鲜香菇', amount: '200', unit: '克' }, newItemCover: '' });
    for (const selector of ['.mkt-draft-photo', '.mkt-add-fields', '.mkt-add-footer', '.mkt-addbtn']) inside(selector, '.mkt-addbar', 'shopping-form-large-' + selector);
    const placeholder = bounds('.mkt-draft-name'), photoHint = bounds('.mkt-draft-photo .mkt-photo-hint');
    assert.ok(placeholder.bottom <= photoHint.top + 1, 'long ingredient name stays above photo action');
    evidence.checks = evidence.checks.filter(item => item.name !== 'shopping-photo-long-name');
    evidence.checks.push({ name: 'shopping-photo-long-name', placeholder, photoHint, passed: true });
    capture('shopping-add-large', '.mkt-addbar');
  });
  evidence.passed = true;
} finally {
  if (cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path !== 'pages/home/index') {
    cli('automation_navigate', ['--action', 'switchTab', '--url', '/pages/home/index']);
  }
  fs.writeFileSync(evidenceFile, JSON.stringify(evidence, null, 2) + '\n');
}
console.log('Picker layouts and random interactions passed; runtime data restored.');
