// 内置菜图迁出小程序：旧路径兼容、上传优先、断网不覆盖原图、保存不写开发域名。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const root = path.resolve(__dirname, '../..');
const app = { globalData: { apiBaseUrl: 'https://images.example.test/' } };
global.getApp = () => app;
global.wx = { getStorageSync() {}, setStorageSync() {}, showToast() {}, navigateBack() {}, disableAlertBeforeUnload() {}, showModal: async () => ({ confirm: true }) };
const image = require('../utils/image');
const { LOCAL_DISHES, localPath, dishImageUrl, dishImagePath, recipeDishImg, stepDishImg, DISH_PLACEHOLDER } = image;
const base = 'https://images.example.test';
const uploaded = 'https://photos.example.test/my-dish.jpg?width=300';
const stock = '/assets/dishes/tomato-egg.jpg';
const relativeUpload = '/uploads/photo.jpg?e=2000000000&k=' + require('node:crypto').randomBytes(32).toString('hex');
assert.equal(LOCAL_DISHES.length, 19);
for (const name of LOCAL_DISHES) {
  const bytes = fs.readFileSync(path.join(root, 'server/src/main/resources/static/assets/dishes', name + '.jpg'));
  assert.equal(bytes[0], 0xff);
  assert.equal(bytes[1], 0xd8);
  assert.equal(localPath(name), `${base}/assets/dishes/${name}.jpg`);
}
assert.equal(fs.existsSync(path.join(root, 'miniapp/assets/dishes')), false);
assert.equal(fs.existsSync(path.join(root, 'miniapp/pkg-preview')), false);
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'miniapp/app.json'), 'utf8'));
assert.ok(manifest.subpackages.every(p => p.root !== 'pkg-preview'));
assert.ok(fs.existsSync(path.join(root, 'miniapp', DISH_PLACEHOLDER)));
assert.equal(dishImageUrl(stock), base + stock);
assert.equal(dishImageUrl(base + stock), base + stock, '已补域名不能再补一遍');
assert.equal(dishImageUrl(uploaded), uploaded);
assert.equal(dishImageUrl('wxfile://local-photo'), 'wxfile://local-photo');
assert.equal(dishImageUrl(''), '');
assert.equal(recipeDishImg({ title: '番茄炒蛋', coverImage: uploaded }), uploaded, '用户实拍始终优先');
assert.equal(recipeDishImg({ coverImage: stock }), base + stock);
assert.equal(recipeDishImg({ title: '番茄炒蛋' }), base + stock);
// 没有对得上的内置照片就给占位图：文件名像、内容不是这道菜的照片不算（hongshao-pork 拍的是青红椒咕咾肉）。
for (const title of ['红烧肉', '可乐鸡翅', '蒜蓉西兰花', '糖醋排骨', '谁也没听过的菜']) {
  assert.equal(recipeDishImg({ id: 7, title }), DISH_PLACEHOLDER, title + ' 没有照片时不能借别的菜的图');
}
assert.equal(recipeDishImg({ title: '牛肉炒西兰花' }), base + '/assets/dishes/beef-broccoli.jpg', '带「西兰花」的菜只认整道菜对得上的照片');
assert.equal(image.fallbackDishImg(42), DISH_PLACEHOLDER, '按编号兜底不再轮着挑别的菜');
const seedSql = fs.readFileSync(path.join(root, 'server/src/main/resources/data.sql'), 'utf8');
for (const [id, title] of [[2, '红烧肉'], [5, '可乐鸡翅'], [7, '蒜蓉西兰花'], [8, '糖醋排骨']]) {
  assert.match(seedSql, new RegExp(`^\\(${id}, '${title}', .*, NULL, 'ACTIVE'\\)[,;]$`, 'm'), title + ' 的种子封面必须留空');
  assert.match(seedSql, new RegExp(`UPDATE recipe SET cover_image = NULL WHERE id = ${id} AND title = '${title}'`), title + ' 的老库封面也要清掉');
}
assert.equal(stepDishImg({}, 0, stock), base + stock);
assert.equal(stepDishImg({ title: '番茄炒蛋', coverImage: stock }, 0, ''), '', '步骤没图就不画，不能拿成品图顶替');
assert.equal(stepDishImg({}, 0, uploaded), uploaded);
assert.equal(dishImageUrl(relativeUpload), base + relativeUpload, '真实上传回包补域名但保留签名');
assert.equal(recipeDishImg({ title: '番茄炒蛋', coverImage: relativeUpload }), base + relativeUpload);
assert.equal(stepDishImg({}, 0, relativeUpload), base + relativeUpload);
assert.equal(dishImageUrl('/uploads-other/photo.jpg'), '/uploads-other/photo.jpg');
assert.equal(dishImagePath(base + stock), stock);
assert.equal(dishImagePath(stock), stock);
assert.equal(dishImagePath(uploaded), uploaded);
assert.equal(dishImagePath(base + '.other.example.test' + stock), base + '.other.example.test' + stock, '不得去掉别人的域名');
app.globalData.apiBaseUrl = 'https://second.example.test';
assert.equal(localPath('tomato-egg'), 'https://second.example.test' + stock, '图片跟随唯一环境配置，不在模块加载时锁定域名');
app.globalData.apiBaseUrl = base;

