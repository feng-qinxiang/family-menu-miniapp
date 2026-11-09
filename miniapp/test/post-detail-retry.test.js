// node miniapp/test/post-detail-retry.test.js · 帖子详情加载失败：只有 404 是「返回」，网络/服务异常必须能「重新加载」。
const assert = require('node:assert/strict');
const api = require('../utils/api');

let definition;
global.Page = (page) => { definition = page; };
global.wx = { getStorageSync: () => '', showToast() {} };
global.getCurrentPages = () => [{}];

function fail(status, message) {
  const error = new Error(message);
  error.status = status;
  return Promise.reject(error);
}

async function load(postResult) {
  api.getCommunityPost = () => postResult();
  api.getCommunityComments = () => Promise.resolve([]);
  const page = Object.assign({}, definition, {
    data: JSON.parse(JSON.stringify(definition.data)),
    setData(patch) { Object.assign(this.data, patch); }
  });
  page.loadAll('7');
  await new Promise((resolve) => setTimeout(resolve, 0));
  return page.data;
}

(async () => {
  try {
    require('../pkg-extra/community/post-detail/index');
    const offline = await load(() => fail(500, '网络请求失败，请稍后重试'));
    assert.equal(offline.loadError, true);
    assert.equal(offline.loadErrorDesc, '', '服务/网络异常不能伪装成内容不可见，要保留重新加载');

    const removed = await load(() => fail(404, '该分享因违规已被下架'));
    assert.equal(removed.loadErrorDesc, '该分享因违规已被下架', '真下架才只给返回');
  } finally {
    delete global.Page;
    delete global.wx;
    delete global.getCurrentPages;
  }
  console.log('post-detail-retry.test ok: 5xx keeps retry, 404 shows reason');
})().catch((err) => { console.error(err); process.exit(1); });
