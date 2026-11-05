const assert = require('node:assert/strict');

let definition;
const navigation = [];
global.Page = (page) => { definition = page; };
global.wx = {
  navigateTo(options) { navigation.push({ type: 'navigate', url: options.url }); },
  switchTab(options) { navigation.push({ type: 'tab', url: options.url }); }
};
require('../pages/home/index');

const features = require('../utils/features');
const originalCommunity = features.COMMUNITY;
const page = () => Object.assign({}, definition, {
  data: structuredClone(definition.data),
  setData(patch) { Object.assign(this.data, patch); }
});
const event = (step) => ({ currentTarget: { dataset: { step } } });
const dish = (id, status, addedByName, mealType = 'dinner') => ({
  recipeId: id,
  mealType,
  status,
  addedByName,
  recipe: { title: `家常菜${id}` },
  dishImg: `/images/${id}.jpg`
});

try {
  features.COMMUNITY = true;

  const p = page();
  p.onPageScroll({ scrollTop: 80 });
  assert.equal(p.data.navSolid, false, 'The photo header stays open at the top');
  p.onPageScroll({ scrollTop: 81 });
  assert.equal(p.data.navSolid, true, 'Scrolling reserves the capsule and status-bar area');
  p.onPageScroll({ scrollTop: 0 });
  assert.equal(p.data.navSolid, false, 'Returning to the top restores the photo header');
  p.data.currentSlot = 'dinner';
  p.data.todayMenu = [
    dish(1, 'todo', '妈妈'),
    dish(2, 'cooking', '爸爸'),
    dish(3, 'done', ''),
    dish(4, 'todo', '我'),
    dish(5, 'todo', '妈妈', 'breakfast')
  ];
  p.updateSlotMenu();

  assert.equal(p.data.slotMenu.length, 4, 'The selected meal excludes dishes from other meals');
  assert.deepEqual(p.data.homeMenuItems.map((item) => item.recipeId), [1, 2, 3]);
  assert.equal(p.data.menuMoreCount, 1, 'The home list shows at most three dishes');
  assert.deepEqual(p.data.homeMenuItems.map((item) => item.statusLabel), ['待做', '制作中', '已上桌']);
  assert.equal(p.data.homeMenuItems[0].addedByName, '妈妈');
  assert.equal(p.data.homeMenuItems[0].dishImg, '/images/1.jpg');
  assert.equal(p.data.slotDoneCount, 1);
  assert.equal(p.data.menuProgress, 25);
  assert.equal(p.data.menuReady, false);
  assert.equal(p.data.journeyProgress, 25);
  assert.equal(p.data.cookLabel, '继续做菜');
  assert.deepEqual(p.data.journeySteps.map((step) => step.key), ['order', 'cook', 'record', 'community']);
  assert.equal(p.data.journeySteps[0].complete, true);
  assert.equal(p.data.journeySteps[1].active, true);
  assert.equal(p.data.journeySteps[1].caption, '1 道进行中');
  assert.equal(p.data.journeySteps[2].caption, '留住家常味', 'Serving a dish does not claim a cooking record was saved');

  p.data.todayMenu = p.data.todayMenu.map((item) => item.mealType === 'dinner' ? { ...item, status: 'done' } : item);
  p.updateSlotMenu();
  assert.equal(p.data.cookLabel, '查看做菜记录');
  assert.equal(p.data.menuProgress, 100);
  assert.equal(p.data.menuReady, true);
  assert.equal(p.data.journeySteps[1].complete, true);
  assert.equal(p.data.journeySteps[2].active, true, 'A fully served meal advances to the record stage');
  assert.equal(p.data.journeySteps[2].caption, '回看做菜记录');
  assert.equal(p.data.journeyProgress, 50);

  p.data.currentSlot = 'breakfast';
  p.updateSlotMenu();
  assert.equal(p.data.slotMenu.length, 1);
  assert.equal(p.data.menuReady, false, 'Switching meals clears the previous meal completion');
  assert.equal(p.data.menuProgress, 0);
  assert.equal(p.data.cookLabel, '开始做 1 道');
  assert.equal(p.data.journeySteps[0].active, false, 'The breakfast item remains in its own meal');

  p.data.currentSlot = 'lunch';
  p.updateSlotMenu();
  assert.equal(p.data.slotMenu.length, 0);
  assert.equal(p.data.menuProgress, 0, 'Empty meals have no progress rather than NaN or 100 percent');
  assert.equal(p.data.menuReady, false);
  assert.equal(p.data.journeyProgress, 0);
  assert.equal(p.data.homeMenuItems.length, 0);
  assert.equal(p.data.cookLabel, '去选几道菜');
  assert.equal(p.data.journeySteps[0].active, true);
  p.onJourneyStep(event('cook'));
  assert.deepEqual(navigation.pop(), { type: 'navigate', url: '/pages/recipes/index' }, 'An empty meal sends the cook stage back to ordering');
  p.onJourneyStep(event('record'));
  assert.deepEqual(navigation.pop(), { type: 'tab', url: '/pages/cook-log/index' });
  p.onJourneyStep(event('community'));
  assert.deepEqual(navigation.pop(), { type: 'tab', url: '/pages/community/index' });

  features.COMMUNITY = false;
  p.updateSlotMenu();
  assert.deepEqual(p.data.journeySteps.map((step) => step.key), ['order', 'cook', 'record']);
  p.onJourneyStep(event('community'));
  assert.equal(navigation.length, 0, 'The community route remains guarded when its feature is disabled');
} finally {
  features.COMMUNITY = originalCommunity;
  delete global.Page;
  delete global.wx;
}

console.log('home-journey.test ok: meal menu, status, progress, empty-meal routing, and community guard');
