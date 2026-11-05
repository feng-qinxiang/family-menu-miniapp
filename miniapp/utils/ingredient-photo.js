const { chooseImage, uploadFile } = require('./upload');
const { saveIngredientPhoto } = require('./api');

// 冰箱、买菜清单和菜谱用料共用；取消或保存失败都保留当前照片。
async function editIngredientPhoto(name, currentCover) {
  if (!name) return undefined;
  let action;
  const itemList = ['拍照', '从相册选择'];
  if (currentCover) itemList.push('恢复文字显示');
  try { action = await wx.showActionSheet({ itemList }); }
  catch (err) { return undefined; }
  if (!action || !Number.isInteger(action.tapIndex) || action.tapIndex < 0 || action.tapIndex >= itemList.length) return undefined;
  const clear = action.tapIndex === 2;
  const paths = clear ? [] : await chooseImage(1, [action.tapIndex === 0 ? 'camera' : 'album']);
  if (!clear && !paths.length) return undefined;
  wx.showLoading({ title: clear ? '保存中' : '上传中', mask: true });
  try {
    const cover = clear ? '' : await uploadFile(paths[0]);
    if (!clear && !cover) throw new Error('上传失败，原图片已保留');
    return await saveIngredientPhoto(name, cover);
  } finally {
    wx.hideLoading();
  }
}

module.exports = { editIngredientPhoto };
