// Run after opening this worktree in WeChat DevTools; all actions stay in the local preview.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const evidence = [];
function cli(tool, args = []) {
  const run = spawnSync('/usr/local/bin/wechatide', ['-c', 'Codex', tool, '--project', root, ...args], { encoding: 'utf8', timeout: 55000 });
  let result;
  try { result = JSON.parse(run.stdout.slice(run.stdout.indexOf('{'))); }
  catch (error) { throw new Error(`${tool} did not return JSON (${run.status})`); }
  assert.equal(run.status, 0, `${tool}: ${result.errorType || 'nonzero exit'}`);
  assert.equal(result.ok, true, `${tool}: ${result.errorType || 'failed'}`);
  return result.result;
}
const tap = (selector) => cli('automation_element_action', ['--action', 'tap', '--selector', selector, '--wait-for-selector', selector]);
const call = (method) => cli('automation_page_action', ['--action', 'callMethod', '--method', method]);
const patch = (data) => cli('automation_page_action', ['--action', 'setData', '--patch', JSON.stringify(data)]);
const data = () => {
  const result = cli('automation_page_action', ['--action', 'getData']);
  return result.data || result;
};
function capture(design, view, variant = '') {
  const state = data();
  assert.equal(state.design, design); assert.equal(state.view, view);
  const file = `${design}-${view}${variant ? '-' + variant : ''}.jpg`;
  const image = cli('simulator_screenshot', ['--wait-for-selector', `.view-${view}`, '--path', path.join(__dirname, 'screens', file)]);
  evidence.push({ design, view, variant, image: `screens/${file}`, width: image.imageWidth, height: image.imageHeight });
  console.log(`${design.toUpperCase()} / ${view}${variant ? ' / ' + variant : ''}: captured`);
}
fs.mkdirSync(path.join(__dirname, 'screens'), { recursive: true });
cli('automation_navigate', ['--action', 'reLaunch', '--url', '/pkg-preview/journey/index?design=a&chrome=0']);
const designs = data().designs;
for (const design of designs) {
  if (data().dark) call('toggleDark');
  call('resetDemo');
  patch({ design: design.key, designInfo: design, previewChrome: false, fontScale: 'normal', dark: false });
  tap('.journey-tab-order'); capture(design.key, 'order');
  tap('.start-cook'); capture(design.key, 'cook');
  tap('.journey-tab-record'); capture(design.key, 'record');
  tap('.journey-tab-community'); capture(design.key, 'community');
  patch({ fontScale: 'lg' }); capture(design.key, 'community', 'large');
  patch({ fontScale: 'normal' }); call('toggleDark');
  tap('.journey-tab-cook'); capture(design.key, 'cook', 'dark');
}

// Native element taps verify the complete flow, rather than invoking Page business methods.
if (data().dark) call('toggleDark');
call('resetDemo'); patch({ design: 'a', designInfo: designs[0], fontScale: 'normal', dark: false });
tap('.journey-tab-order');
tap('.pick-potato'); tap('.pick-potato');
assert.equal(data().orders.length, 4);
tap('.start-cook'); assert.equal(data().view, 'cook');
tap('.timer-button'); assert.equal(data().timerRunning, true);
tap('.timer-button'); assert.equal(data().timerRunning, false);
for (let step = 0; step < 4; step += 1) tap('.next-step');
assert.equal(data().sheet, 'record'); assert.equal(data().history.length, 3);
tap('.rating-4');
cli('automation_element_action', ['--action', 'input', '--selector', '.sheet-input', '--value', '下次少放一点糖。']);
tap('.save-record');
assert.equal(data().view, 'record'); assert.equal(data().latest.score, 4);
assert.equal(data().latest.remark, '下次少放一点糖。'); assert.equal(data().doneCount, 1);
assert.equal(data().history.length, 4);
capture('a', 'record', 'saved');
tap('.share-record'); tap('.publish-post');
assert.equal(data().view, 'community'); assert.equal(data().posts[0].recipeId, 'pork');
assert.equal(data().posts.length, 4);
capture('a', 'community', 'shared');
// The original shrimp post keeps its selector after a new post is inserted.
tap('.post-order-post-2');
assert.equal(data().view, 'order'); assert.equal(data().orders.length, 5);
console.log('Native complete flow: PASS');
evidence.push({ check: 'native complete flow', result: 'PASS', recordsAdded: 1, postsAdded: 1 });
fs.writeFileSync(path.join(__dirname, 'native-evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
call('resetDemo'); patch({ design: 'a', designInfo: designs[0], previewChrome: true });
tap('.journey-tab-order');
