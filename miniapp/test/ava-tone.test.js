// node miniapp/test/ava-tone.test.js：文字头像配色——同名同色、社区不出红、每个色档都有对应样式。
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { avaTone, AVA_TONES } = require('../utils/constants');

assert.equal(avaTone('猫猫'), avaTone('猫猫'), '同一个名字每次取到同一个色');
assert.ok(AVA_TONES.includes(avaTone('')) && AVA_TONES.includes(avaTone(undefined)), '匿名作者也有色');
assert.ok(!AVA_TONES.includes('pop'), '社区头像不用红：红色留给点赞 / 发帖');
assert.ok(new Set(['猫猫', '小周', '阿姨', '老王', '匿名厨友', 'Tom'].map(avaTone)).size > 1, '不同名字不该全是一个色');

// 色档名和样式类必须对得上：社区按名字取色，成员页按顺序轮用（多一档红）
const css = fs.readFileSync(path.join(__dirname, '../app.wxss'), 'utf8');
const members = fs.readFileSync(path.join(__dirname, '../pkg-extra/family/members/index.js'), 'utf8');
const memberTones = JSON.parse(members.match(/AVT_TONES = (\[[^\]]+\])/)[1].replace(/'/g, '"'));
[...AVA_TONES, ...memberTones].forEach((tone) => {
  assert.match(css, new RegExp('\\.ava-' + tone + '\\s*[,{]'), 'app.wxss 缺 .ava-' + tone);
});
console.log('ava-tone.test ok');
