/**
 * recipe-steps 编解码 · 零依赖
 * 运行：node test/recipe-steps.test.js
 */
const assert = require('assert');
const { encodeStep, decodeStep } = require('../miniapp/utils/recipe-steps');

let passed = 0;
function eq(actual, expected, label) {
  assert.deepStrictEqual(actual, expected, label);
  passed += 1;
}

eq(encodeStep({ text: '热锅', image: '' }), '热锅', '无图走纯文本');
eq(encodeStep({ text: '热锅', image: '/a.jpg' }), JSON.stringify({ text: '热锅', image: '/a.jpg' }), '有图走 JSON');

// decodeStep 统一返回 {text, image, video} 三字段（video 用于 hoistVideo 抽整条菜谱的教学视频）
eq(decodeStep('热锅'), { text: '热锅', image: '', video: '' }, '纯文本解码');
eq(decodeStep(JSON.stringify({ text: '热锅', image: '/a.jpg' })), { text: '热锅', image: '/a.jpg', video: '' }, 'JSON 解码');
eq(decodeStep({ text: '热锅', image: '/a.jpg' }), { text: '热锅', image: '/a.jpg', video: '' }, '对象直通');
eq(decodeStep('{普通文案'), { text: '{普通文案', image: '', video: '' }, '残缺花括号当文本');
eq(decodeStep(JSON.stringify({ text: '热锅', video: '/v.mp4' })), { text: '热锅', image: '', video: '/v.mp4' }, '带视频解码');
eq(encodeStep({ text: '热锅', video: '/v.mp4' }), JSON.stringify({ text: '热锅', video: '/v.mp4' }), '有视频走 JSON');

const round = decodeStep(encodeStep({ text: '装盘', image: 'https://x/y.jpg' }));
eq(round, { text: '装盘', image: 'https://x/y.jpg', video: '' }, '往返');

const { hoistVideo } = require('../miniapp/utils/recipe-steps');
eq(hoistVideo([{ text: 'a' }, { text: 'b', video: '/v.mp4' }]), '/v.mp4', 'hoistVideo 取第一条视频');
eq(hoistVideo([{ text: 'a' }]), '', 'hoistVideo 无视频返回空串');

console.log(`recipe-steps.test: ${passed} 断言全部通过 ✔`);
