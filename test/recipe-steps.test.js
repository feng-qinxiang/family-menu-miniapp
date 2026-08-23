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

eq(decodeStep('热锅'), { text: '热锅', image: '' }, '纯文本解码');
eq(decodeStep(JSON.stringify({ text: '热锅', image: '/a.jpg' })), { text: '热锅', image: '/a.jpg' }, 'JSON 解码');
eq(decodeStep({ text: '热锅', image: '/a.jpg' }), { text: '热锅', image: '/a.jpg' }, '对象直通');
eq(decodeStep('{普通文案'), { text: '{普通文案', image: '' }, '残缺花括号当文本');

const round = decodeStep(encodeStep({ text: '装盘', image: 'https://x/y.jpg' }));
eq(round, { text: '装盘', image: 'https://x/y.jpg' }, '往返');

console.log(`recipe-steps.test: ${passed} 断言全部通过 ✔`);