function patch(data, values) {
  for (const [key, value] of Object.entries(values)) {
    const keys = key.replace(/\[(\d+)\]/g, '.$1').split('.');
    let target = data;
    for (let i = 0; i < keys.length - 1; i++) {
      if (target[keys[i]] == null) target[keys[i]] = /^\d+$/.test(keys[i + 1]) ? [] : {};
      target = target[keys[i]];
    }
    target[keys[keys.length - 1]] = value;
  }
}
function page(module) {
  let definition;
  global.Page = p => { definition = p; };
  delete require.cache[require.resolve(module)];
  require(module);
  delete global.Page;
  return { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(values, done) { patch(this.data, values); if (done) done(); } };
}
const event = dataset => ({ currentTarget: { dataset } });
const fallbackPage = { data: { cover: base + stock }, setData(values) { patch(this.data, values); } };
image.onImgError(null, fallbackPage, 'cover');
assert.equal(fallbackPage.data.cover, DISH_PLACEHOLDER, '失败后不能再请求另一张网络图');
image.onImgError(null, fallbackPage, 'cover');
assert.equal(fallbackPage.data.cover, DISH_PLACEHOLDER);
const feed = page('../pages/community/index');
const post = { id: 1, images: [stock], recipe: { coverImage: stock } };
assert.equal(feed.normalizePosts([post])[0].photo, base + stock);
assert.equal(feed.normalizePosts([post])[0].recipeThumb, base + stock);
assert.equal(feed.normalizePosts([{ id: 2 }])[0].photo, '', '无图帖子仍不配假图');
const home = page('../pages/home/index');
home.data.currentSlot = 'dinner';
home.data.todayMenu = [{ recipeId: 1, mealType: 'dinner', status: 'todo', title: '番茄炒蛋', dishImg: stock }];
home.updateSlotMenu();
assert.equal(home.data.homeMenuItems[0].dishImg, base + stock, '升级前首页缓存中的包内路径也能显示');
home.data.heroRecipe = { title: '番茄炒蛋', dishImg: base + stock };
home.onHeroImgError();
assert.equal(home.data.heroRecipe.dishImg, DISH_PLACEHOLDER);
// 首页推荐：大图只挑有照片的菜；下面那排有照片的在前、没照片的在后，且不重复大图那道。
const mixed = ['红烧肉', '番茄炒蛋', '可乐鸡翅', '麻婆豆腐'].map((title, i) => ({ id: i + 1, title, dishImg: recipeDishImg({ title }) }));
for (let turn = 0; turn < 3; turn++) {
  home._heroOffset = turn;
  const picked = home._filterPatch('all', mixed);
  assert.notEqual(picked.heroRecipe.dishImg, DISH_PLACEHOLDER, '大图推荐不能是占位图');
  const row = picked.visibleRecipes.map(r => r.dishImg === DISH_PLACEHOLDER);
  assert.deepEqual(row, [false, true, true], '有照片的排前面');
  assert.ok(picked.visibleRecipes.every(r => r.id !== picked.heroRecipe.id));
}
home._heroOffset = 1;
const bare = home._filterPatch('all', mixed.filter(r => r.dishImg === DISH_PLACEHOLDER));
assert.equal(bare.visibleRecipes.length, 1, '全都没照片时照常轮换，不丢菜');
assert.notEqual(bare.heroRecipe.id, bare.visibleRecipes[0].id);
home._heroOffset = 0;

