const assert = require('node:assert/strict');
const api = require('../utils/api');
const originalApi = { ...api };
const photo = require('../utils/ingredient-photo');
const originalEdit = photo.editIngredientPhoto;
let definition, photosFail = false, stockFail = false, editResult;
let stockItems = [{ id: 1, ingredientName: '番茄', amount: '2', unit: '个' }];
let ingredientPhotos = { '番茄': '/uploaded/tomato.jpg' };
const edits = [];
const today = new Date();
const monthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01 18:30:00`;
const recipe = { id: 1, title: '番茄炒蛋', servings: 2, ingredients: [{ name: '番茄', amount: '2', unit: '个' }], steps: [], reviews: [] };
Object.assign(api, {
  getRecipeDetail: async () => recipe,
  getPantryItems: async () => { if (stockFail) throw new Error('offline'); return stockItems; },
  getPantryMatch: async () => [],
  getShoppingList: async () => ({ items: [{ itemId: 1, ingredientName: '番茄' }] }),
  getIngredientPhotos: async () => { if (photosFail) throw new Error('offline'); return ingredientPhotos; },
  getTodayMenu: async () => ({ items: [{ recipeId: 1, recipe, status: 'done' }] }),
  getCommunityPosts: async () => [],
  getCurrentUser: async () => ({ nickname: '掌勺人', avatarUrl: '/uploaded/avatar.jpg', wechatBound: true }),
  getFamilyProfile: async () => ({ familyName: '家', members: [] }),
  getCookHistory: async () => [{ id: 1, recipeTitle: '番茄炒蛋', cookedAt: monthDate }, { id: 2, cookedAt: '2000-01-01 18:00:00' }, { id: 3, cookedAt: 'invalid' }],
  getPreferenceProfile: async () => ({ totalCooks: 99 }),
  getDashboard: async () => ({ ownedRecipes: [recipe] })
});
photo.editIngredientPhoto = async (name, cover) => { edits.push({ name, cover }); if (editResult instanceof Error) throw editResult; return editResult; };
global.wx = { showToast() {}, showLoading() {}, hideLoading() {} };
global.Page = value => { definition = value; };
function page(module, privateFields = []) {
  require(module);
  assert.ok(Object.keys(definition.data).every(key => !privateFields.includes(key.replace(/^_/, ''))), '非渲染数据不放进 data 默认值');
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch, callback) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data;
      assert.ok(!privateFields.includes(parts[0].replace(/^_/, '')), 'setData 不发送食材照片表或原始库存');
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = value;
    }
    if (callback) callback();
  } };
}
(async () => {
  try {
    const detail = page('../pkg-extra/recipe-detail/index', ['ingredientPhotos']);
    photosFail = true;
    await detail.loadRecipe(1);
    assert.equal(detail.data.loadError, false, '初次加载照片失败不依赖 onLoad 初始化私有字段');
    assert.equal(detail.data.ingredientPhotosFailed, true);
    assert.deepEqual(detail._ingredientPhotos, {});
    assert.equal(detail.data.recipe.ingredients[0].cover, '');
    photosFail = false;
    await detail.loadRecipe(1);
    assert.equal(detail.data.recipe.ingredients[0].cover, '/uploaded/tomato.jpg');
    assert.equal(detail.data.recipe.ingredients[0].inStock, true);
    detail.changeServings({ currentTarget: { dataset: { delta: 1 } } });
    assert.equal(detail.data.recipe.ingredients[0].cover, '/uploaded/tomato.jpg', '改份数保留图片');
    assert.equal(detail.data.recipe.ingredients[0].inStock, false);
    for (const [servings, delta] of [[1, -1], [20, 1]]) {
      detail.setData({ servings });
      const before = JSON.stringify(detail.data);
      detail.changeServings({ currentTarget: { dataset: { delta } } });
      assert.equal(JSON.stringify(detail.data), before, '份数在上下限不改变用量或库存提示');
      detail.changeServings({ currentTarget: { dataset: { delta: -delta } } });
      assert.equal(detail.data.servings, servings - delta, '从上下限往范围内仍能正常调整');
      assert.equal(detail.data.recipe.ingredients[0].amountText, String(servings - delta));
    }
    photosFail = true;
    await detail.loadRecipe(1);
    assert.equal(detail.data.loadError, false, '照片接口失败不阻断整份菜谱');
    assert.equal(detail.data.ingredientPhotosFailed, true);
    assert.equal(detail.data.recipe.ingredients[0].cover, '/uploaded/tomato.jpg', '同步失败保留已有图');
    const event = { currentTarget: { dataset: { name: '番茄' } } };
    await detail.onIngredientPhoto(event);
    assert.equal(detail.data.recipe.ingredients[0].cover, '/uploaded/tomato.jpg', '取消上传保留图');
    editResult = new Error('save failed');
    await detail.onIngredientPhoto(event);
    assert.equal(detail.data.recipe.ingredients[0].cover, '/uploaded/tomato.jpg', '保存失败保留图');
    editResult = {};
    await detail.onIngredientPhoto(event);
    assert.equal(detail.data.recipe.ingredients[0].cover, '', '清除照片恢复文字');
    assert.deepEqual(detail._ingredientPhotos, {});
    assert.equal(detail.data.ingredientPhotosFailed, false);
    assert.ok(edits.every(edit => edit.name === '番茄' && edit.cover === '/uploaded/tomato.jpg'), '取消、失败和清除都传入私有照片表的当前图');
    editResult = { '番茄': '/uploaded/new-tomato.jpg' };
    await detail.onIngredientPhoto(event);
    assert.deepEqual(detail._ingredientPhotos, editResult);
    assert.equal(detail.data.recipe.ingredients[0].cover, editResult['番茄']);
    assert.equal(detail.data.recipe.ingredients[0].coverBroken, false);
    photosFail = false; ingredientPhotos = {};
    await detail.loadRecipe(1);
    assert.deepEqual(detail._ingredientPhotos, {}, '成功同步空照片表必须清掉旧图');
    assert.equal(detail.data.recipe.ingredients[0].cover, '');
    ingredientPhotos = { '番茄': '/uploaded/tomato.jpg' };

    for (const name of ['pantry', 'shopping']) {
      const stockPage = page(`../pages/${name}/index`, name === 'pantry' ? ['pantryItems', 'ingredientPhotos'] : ['ingredientPhotos']);
      const load = () => name === 'pantry' ? stockPage.loadPantry() : stockPage.loadShoppingList();
      const items = () => (name === 'pantry' ? stockPage.data.categories : stockPage.data.pantryCategories).flatMap(group => group.items);
      await load();
      assert.deepEqual(stockPage._ingredientPhotos, ingredientPhotos);
      assert.equal(items()[0].cover, '/uploaded/tomato.jpg');
      if (name === 'shopping') {
        stockPage.onNewItemInput({ currentTarget: { dataset: { field: 'ingredientName' } }, detail: { value: '番茄' } });
        assert.equal(stockPage.data.newItemCover, '/uploaded/tomato.jpg', '输入预览读取私有照片表');
      }
      editResult = undefined;
      await stockPage.editIngredientPhoto(event);
      editResult = new Error('save failed');
      await stockPage.editIngredientPhoto(event);
      assert.equal(items()[0].cover, '/uploaded/tomato.jpg', `${name}: 取消或保存失败保留原图`);
      assert.equal(stockPage._ingredientPhotos['番茄'], '/uploaded/tomato.jpg');
      assert.deepEqual(edits[edits.length - 1], { name: '番茄', cover: '/uploaded/tomato.jpg' });
      editResult = { '番茄': '/uploaded/new-tomato.jpg' };
      await stockPage.editIngredientPhoto(event);
      assert.equal(items()[0].cover, '/uploaded/new-tomato.jpg');
      if (name === 'shopping') {
        assert.equal(stockPage.data.groupedPending[0].items[0].cover, '/uploaded/new-tomato.jpg');
        assert.equal(stockPage.data.newItemCover, '/uploaded/new-tomato.jpg');
        assert.equal(stockPage.data.newItemCoverBroken, false);
      }
      editResult = {};
      await stockPage.editIngredientPhoto(event);
      assert.deepEqual(stockPage._ingredientPhotos, {});
      assert.equal(items()[0].cover, '', `${name}: 清除照片恢复文字`);
      photosFail = true;
      await load();
      assert.equal(stockPage.data.loadError, false);
      assert.equal(stockPage.data.ingredientPhotosFailed, true, `${name}: 照片失败状态仍传给视图`);
      assert.equal(items()[0].cover, '');
      if (name === 'pantry') {
        stockFail = true;
        await load();
        assert.equal(stockPage.data.loadError, true);
        assert.deepEqual(stockPage._pantryItems, [], '库存加载失败清空原始列表');
        stockPage.applyPantryFilter();
        assert.deepEqual(stockPage.data.categories, [], '失败后切筛选不能恢复旧库存');
        stockFail = false;
      }
      photosFail = false; stockItems = [];
      await load();
      assert.equal(stockPage.data.loadError, false);
      assert.deepEqual(items(), [], `${name}: 成功的空库存清空分组`);
      stockItems = [{ id: 1, ingredientName: '番茄', amount: '2', unit: '个' }];
    }
    const me = page('../pages/me/index');
    await me.loadProfile();
    assert.equal(me.data.monthCookCount, 1, '本月统计排除历史月份和无效日期');
    assert.equal(me.data.profile.nickname, '掌勺人');
    const postDetail = page('../pkg-extra/community/post-detail/index');
    postDetail.setData({ postId: '201', post: { author: '家人', title: '晚饭', images: ['/uploaded/work.jpg'], cover: '/recipe/cover.jpg' } });
    assert.equal(postDetail.onShareAppMessage().imageUrl, '/uploaded/work.jpg', '分享优先使用作者实拍');
    const community = page('../pages/community/index');
    assert.equal(community.normalizePosts([{ id: 1, recipe: { coverImage: '/recipe/cover.jpg' }, images: [] }])[0].photo, '', '菜谱封面不能冒充帖子实拍');
    console.log('ui-refinement.test ok: ingredient photos, servings, cancel/failure retention, true month count, menu overview and community image provenance');
  } finally {
    Object.assign(api, originalApi); photo.editIngredientPhoto = originalEdit;
    delete global.wx; delete global.Page;
  }
})().catch(err => { console.error(err); process.exitCode = 1; });
