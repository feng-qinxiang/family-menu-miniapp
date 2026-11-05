const assert = require('node:assert/strict');
const api = require('../utils/api');
const originalApi = { ...api };
const photo = require('../utils/ingredient-photo');
const originalEdit = photo.editIngredientPhoto;
let definition, photosFail = false, editResult;
const today = new Date();
const monthDate = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, '0')}-01 18:30:00`;
const recipe = { id: 1, title: '番茄炒蛋', servings: 2, ingredients: [{ name: '番茄', amount: '2', unit: '个' }], steps: [], reviews: [] };
Object.assign(api, {
  getRecipeDetail: async () => recipe,
  getPantryItems: async () => [{ name: '番茄', amount: '2', unit: '个' }],
  getIngredientPhotos: async () => { if (photosFail) throw new Error('offline'); return { '番茄': '/uploaded/tomato.jpg' }; },
  getTodayMenu: async () => ({ items: [{ recipeId: 1, recipe, status: 'done' }] }),
  getCommunityPosts: async () => [],
  getCurrentUser: async () => ({ nickname: '掌勺人', avatarUrl: '/uploaded/avatar.jpg', wechatBound: true }),
  getFamilyProfile: async () => ({ familyName: '家', members: [] }),
  getCookHistory: async () => [{ id: 1, recipeTitle: '番茄炒蛋', cookedAt: monthDate }, { id: 2, cookedAt: '2000-01-01 18:00:00' }, { id: 3, cookedAt: 'invalid' }],
  getPreferenceProfile: async () => ({ totalCooks: 99 }),
  getDashboard: async () => ({ ownedRecipes: [recipe] })
});
photo.editIngredientPhoto = async () => { if (editResult instanceof Error) throw editResult; return editResult; };
global.wx = { showToast() {}, showLoading() {}, hideLoading() {} };
global.Page = value => { definition = value; };
function page(module) {
  require(module);
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch, callback) {
    for (const [key, value] of Object.entries(patch)) {
      const parts = key.split('.'); let target = this.data;
      while (parts.length > 1) target = target[parts.shift()];
      target[parts[0]] = value;
    }
    if (callback) callback();
  } };
}
(async () => {
  try {
    const detail = page('../pkg-extra/recipe-detail/index');
    await detail.loadRecipe(1);
    assert.equal(detail.data.recipe.ingredients[0].cover, '/uploaded/tomato.jpg');
    assert.equal(detail.data.recipe.ingredients[0].inStock, true);
    detail.changeServings({ currentTarget: { dataset: { delta: 1 } } });
    assert.equal(detail.data.recipe.ingredients[0].cover, '/uploaded/tomato.jpg', '改份数保留图片');
    assert.equal(detail.data.recipe.ingredients[0].inStock, false);
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
    const me = page('../pages/me/index');
    await me.loadProfile();
    assert.equal(me.data.monthCookCount, 1, '本月统计排除历史月份和无效日期');
    assert.equal(me.data.profile.nickname, '掌勺人');
    assert.equal(me.data.todayDishes[0].title, '番茄炒蛋');
    assert.equal(me.data.todayDone, 1);
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