// 直接核对模板绑定并执行真实页面处理器，防止只测 helper 却漏掉页面接线。
for (const [module, className, expectedPath] of [
  ['pkg-extra/recipe-detail/index', 'rd-hero-img', 'recipe.coverBroken'],
  ['pkg-extra/recipe-detail/index', 'rd-video-poster', 'recipe.coverBroken'],
  ['pkg-extra/recipe-detail/index', 'rd-work-thumb', 'works[0].coverBroken'],
  ['pages/cook-log/index', 'thumb-img', 'visibleGroups[1].items[0].coverBroken'],
  ['pages/me/index', 'mag-thumb', 'cookHistory[0].coverBroken'],
  ['pkg-extra/kitchen/index', 'k-img', 'items[0].coverBroken'],
  ['pkg-extra/favorites/index', 'fav-pthumb', 'posts[0].coverBroken']
]) {
  const template = fs.readFileSync(path.join(root, 'miniapp', module + '.wxml'), 'utf8');
  const tag = template.match(/<image\b[^>]*>/g).find(value => value.includes('class="' + className));
  assert.ok(tag && tag.includes('img-broken'), className + ' 必须有失败占位分支');
  const handler = tag.match(/binderror="([^"]+)"/);
  assert.ok(handler, className + ' 必须绑定图片失败事件');
  let key = tag.match(/data-err-key="([^"]+)"/)[1];
  if (key.startsWith('{{')) key = require('node:vm').runInNewContext(key.slice(2, -2), { index: 0, groupIndex: 1 });
  assert.equal(key, expectedPath, '分组下标与行下标不能串位');
  const target = page('../' + module);
  let sent;
  target.setData = values => { sent = values; patch(target.data, values); };
  target[handler[1]](event({ errKey: key, id: 9 }));
  assert.deepEqual(sent, { [expectedPath]: true }, className + ' 只能更新失败标记');
}
const picker = page('../pages/recipes/index');
picker.data.pickedRecipe = { id: 1, cover: base + stock };
assert.match(fs.readFileSync(path.join(root, 'miniapp/pages/recipes/index.wxml'), 'utf8'), /rx-picked-thumb[^>]*binderror="onPickedImgError"/);
picker.onPickedImgError();
assert.equal(picker.data.pickedRecipe.cover, DISH_PLACEHOLDER);
const log = page('../pages/cook-log/index');
log.buildView([{ id: 9, recipeTitle: '番茄炒蛋', coverImage: stock, cookedAt: '2026-11-06' }]);
log.data.visibleGroups = structuredClone(log.data.visibleGroups);
log.onPhotoError(event({ id: 9, errKey: 'visibleGroups[0].items[0].coverBroken' }));
log.applyFilter();
assert.equal(log.data.visibleGroups[0].items[0].coverBroken, true, '记录切换筛选后保留失败占位');
const kitchen = page('../pkg-extra/kitchen/index');
kitchen.data.activeMeal = 'dinner';
kitchen.data.groups = [{ meal: 'dinner', items: [{ id: 9, status: 'todo', img: base + stock }] }];
kitchen.applyActive();
kitchen.onPhotoError(event({ id: 9, errKey: 'items[0].coverBroken' }));
kitchen.applyActive();
assert.equal(kitchen.data.items[0].coverBroken, true, '厨房重算当前餐次后保留失败占位');

