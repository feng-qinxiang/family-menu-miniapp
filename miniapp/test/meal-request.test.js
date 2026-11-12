const assert = require('node:assert/strict');
const { parseMealRequest, hasMildLabel } = require('../utils/meal-request');
const cuisines = ['家常', '川菜', '粤菜'];
const parse = value => parseMealRequest(value, cuisines);
const ordinary = parse('两人吃，30分钟，不辣，冰箱有的');
assert.equal(ordinary.canApply, true);
assert.equal(ordinary.minServings, 2);
assert.equal(ordinary.maxTime, 30);
assert.equal(ordinary.mildOnly, true);
assert.equal(ordinary.pantryOnly, true);
assert.equal(parse('晚餐，冰箱有的，临期优先').mealType, 'dinner');
assert.equal(parse('四个人，半小时，家常').maxTime, 30);
assert.equal(parse('二十人份，一小时，粤菜').minServings, 20);
assert.equal(parse('二十人份，一小时，粤菜').maxTime, 60);
for (const value of ['', '你好', '0人', '三十个人', '十十一人', '0分钟', '八小时', '两人，四人', '午饭，晚饭', '不要川菜', '不吃冰箱里的', '两人，花生过敏', '不要海鲜', '不超过20块钱', '30分钟，不要不辣']) {
  assert.equal(parse(value).canApply, false, `不能静默忽略未知、矛盾或负面要求：${value}`);
}
assert.equal(hasMildLabel({ title: '蒸蛋', tasteTags: ['清淡'] }), true);
assert.equal(hasMildLabel({ title: '蒸蛋' }), false, '没标口味不能假定不辣');
assert.equal(hasMildLabel({ title: '香辣蒸蛋', tasteTags: ['清淡'] }), false, '矛盾标注不推荐');
assert.equal(hasMildLabel({ title: '不辣蒸蛋', tasteTags: ['不辣'] }), true);
console.log('meal-request.test ok: Chinese numbers, time, cuisine, meals, pantry, contradictory/unknown constraints and labelled taste');
