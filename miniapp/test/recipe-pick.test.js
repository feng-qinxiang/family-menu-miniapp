// node miniapp/test/recipe-pick.test.js — 真正的 Page 方法，网络与点菜写入只用替身。
const assert = require('node:assert/strict');
const { daysLeft, expiryText, pantrySummary, normalizeMatches } = require('../utils/pantry-match');
const { todayDateKey } = require('../utils/dish-logic');
const { ingredientImage } = require('../utils/image');
const api = require('../utils/api');
const originalApi = { ...api };
const navigate = [];
const writes = [];
let failMatch = false, failStock = false, emptyStock = false, failAdd = false, releaseAdd;
const today = new Date();
const date = delta => todayDateKey(new Date(today.getFullYear(), today.getMonth(), today.getDate() + delta));
const stocks = [
  { id: 1, ingredientName: '番茄', amount: '2', unit: '个', expiresAt: date(0) },
  { id: 2, ingredientName: '鸡蛋', amount: '3', unit: '个', expiresAt: date(-1) },
  { id: 3, ingredientName: '米', amount: '1', unit: '杯', expiresAt: '' }
];
const recipes = [
  { id: 1, title: '番茄炒蛋', timeCost: 15, servings: 2, cuisine: '家常' },
  { id: 2, title: '清炒时蔬', timeCost: 10, servings: 2, cuisine: '家常' },
  { id: 3, title: '米饭', timeCost: 20, servings: 2, cuisine: '主食' },
  { id: 4, title: '香辣鸡丁', timeCost: 25, servings: 2, cuisine: '川菜', tasteTags: ['辣'] },
  { id: 5, title: '番茄汤', timeCost: 10, servings: 2, cuisine: '家常' }
];
const match = (id, full = true, expiring = []) => ({
  recipe: recipes.find(recipe => recipe.id === id), totalCount: 2, matchedCount: full ? 2 : 1,
  matchRate: full ? 1 : 0.5, missingIngredients: full ? [] : ['鸡蛋'], expiringIngredients: expiring
});
Object.assign(api, {
  getPantryItems: async () => { if (failStock) throw new Error('offline'); return emptyStock ? [] : stocks; },
  getPantryMatch: async () => { if (failMatch) throw new Error('offline'); return emptyStock ? [] : [match(1, true, ['番茄']), match(2, false), match(3), match(4), match(5, true, ['番茄'])]; },
  addTodayMenuRecipe: async (id, meal) => { writes.push({ id, meal }); if (failAdd) throw new Error('write failed'); await new Promise(resolve => { releaseAdd = resolve; }); }
});
global.wx = {
  getStorageSync() { return ''; },
  setStorageSync(key, value) { this.savedPreference = { key, value }; },
  navigateTo(options) { navigate.push(options.url); },
  showToast() {}, showLoading() {}, hideLoading() {},
  async showActionSheet() { throw new Error('cancel'); }
};
let definition;
global.Page = value => { definition = value; };
function page(module, privateFields = []) {
  require(module);
  assert.ok(Object.keys(definition.data).every(key => !privateFields.includes(key.replace(/^_/, ''))), '仅供 JS 使用的字段不放进 data 默认值');
  return Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    patches: [],
    setData(patch, callback) {
      this.patches.push(Object.keys(patch));
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.replace(/\[(\d+)\]/g, '.$1').split('.');
        assert.ok(!privateFields.includes(parts[0].replace(/^_/, '')), 'setData 不发送私有原始数据');
        let target = this.data;
        while (parts.length > 1) target = target[parts.shift()];
        target[parts[0]] = value;
      }
      if (callback) callback();
    }
  });
}
const event = data => ({ currentTarget: { dataset: data } });