async function main() {
  const api = require('../utils/api');
  const original = Object.fromEntries(['getRecipeDetail', 'updateRecipe', 'saveRecipe', 'getPantryItems', 'getTodayMenu', 'getCommunityPosts', 'getIngredientPhotos'].map(key => [key, api[key]]));
  const features = require('../utils/features');
  const community = features.COMMUNITY;
  let payload;
  try {
    const source = { id: 1, title: '番茄炒蛋', cuisine: '家常', coverImage: stock, tasteTags: ['家常'], ingredients: [{ name: '鸡蛋', amount: '2', unit: '个' }], steps: [{ text: '炒熟', image: stock }] };
    api.getRecipeDetail = async () => structuredClone(source);
    api.updateRecipe = async (id, value) => { payload = value; return { id }; };
    api.saveRecipe = async value => { payload = value; return { id: 2 }; };
    const edit = page('../pkg-extra/recipe-edit/index');
    edit.data.isEdit = true;
    edit.data.recipeId = 1;
    await edit.loadRecipe(1);
    assert.equal(edit.data.form.coverImage, base + stock);
    assert.equal(edit.data.form.steps[0].image, base + stock);
    edit.chooseCover();
    assert.equal(edit.data.pickerImages.length, 19, '旧封面不重复出现在选图池');
    edit.onImageError(event({ errKey: 'coverFailedUrl', url: base + stock }));
    edit.onImageError(event({ errKey: 'stepImageErrors[0]', url: base + stock }));
    assert.equal(edit.data.form.coverImage, base + stock, '加载失败不能改原表单照片');
    assert.equal(edit.data.form.steps[0].image, base + stock);
    await edit.submit();
    edit.onUnload();
    assert.equal(payload.coverImage, stock, '保存仍是可跨环境的路径');
    assert.equal(payload.steps[0].image, stock);
    assert.notEqual(payload.coverImage, DISH_PLACEHOLDER);
    for (const title of ['我家红烧肉', '番茄炒蛋']) {
      api.getRecipeDetail = async () => ({ ...structuredClone(source), title, coverImage: '' });
      const bare = page('../pkg-extra/recipe-edit/index');
      bare.data.isEdit = true;
      bare.data.recipeId = 1;
      await bare.loadRecipe(1);
      assert.equal(bare.data.form.coverImage, '', `${title}：没封面时编辑页不放假封面，露出「添加封面」`);
      await bare.submit();
      bare.onUnload();
      assert.equal(payload.coverImage, '', `${title}：没封面的菜保存后封面还是空的`);
    }
    api.getRecipeDetail = async () => structuredClone(source);
    edit.chooseCover();
    edit.pickLocalImage(event({ url: base + stock }));
    assert.equal(edit.data.coverFailedUrl, '', '重新选择同一封面必须恢复请求');
    edit.chooseStepImage(event({ index: 0 }));
    edit.pickLocalImage(event({ url: base + stock }));
    assert.equal(edit.data.stepImageErrors[0], '', '重新选择同一步骤图必须恢复请求');
    edit.chooseCover();
    edit.onImageError(event({ errKey: 'coverFailedUrl', url: base + stock }));
    edit._applyUpload('wxfile://photo', base + stock);
    assert.equal(edit.data.coverFailedUrl, '', '重传后也清除旧失败标记');
    edit.chooseStepImage(event({ index: 0 }));
    edit.onImageError(event({ errKey: 'stepImageErrors[0]', url: base + stock }));
    edit._applyUpload('wxfile://photo', base + stock);
    assert.equal(edit.data.stepImageErrors[0], '');
    edit.onImageError(event({ errKey: 'coverFailedUrl', url: base + stock }));
    await edit.removeCover();
    assert.equal(edit.data.coverFailedUrl, '');
    edit.onImageError(event({ errKey: 'stepImageErrors[0]', url: base + stock }));
    await edit.removeStepImage(event({ index: 0 }));
    assert.equal(edit.data.stepImageErrors[0], '');
    edit.data.form.steps = [{ text: '第一步', image: base + stock }, { text: '第二步', image: uploaded }];
    edit.data.stepImageErrors = [base + stock, uploaded];
    await edit.removeStep(event({ index: 0 }));
    assert.deepEqual(edit.data.stepImageErrors, [uploaded], '删除步骤后失败标记必须跟随原来的图片');

    for (const cover of ['https://images.unsplash.com/photo-existing', uploaded, relativeUpload]) {
      source.coverImage = cover;
      source.steps[0].image = cover;
      const existing = page('../pkg-extra/recipe-edit/index');
      existing.data.isEdit = true;
      existing.data.recipeId = 1;
      await existing.loadRecipe(1);
      assert.equal(existing.data.form.coverImage, dishImageUrl(cover), '表单必须保留原封面，不能拿展示兜底覆盖原值');
      existing.data.form.title = '改个菜名';
      await existing.submit();
      existing.onUnload();
      assert.equal(payload.coverImage, dishImageUrl(cover));
      assert.equal(payload.steps[0].image, dishImageUrl(cover));
    }
    features.COMMUNITY = true;
    api.getPantryItems = async () => [];
    api.getTodayMenu = async () => ({ items: [] });
    api.getIngredientPhotos = async () => ({});
    api.getCommunityPosts = async () => [{ id: 3, images: [stock] }, { id: 4, images: [relativeUpload] }, { id: 5 }];
    const detail = page('../pkg-extra/recipe-detail/index');
    await detail.loadRecipe(1);
    assert.equal(detail.data.works[0].cover, base + stock, '大家晒的也兼容迁移前的菜图路径');
    assert.equal(detail.data.works[1].cover, base + relativeUpload);
    assert.equal(detail.data.works[2].cover, '', '无照片作品仍不配假图');
    const importer = page('../pkg-extra/import/index');
    importer.data.preview = { title: '番茄炒蛋', coverImage: base + stock, ingredients: [{ name: '鸡蛋' }], steps: [{ text: '炒熟', image: base + stock }] };
    importer.onPreviewImageError(event({ errKey: 'coverFailedUrl', url: base + stock }));
    await importer.saveImport();
    importer.onUnload();
    assert.equal(payload.coverImage, stock);
    assert.equal(payload.steps[0].image, stock);
  } finally {
    features.COMMUNITY = community;
    Object.assign(api, original);
    delete global.getApp;
    delete global.wx;
    delete global.Page;
  }
  console.log('dish-images.test ok: 19 assets, URL compatibility, offline placeholders, cache upgrade, safe saves');
}
main().catch(err => { console.error(err); process.exitCode = 1; });
