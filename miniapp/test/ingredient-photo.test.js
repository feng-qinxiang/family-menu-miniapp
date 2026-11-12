const assert = require('node:assert/strict');
const upload = require('../utils/upload');
const api = require('../utils/api');
const originalUpload = { ...upload }, originalApi = { ...api };
let selected = [], uploaded = '', action = 0, cancelled = false, saveFails = false;
const writes = [];
const chosenSources = [];
const toasts = [];
upload.chooseImage = async (count, sourceType) => { chosenSources.push(sourceType); return selected; };
upload.uploadFile = async () => uploaded;
api.saveIngredientPhoto = async (name, cover) => {
  if (saveFails) throw new Error('offline');
  writes.push({ name, cover });
  return cover ? { [name]: cover } : {};
};
global.wx = { showLoading() {}, hideLoading() {}, showToast(options) { toasts.push(options.title); }, async showActionSheet() {
  if (cancelled) throw new Error('cancel');
  return { tapIndex: action };
} };
const { editIngredientPhoto } = require('../utils/ingredient-photo');
(async () => {
  try {
    assert.equal(await editIngredientPhoto('番茄', ''), undefined);
    assert.equal(writes.length, 0, '取消选择不保存');
    selected = ['/temporary/photo.jpg'];
    await assert.rejects(editIngredientPhoto('番茄', ''), /上传失败/);
    assert.equal(writes.length, 0, '上传失败不保存临时路径');
    uploaded = 'https://example.com/uploads/photo.jpg';
    assert.deepEqual(await editIngredientPhoto('番茄', ''), { '番茄': uploaded });
    assert.deepEqual(chosenSources[chosenSources.length - 1], ['camera'], '拍照仅打开相机');
    action = 1;
    await editIngredientPhoto('番茄', uploaded);
    assert.deepEqual(chosenSources[chosenSources.length - 1], ['album'], '从相册选择不进入相机');
    cancelled = true;
    assert.equal(await editIngredientPhoto('番茄', uploaded), undefined);
    assert.equal(writes.length, 2, '取消更换保留原图片');
    cancelled = false; action = 2;
    saveFails = true;
    await assert.rejects(editIngredientPhoto('番茄', uploaded), /offline/);
    assert.equal(writes.length, 2, '保存失败不返回成功状态');
    saveFails = false;
    assert.deepEqual(await editIngredientPhoto('番茄', uploaded), {});
    assert.deepEqual(writes[2], { name: '番茄', cover: '' }, '恢复文字只清除照片关联');
    let definition;
    global.Page = value => { definition = value; };
    const shoppingWrites = [];
    let addFails = false, releaseAdd;
    api.addShoppingItem = async payload => {
      if (addFails) throw new Error('offline');
      shoppingWrites.push(payload);
      await new Promise(resolve => { releaseAdd = resolve; });
      return { items: shoppingWrites.map((item, index) => ({ ...item, itemId: index + 1 })) };
    };
    api.getTodayMenu = async () => ({ items: [] });
    api.getPantryItems = async () => [];
    require('../pages/shopping/index');
    const shopping = { ...definition, data: JSON.parse(JSON.stringify(definition.data)), setData(patch) {
      for (const [key, value] of Object.entries(patch)) {
        const parts = key.split('.'); let target = this.data;
        while (parts.length > 1) target = target[parts.shift()];
        target[parts[0]] = value;
      }
    } };
    const input = (field, value) => shopping.onNewItemInput({ currentTarget: { dataset: { field } }, detail: { value } });
    const photoWrites = writes.length;
    await shopping.editNewItemPhoto();
    assert.equal(writes.length, photoWrites, '未填食材名时不上传或保存图片');
    assert.equal(toasts.pop(), '先填写食材名，再添加图片');
    input('ingredientName', ' 番茄 '); action = 0;
    await shopping.editNewItemPhoto();
    assert.equal(writes[writes.length - 1].name, '番茄', '图片使用规范化的食材名');
    assert.equal(shopping.data.newItemCover, uploaded, '添加前可预览所选图片');
    input('ingredientName', '鸡蛋');
    assert.equal(shopping.data.newItemCover, '', '下一种食材不会沿用上一种照片');
    input('ingredientName', '番茄');
    assert.equal(shopping.data.newItemCover, uploaded, '已有照片的食材自动显示预览');
    cancelled = true;
    await shopping.editNewItemPhoto();
    assert.equal(shopping.data.newItemCover, uploaded, '取消选择保留照片和输入');
    cancelled = false; input('amount', '2'); input('unit', '个');
    addFails = true; await shopping.addItem();
    assert.equal(shopping.data.newItemCover, uploaded, '添加失败保留照片草稿');
    assert.equal(shopping.data.newItem.ingredientName, '番茄', '添加失败保留食材名');
    assert.equal(shopping.data.addItemSubmitting, false);
    addFails = false;
    const first = shopping.addItem();
    await shopping.addItem();
    assert.equal(shoppingWrites.length, 1, '连续点击仍只有一次写入');
    releaseAdd(); await first;
    assert.equal(shopping.data.newItem.ingredientName, '');
    assert.equal(shopping.data.newItemCover, '', '添加成功后清空草稿图片');
    assert.equal(shopping.data.groupedPending[0].items[0].cover, uploaded, '已添加条目保留对应照片');
    input('ingredientName', '鸡蛋'); input('amount', '6'); input('unit', '个');
    const second = shopping.addItem(); releaseAdd(); await second;
    assert.equal(shopping.data.summary.totalCount, 2, '同一表单可继续添加多种食材');
    assert.deepEqual(shopping.data.groupedPending.flatMap(group => group.items).map(item => item.ingredientName), ['番茄', '鸡蛋']);
    console.log('ingredient-photo.test ok: camera/album, cancel and failure retention, draft preview, repeated add guard and continuous ingredients');
  } finally { Object.assign(upload, originalUpload); Object.assign(api, originalApi); delete global.Page; delete global.wx; }
})().catch(err => { console.error(err); process.exitCode = 1; });