(async () => {
  try {
    assert.equal(daysLeft('2026-10-08', new Date(2026, 9, 8, 23, 59)), 0);
    assert.equal(daysLeft('2026-10-09', new Date(2026, 9, 8, 0, 1)), 1);
    assert.equal(daysLeft('invalid'), null);
    assert.equal(expiryText(null), '未填到期日');
    assert.equal(expiryText(0), '今天到期 · 先用');
    assert.deepEqual(pantrySummary(stocks), { count: 3, expiringCount: 1, expiredCount: 1, undatedCount: 1, priorityText: '番茄' });
    assert.equal(normalizeMatches([{ recipe: recipes[0], matchRate: 1 }])[0].full, false, '没有权威用料数不能假定食材齐全');
    assert.equal(normalizeMatches([{ ...match(1), missingIngredients: ['盐'] }])[0].full, false);
    assert.equal(ingredientImage({ ingredientName: '西红柿' }), '', '未上传的食材使用名称，不自动配图');
    assert.equal(ingredientImage({ ingredientName: '鸡蛋' }, { '鸡蛋': '/uploaded/egg.jpg' }), '/uploaded/egg.jpg');
    assert.equal(ingredientImage({ ingredientName: '牛奶' }), '', '没有原食材图片就交给文字兜底');
    assert.equal(ingredientImage({ ingredientName: '番茄酱' }), '', '不能把加工品误配为原食材');
    assert.equal(ingredientImage({ ingredientName: '番茄', coverImage: '/uploaded/stock.jpg' }), '/uploaded/stock.jpg', '条目自身图片优先');

    const p = page('../pages/recipes/index', ['pantryMatches']);
    p.applyFilter();
    assert.deepEqual(p.data.displayedRecipes, [], 'onLoad 前缺省的匹配列表也能安全筛选');
    p.onLoad({ pick: 'pantry', meal: 'lunch', q: '' });
    assert.equal(p.data.activeMealType, 'lunch');
    assert.equal(p.data.mealIndex, 1);
    p._recipes = recipes.map(recipe => p.normalizeRecipe(recipe, []));
    p.setData({ loading: false, avoidTags: ['辣'] });
    await p.loadPantryChoices();
    assert.equal(p.data.showPantryDetails, true);
    assert.match(p._filteredRecipes[0].pantryStatus, /食材齐全/);
    p.togglePantryDetails({ detail: { value: false } });
    assert.equal(p.data.showPantryDetails, false);
    assert.deepEqual(wx.savedPreference, { key: 'recipe_pantry_details', value: false });
    assert.deepEqual(p._filteredRecipes.map(recipe => recipe.id), [1, 3, 5], '排除缺料和家人忌口');
    assert.ok([1, 5].includes(p.data.pickedRecipe.id), '有临期时优先挑能用掉它的菜');
    const first = p.data.pickedRecipe.id;
    p.pickRandom();
    assert.notEqual(p.data.pickedRecipe.id, first, '多道候选时换一道不重复当前菜');
    assert.equal(writes.length, 0, '随机、切换均不会直接写菜单');
    assert.equal(p.data.pantryItems[0].ingredientName, '番茄');
    assert.equal(p.data.pantryItems[0].amountText, '2个');

    failAdd = true;
    const selected = p.data.pickedRecipe.id;
    await p.addPickedRecipe();
    assert.equal(p.data.pickedRecipe.id, selected, '保存失败保留推荐供重试');
    assert.equal(p.data.todayDishIds.length, 0);
    failAdd = false;
    const add = p.addPickedRecipe();
    const duplicate = p.addPickedRecipe();
    assert.equal(writes.length, 2, '一次失败加一次在途请求；连点不再发第三次');
    releaseAdd();
    await Promise.all([add, duplicate]);
    assert.equal(writes[1].meal, 'lunch');
    assert.ok(p.data.todayDishIds.includes(String(selected)));
    assert.notEqual(p.data.pickedRecipe.id, selected, '已点过的菜从随机候选排除');
    p.pickRandom();
    assert.equal(p.data.pickedRecipe.id, 3, '仅剩一道临期推荐时，换一道仍可查看其他食材齐全的菜');

    p.openPicker(event({ mode: 'all' }));
    p.setData({ searchText: '米饭' }); p.applyFilter();
    assert.equal(p.data.pickedRecipe.id, 3, '随机也遵守搜索条件');
    p.setData({ todayDishIds: recipes.map(recipe => String(recipe.id)) }); p.applyFilter();
    assert.equal(p.data.pickedRecipe, null, '全部点过时不自动重复加菜');
    assert.equal(p.data.pickCount, 0);

    failMatch = true;
    p.openPicker(event({ mode: 'pantry' }));
    await p.loadPantryChoices();
    assert.equal(p.data.pantryFailed, true, '网络失败保留明确的失败态');
    assert.equal(p.data.pantryStockFailed, false);
    assert.equal(p.data.pantryItems.length, stocks.length, '匹配失败不丢掉已经读到的库存');
    assert.equal(p.data.pickedRecipe, null, '匹配失败不退回随便推荐');
    p.closePicker();
    p.setData({ searchText: '', todayDishIds: [] }); p.applyFilter();
    assert.equal(p._filteredRecipes[0].pantryStatus, '用料暂未确认', '网络失败不能伪装为没材料');
    assert.ok(p._filteredRecipes.length, '库存接口失败不阻断普通挑菜');
    failMatch = false; failStock = true;
    await p.loadPantryChoices();
    assert.equal(p.data.pantryStockFailed, true, '库存读取失败不能显示为空冰箱');
    assert.equal(p.data.pantryFailed, true, '库存读取失败不使用未确认的匹配结果');
    failStock = false; emptyStock = true;
    await p.loadPantryChoices();
    assert.equal(p.data.pantryStockFailed, false);
    assert.equal(p.data.pantryFailed, false, '空库存不是接口失败');
    assert.equal(p.data.pantrySummary.count, 0);
    assert.deepEqual(p.data.pantryItems, []);
    emptyStock = false;

    // 真实 Page 的按需挑菜：只确认条件和挑选，不自动写入菜单。
    const beforeRequestWrites = writes.length;
    p.clearFilter();
    p._recipes = [
      p.normalizeRecipe({ id: 7, title: '蒸蛋', timeCost: 15, servings: 2, cuisine: '家常', tasteTags: ['清淡'] }, []),
      p.normalizeRecipe({ id: 8, title: '未填耗时', servings: 2, tasteTags: ['清淡'] }, []),
      p.normalizeRecipe({ id: 9, title: '未填人份', timeCost: 15, tasteTags: ['清淡'] }, []),
      p.normalizeRecipe({ id: 10, title: '香辣鸡丁', timeCost: 15, servings: 2, tasteTags: ['辣'] }, [])
    ];
    p.setData({ todayDishIds: [], avoidTags: [] });
    p.openMealRequest();
    p.onMealRequestInput({ detail: { value: '两人吃，30分钟，不辣，晚餐' } });
    assert.equal(p.data.requestPreview.canApply, true);
    p.closeMealRequest(); p.openMealRequest();
    assert.equal(p.data.requestText, '两人吃，30分钟，不辣，晚餐', '关闭弹层保留草稿');
    p.applyMealRequest();
    assert.equal(p.data.requestOpen, false);
    assert.equal(p.data.activeMealType, 'dinner');
    assert.deepEqual(p._filteredRecipes.map(r => r.id), [7], '未知耗时、人份与辣味菜都不能混入');
    assert.equal(p.data.pickedRecipe.id, 7);
    assert.equal(writes.length, beforeRequestWrites, '识别、预览和随机均不调用点菜写入');
    p.openMealRequest();
    p.onMealRequestInput({ detail: { value: '两人，花生过敏' } });
    p.applyMealRequest();
    assert.equal(p.data.requestOpen, true, '未支持的要求阻止应用条件');
    assert.equal(p.data.pickedRecipe.id, 7, '无效要求不改动原推荐');
    p.onMealRequestInput({ detail: { value: '两人，30分钟，冰箱有的' } });
    p.setData({ pantryFailed: true }); p.applyMealRequest();
    assert.equal(p.data.pickedRecipe, null, '库存失败时按需挑菜不退回普通随机');
    p.clearFilter();
    assert.equal(p.data.requestMildOnly, false, '重置会清除按需口味条件');
    p.selectRailMode({ currentTarget: { dataset: {} }, detail: { value: '1' } });
    assert.equal(p.data.railMode, 'source', '原生 picker 切换分类维度');

    const fridge = page('../pages/pantry/index', ['pantryItems', 'ingredientPhotos']);
    fridge.applyPantryFilter();
    fridge.onPhotoError(event({ id: 1 }));
    assert.deepEqual(fridge.data.categories, [], 'onLoad 前筛选和坏图事件按空库存处理');
    fridge.toggleReminder(); assert.equal(fridge.data.reminderExpanded, true);
    fridge.toggleReminder(); assert.equal(fridge.data.reminderExpanded, false);
    fridge._pantryItems = fridge.enrichPantryItems(stocks);
    fridge.setData({ pantryFilter: 'expiring' });
    fridge.applyPantryFilter();
    assert.deepEqual(fridge.data.categories.flatMap(category => category.items).map(item => item.id), [1]);
    fridge.selectPantryFilter(event({ filter: 'expired' }));
    assert.deepEqual(fridge.data.categories.flatMap(category => category.items).map(item => item.id), [2]);
    fridge.goRandomPick();
    assert.equal(navigate.pop(), '/pages/recipes/index?pick=pantry');
    fridge.clearExpiry();
    assert.equal(fridge.data.editDraft.expiresAt, '');
    fridge.selectPantryFilter(event({ filter: 'all' }));
    // 断开原始列表与视图的对象引用，避免测试替身共享引用掩盖漏掉的定向更新或私有状态同步。
    fridge.data.categories = structuredClone(fridge.data.categories);
    const beforePhotoError = fridge.patches.length;
    fridge.onPhotoError(event({ id: 1 }));
    assert.deepEqual(fridge.patches.slice(beforePhotoError), [['categories[0].items[0].coverBroken']], '坏图仅更新目标行，不重传库存或分组');
    assert.equal(fridge.data.categories.flatMap(cat => cat.items).find(item => item.id === 1).coverBroken, true, '图片失败后显示文字');
    assert.equal(fridge._pantryItems.find(item => item.id === 2).coverBroken, false, '其他食材不受影响');
    fridge.selectPantryFilter(event({ filter: 'expiring' }));
    assert.equal(fridge.data.categories[0].items[0].coverBroken, true, '切换筛选仍保留文字兜底');
    const beforeHiddenError = fridge.patches.length;
    fridge.onPhotoError(event({ id: 2 }));
    fridge.onPhotoError(event({ id: 'missing' }));
    assert.equal(fridge.patches.length, beforeHiddenError, '已隐藏或不存在的食材不改当前行');
    fridge.selectPantryFilter(event({ filter: 'expired' }));
    assert.equal(fridge.data.categories[0].items[0].coverBroken, true, '隐藏项的坏图状态也保留在原始列表');
    assert.deepEqual(fridge.groupByCategory([{ id: 9, ingredientName: '盐' }]).map(cat => cat.key), ['seasoning'], '调味库存不能因分类 key 不一致而消失');
    const stockActions = [];
    fridge.openEditSheet = e => stockActions.push({ action: 'edit', id: e.currentTarget.dataset.id });
    await fridge.openItemActions(event({ id: 1 }));
    assert.deepEqual(stockActions, [], '取消管理菜单不改变库存');
    wx.showActionSheet = async () => ({ tapIndex: 0 });
    await fridge.openItemActions(event({ id: 1 }));
    assert.deepEqual(stockActions, [{ action: 'edit', id: 1 }]);
    let confirmationCount = 0;
    wx.showModal = async () => { confirmationCount++; return { confirm: false }; };
    wx.showActionSheet = async () => ({ tapIndex: 1 });
    await fridge.openItemActions(event({ id: 1 }));
    assert.equal(confirmationCount, 1, '删除入口仍经过原来的二次确认');
    assert.equal(fridge._pantryItems.length, stocks.length, '取消删除保留所有库存');
    wx.showActionSheet = async () => { throw new Error('cancel'); };
    const shopping = page('../pages/shopping/index', ['ingredientPhotos']);
    shopping.setPantryView([{ id: 9, ingredientName: '盐' }]);
    assert.equal(shopping.data.pantryCategories[0].key, 'seasoning');
    shopping._ingredientPhotos = { '番茄': '/uploaded/tomato.jpg' };
    const boughtIngredients = shopping.enrichItems([
      { ingredientName: '番茄', sourceRecipes: ['番茄炒蛋'] },
      { ingredientName: '牛奶', sourceRecipes: ['番茄炒蛋'] }
    ], { todayMenu: { items: [{ recipe: { title: '番茄炒蛋', coverImage: '/assets/dishes/tomato-egg.jpg' } }] } });
    assert.equal(boughtIngredients[0].cover, '/uploaded/tomato.jpg', '买菜图显示原食材，来源菜谱封面不能代替食材');
    assert.equal(boughtIngredients[1].cover, '', '没有食材图就显示文字');
    assert.equal(boughtIngredients[0].sourceText, '来自 番茄炒蛋');

    const home = page('../pages/home/index');
    home.setData({ currentSlot: 'lunch', homeSearchText: '番茄 & 鸡蛋' });
    home.searchRecipes();
    assert.equal(navigate.pop(), `/pages/recipes/index?q=${encodeURIComponent('番茄 & 鸡蛋')}&meal=lunch`);
    home.goRandomPick(); assert.equal(navigate.pop(), '/pages/recipes/index?pick=random&meal=lunch');
    home.goPantryPick(); assert.equal(navigate.pop(), '/pages/recipes/index?pick=pantry&meal=lunch');
    let edits = 0;
    home.editWish = () => { edits++; };
    await home.openWishActions(event({ id: 1 }));
    assert.equal(edits, 0, '取消更多菜单不改心愿');
    wx.showActionSheet = async () => ({ tapIndex: 0 });
    await home.openWishActions(event({ id: 1 }));
    assert.equal(edits, 1);
    console.log('recipe-pick.test ok: expiry, full matches, urgent priority, random filters, failure retention, duplicate guard, stock filters and routes');
  } finally {
    Object.assign(api, originalApi);
    delete global.Page; delete global.wx;
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
