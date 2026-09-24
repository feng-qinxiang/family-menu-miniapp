// node miniapp/test/favorites-cover.test.js · 收藏页帖子卡封面口径：帖子自己的图 → 关联菜谱封面 → 不放图。
// 这条错了不会崩，只会在卡片上配一张无关的图：实测一道没有配图的「周末烤的面包」被配成扬州炒饭（旧兜底池轮转）。
const assert = require('assert');
let definition;
global.Page = (page) => { definition = page; };
require('../pkg-extra/favorites/index');
delete global.Page;

const build = (list) => definition._buildPosts(list);

// ① 帖子自己的图优先于关联菜谱封面（与社区信息流同一口径）
{
  const posts = build([{
    id: 1,
    title: '汤',
    images: ['/assets/dishes/wontons.jpg'],
    recipe: { id: 101, coverImage: '/assets/dishes/egg-drop-soup.jpg' }
  }]);
  assert.strictEqual(posts[0].cover, '/assets/dishes/wontons.jpg', '帖子自己的图应当优先');
}

// ② 没自己的图才退到关联菜谱封面
{
  const posts = build([{ id: 2, title: '汤', images: [], recipe: { id: 101, coverImage: '/assets/dishes/egg-drop-soup.jpg' } }]);
  assert.strictEqual(posts[0].cover, '/assets/dishes/egg-drop-soup.jpg');
}

// ③ 都没有就不放图（WXML 用 wx:if 收掉图位），不许再拿无关本地菜图兜底
{
  const posts = build([{ id: 3, title: '周末烤的面包', recipe: null }]);
  assert.strictEqual(posts[0].cover, '', '无图帖子不能配无关本地菜图');
}

// ④ images 里混着空值/非数组时不炸，也不把空串当封面
{
  const posts = build([
    { id: 4, title: '面包', images: [null, ''], recipe: null },
    { id: 5, title: '面包', images: null, recipe: null }
  ]);
  assert.strictEqual(posts[0].cover, '');
  assert.strictEqual(posts[1].cover, '');
}

console.log('✔ 收藏页封面口径：4 条通过');
