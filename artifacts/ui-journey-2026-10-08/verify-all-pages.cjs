// Formal route gallery: native rendering with temporary Page data, no business writes.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const root = path.resolve(__dirname, '../..');
const catalogFile = path.join(__dirname, 'page-catalog.json');
const catalog = JSON.parse(fs.readFileSync(catalogFile));
const selected = new Set(process.argv.slice(2));
const proofFile = path.join(__dirname, process.env.MEAL_UI_LAYOUT_EVIDENCE || 'all-pages-evidence.json');
const proof = fs.existsSync(proofFile) ? JSON.parse(fs.readFileSync(proofFile)) : { screens: [], routes: [] };
proof.layouts = proof.layouts || [];
Object.assign(proof, { checkedAt: new Date().toISOString(), passed: false, source: 'Native formal pages; temporary sample data restored; closed features kept closed; no business write APIs.' });
let lastCall = 0;
function cli(tool, args = []) {
  const cooldown = 1500 - (Date.now() - lastCall);
  if (cooldown > 0) Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, cooldown);
  lastCall = Date.now();
  const run = spawnSync('/usr/local/bin/wechatide', ['-c', process.env.WECHATIDE_CLIENT || 'Codex', tool, '--project', root, ...args], { encoding: 'utf8', timeout: 55000 });
  const result = JSON.parse(run.stdout.slice(run.stdout.indexOf('{')));
  assert.equal(run.status, 0, `${tool}: ${run.error ? run.error.message : result.message || result.errorType}`);
  assert.equal(result.ok, true, `${tool}: ${result.message || result.errorType}`);
  return result.result;
}
const patch = value => cli('automation_page_action', ['--action', 'setData', '--patch', JSON.stringify(value)]);
// ponytail: IDE skill 0.3.15 的 callMethod 调用时丢了 this，改用 evaluate 在当前页上直接调用
const callPage = method => cli('automation_evaluate', ['--fn-source', `function() { getCurrentPages().pop()[${JSON.stringify(method)}](); }`]);
const read = () => cli('automation_page_action', ['--action', 'getData']).data;
const current = () => cli('automation_runtime_info', ['--action', 'currentPage']).currentPage.path;
function boxes(selectors) {
  const result = cli('automation_evaluate', ['--fn-source', `function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); ${JSON.stringify(selectors)}.forEach(s => q.select(s).boundingClientRect()); q.exec(resolve); }); }`]).result.result;
  return Object.fromEntries(selectors.map((selector, index) => [selector, result[index]]));
}
function inside(child, parent, label) {
  assert.ok(child && parent && child.width > 0 && child.height > 0, `${label}: rendered`);
  assert.ok(child.left >= parent.left - 1 && child.right <= parent.right + 1, `${label}: horizontal bounds`);
}
function postLayout(entry, state, composing = false) {
  const rects = boxes(['.page', '.body', '.recipe-card', '.rc-img', '.rc-mid', '.react-bar', '.inputbar', '.field', '.send', '.scroll', '.cmt', '.cmeta', '.pimgs', '.post-title', '.react-share', '.author', '.acol', '.atime', '.aname', '.post-title-row', '.post-copy', '.post-text', '.post-footer', '.ptags', '.react-report']);
  inside(rects['.acol'], rects['.author'], `${state}: author information`);
  inside(rects['.react-share'], rects['.author'], `${state}: share action`);
  assert.ok(rects['.acol'].right <= rects['.react-share'].left + 1, `${state}: author text stays left of share`);
  if (state === 'normal') assert.ok(rects['.atime'].height <= rects['.aname'].height + 1, 'normal author metadata fits one line: ' + JSON.stringify({author:rects['.author'], info:rects['.acol'], time:rects['.atime'], name:rects['.aname'], share:rects['.react-share']}));
  inside(rects['.rc-img'], rects['.recipe-card'], `${state}: related photo`);
  inside(rects['.rc-mid'], rects['.recipe-card'], `${state}: related text`);
  assert.ok(rects['.rc-mid'].left >= rects['.rc-img'].right, `${state}: related text right of photo`);
  inside(rects['.inputbar'], rects['.page'], `${state}: input bar`);
  inside(rects['.field'], rects['.inputbar'], `${state}: input`);
  if (composing) {
    inside(rects['.send'], rects['.inputbar'], `${state}: send`);
    assert.equal(rects['.react-bar'], null, `${state}: composing shows send instead of reactions`);
    assert.ok(rects['.field'].right <= rects['.send'].left + 1, `${state}: input does not overlap send`);
  } else {
    inside(rects['.react-bar'], rects['.inputbar'], `${state}: reactions`);
    assert.equal(rects['.send'], null, `${state}: reading shows reactions instead of an empty send action`);
    assert.ok(rects['.field'].right <= rects['.react-bar'].left + 1, `${state}: input does not overlap reactions`);
  }
  inside(rects['.post-title'], rects['.post-title-row'], `${state}: title`);
  if (rects['.pimgs']) assert.ok(rects['.author'].bottom <= rects['.pimgs'].top + 1 && rects['.pimgs'].bottom <= rects['.post-copy'].top + 1, `${state}: author, photo and reading section follow in order`);
  else assert.ok(rects['.author'].bottom <= rects['.post-copy'].top + 1, `${state}: text-only post starts immediately after author`);
  for (const selector of ['.post-title-row', '.post-text', '.post-footer']) inside(rects[selector], rects['.post-copy'], `${state}: reading ${selector}`);
  assert.ok(rects['.post-title-row'].bottom <= rects['.post-text'].top + 1 && rects['.post-text'].top - rects['.post-title-row'].bottom <= 12, `${state}: title and body form a continuous reading block`);
  assert.ok(rects['.post-text'].bottom <= rects['.post-footer'].top + 1 && rects['.post-footer'].bottom <= rects['.recipe-card'].top + 1, `${state}: paragraphs, metadata and recipe follow in order`);
  const paragraphs = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => wx.createSelectorQuery().selectAll(".ptext-p").boundingClientRect().exec(resolve)); }']).result.result[0];
  assert.ok(paragraphs.length > 0 && paragraphs.every(box => Math.abs(box.width - rects['.post-text'].width) < 1 && box.left >= rects['.post-text'].left - 1 && box.right <= rects['.post-text'].right + 1), `${state}: paragraphs use the reading width without overflow`);
  for (let i = 1; i < paragraphs.length; i++) assert.ok(paragraphs[i].top >= paragraphs[i - 1].bottom - 1 && paragraphs[i].top - paragraphs[i - 1].bottom <= 12, `${state}: paragraph spacing stays compact without overlap`);
  if (rects['.ptags']) assert.ok(rects['.ptags'].right <= rects['.react-report'].left + 1, `${state}: tags and report remain separate`);
  inside(rects['.cmeta'], rects['.cmt'], `${state}: comment author`);
  assert.ok(rects['.scroll'].bottom <= rects['.inputbar'].top + 1 && rects['.inputbar'].bottom <= rects['.page'].bottom + 1, `${state}: input stays below scroll area`);
  proof.layouts.push({ route: entry.route, state, rects, paragraphs, passed: true });
}
function notificationLayout(entry, state) {
  const rects = boxes(['.ncard', '.nhead', '.nt-h3', '.nt-body', '.nfoot', '.nbtn', '.nread-state', '.reddot', '.nt-time', '.nt', '.notif-title-row', '.cpt-titles', '.notif-readall', '.notif-readall-label', '.notif-page >>> .navbar', '.cpt-head']);
  assert.ok(rects['.notif-title-row'].top >= rects['.notif-page >>> .navbar'].bottom - 1, `${state}: bulk-read action belongs below navigation`);
  if (read().unreadCount > 0) {
    inside(rects['.notif-readall'], rects['.notif-title-row'], `${state}: bulk-read button in heading`);
    inside(rects['.notif-readall-label'], rects['.notif-readall'], `${state}: bulk-read label in touch area`);
    assert.ok(rects['.cpt-titles'].right <= rects['.notif-readall'].left + 1 && rects['.notif-readall'].height >= 43 && rects['.notif-readall'].width >= 43, `${state}: heading and bulk-read button stay separate and tappable`);
  } else assert.equal(rects['.notif-readall'], null, `${state}: no bulk-read action when all messages are read`);
  for (const selector of ['.nhead', '.nt-body', '.nfoot', '.nbtn', '.nread-state']) inside(rects[selector], rects['.ncard'], `${state}: ${selector}`);
  assert.ok(rects['.nt-body'].width >= rects['.ncard'].width * .8, `${state}: body uses card width`);
  assert.ok(rects['.nt-body'].top >= rects['.nhead'].bottom - 1 && rects['.nt-body'].bottom <= rects['.nfoot'].top + 1, `${state}: header, body and footer stay separate`);
  assert.ok(rects['.nread-state'].right <= rects['.nbtn'].left + 1, `${state}: read status does not overlap action`);
  inside(rects['.nt-time'], rects['.nhead'], `${state}: timestamp in header`);
  assert.ok(rects['.nt-time'].left >= rects['.nt'].right - 1 && rects['.nt-time'].top < rects['.nt-h3'].bottom, `${state}: timestamp sits at top right of title`);
  proof.layouts.push({ route: entry.route, state, rects, passed: true });
}
function ingredientLayout(entry, state) {
  const result = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); [".rd-ing", ".rd-ingredient-photo", ".rd-iname", ".rd-ingredient-text", ".rd-ingredient-image", ".rd-ingredient-label", ".rd-photo-edit"].forEach(s => q.selectAll(s).boundingClientRect()); q.exec(resolve); }); }']).result.result;
  assert.equal(result[0].length, ingredients.length);
  result[0].forEach((row, index) => {
    inside(result[1][index], row, `${state}: ingredient photo ${index}`);
    inside(result[2][index], row, `${state}: ingredient text ${index}`);
    assert.ok(result[2][index].left >= result[1][index].right, `${state}: ingredient text right of photo`);
  });
  assert.equal(result[3].length, 1, `${state}: missing photo shows name`);
  assert.equal(result[4].length, 2, `${state}: uploaded ingredient photos rendered`);
  assert.ok(result[5][0].bottom <= result[6][2].top + 1, `${state}: fallback name stays above edit label; ${JSON.stringify({ name: result[5][0], edit: result[6][2] })}`);
  const rects = boxes(['.rd-page', '.rd-footbar']);
  inside(rects['.rd-footbar'], rects['.rd-page'], `${state}: bottom actions`);
  proof.layouts.push({ route: entry.route, state, ingredientRows: result[0], rects, passed: true });
}
function checkoutLayout(entry, state) {
  const rects = boxes(['.pay-page', '.merchant', '.pay-plan-copy', '.pay-selected', '.payarea', '.pay-due', '.btn-pay', '.pay-scroll']);
  inside(rects['.pay-plan-copy'], rects['.merchant'], `${state}: plan text`);
  inside(rects['.pay-selected'], rects['.merchant'], `${state}: selected badge`);
  inside(rects['.pay-due'], rects['.payarea'], `${state}: amount`);
  inside(rects['.btn-pay'], rects['.payarea'], `${state}: button`);
  assert.ok(rects['.pay-scroll'].bottom <= rects['.payarea'].top + 1 && rects['.payarea'].bottom <= rects['.pay-page'].bottom + 1, `${state}: bottom payment actions stay visible`);
  const buttons = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => wx.createSelectorQuery().selectAll(".btn-pay").boundingClientRect().exec(resolve)); }']).result.result[0];
  assert.equal(buttons.length, 1, `${state}: one payment button`);
  assert.equal(read().paymentEnabled, false, `${state}: payment remains disabled; button is not clicked`);
  proof.layouts.push({ route: entry.route, state, rects, paymentEnabled: false, passed: true });
}
const recipe = { id: 101, title: '番茄炒蛋', coverImage: '/assets/dishes/tomato-egg.jpg', cover: '/assets/dishes/tomato-egg.jpg', dishImg: '/assets/dishes/tomato-egg.jpg', cuisine: '家常', timeCost: 15, servings: 2, tasteTags: ['鲜香', '下饭'], summary: '食材简单，趁热上桌，全家都喜欢。', sourceType: 'owned', sourceLabel: '自建', avgScore: 4.8 };
const ingredients = [{ name: '番茄', amount: '2', amountText: '2', unit: '个', inStock: true, cover: '/assets/ingredients/tomato.jpg' }, { name: '鸡蛋', amount: '3', amountText: '3', unit: '个', inStock: true, cover: '/assets/ingredients/egg.jpg' }, { name: '小葱', amount: '1', amountText: '1', unit: '根', inStock: false }];
const steps = [{ text: '番茄切块，鸡蛋打散，加少许盐拌匀。', image: '', tip: '番茄切成大小相近的小块。' }, { text: '热锅下油，先炒鸡蛋，凝固后盛出。', image: '' }, { text: '炒软番茄，倒回鸡蛋翻匀，撒小葱后上桌。', image: '' }];
const post = { id: 201, title: '今晚这盘番茄炒蛋，家人都说好吃', author: '家人', authorMeta: '今天 18:30 · 家常饭桌', avaText: '家', avaTheme: 'lin', paragraphs: ['今天用了冰箱里的番茄，酸甜刚好。', '鸡蛋先盛出来，再炒番茄，最后合在一起，口感会嫩一些。'], images: [recipe.cover], imageErrors: [], tags: ['家常菜', '今日晚餐'], cover: '', recipe, liked: false, favorited: false, likeCount: 12, favoriteCount: 3, commentCount: 2, mine: false, isPending: false };
const sample = {
  'pkg-extra/community/post-detail/index': { postId: '201', post, photoIndex: 0, commentText: '', submitting: false, commentsError: false, comments: [{ commentId: 1, author: '家人', avaText: '家', avaTheme: 'lan', createdAt: '18:45', content: '明天也想吃这道，少放一点盐就好。', mine: false }, { commentId: 2, author: '掌勺人', avaText: '厨', avaTheme: 'lin', createdAt: '18:50', content: '好，下次照这个火候再做。', mine: false }] },
  'pkg-extra/me/settings/index': { subscribeAvailable: true, subscribeEnabled: false },
  'pkg-extra/me/notifications/index': { activeTab: 'all', all: [{ id: 9001, group: 'today', kind: 'pantry', icon: 'bell', title: '2 项食材快到期了', time: '今天 09:00', unread: true, body: [{ t: 'n', v: '番茄今天到期；鸡蛋剩 2 天。先检查新鲜度，再安排做菜。' }], action: { label: '查看冰箱', ghost: false, type: 'pantry' } }] },
  'pkg-extra/favorites/index': { recipes: [{ ...recipe, favorited: true }, { ...recipe, favorited: true, id: 102, title: '清炒时蔬', coverImage: '/assets/dishes/stir-fry-veg.jpg', cover: '/assets/dishes/stir-fry-veg.jpg', dishImg: '/assets/dishes/stir-fry-veg.jpg', timeCost: 10 }], recipeCount: 2, postCount: 1, countText: '2 道菜谱 · 1 条分享', posts: [{ id: 201, title: post.title, cover: recipe.cover, tag: '家常菜', author: '家人', avatarText: '家', avatarColor: '#c74d32', likeCount: 12 }] },
  'pkg-extra/recipe-detail/index': { ingredientPhotos: { '番茄': '/assets/ingredients/tomato.jpg', '鸡蛋': '/assets/ingredients/egg.jpg' }, ingredientPhotosFailed: false, recipeId: 101, recipe: { ...recipe, ingredients, steps, totalCount: 3, haveCount: 2, cookCount: 8, reviews: [{ author: '家人', initial: '家', score: 5, content: '火候刚好，下次还想吃。', when: '昨天' }] }, servings: 2, baseServings: 2, missCount: 1, works: [{ id: 201, author: '家人', title: post.title, cover: recipe.cover, likeCount: 12 }] },
  'pkg-extra/recipe-edit/index': { pageLoading: false, tipText: '', form: { ...recipe, difficulty: 'medium', ingredients, steps, videoUrl: '' }, tagsLabel: '鲜香、下饭', tasteTagsText: '鲜香、下饭', previewInfo: { title: recipe.title, meta: '家常 · 15分钟 · 2人', desc: recipe.summary }, formQuality: { ingredientCount: 3, stepCount: 3, hasSummary: true, readyText: '可以保存' } },
  'pkg-extra/recipes/search/index': { keyword: '番茄', allRecipes: [recipe], list: [{ ...recipe, titleParts: [{ t: '番茄', hl: true }, { t: '炒蛋', hl: false }], label: '家常', timeText: '15 分钟' }], total: 1 },
  'pkg-extra/vip/orders/index': { orders: [], totalCount: 0, activateCta: '查看会员套餐' },
  'pkg-extra/payment/success/index': { planName: '家庭云同步年卡', order: { orderNo: '', payAmount: '', expireAt: '' } },
  'pkg-extra/family/members/index': { familyName: '一家人的饭桌', inviteCode: '', codeFailed: true, memberCount: 3, members: [{ userId: 1, nickname: '家人', initial: '家', roleBadge: 'admin', roleLabel: '管理员', tone: 'pine', sub: '家庭创建者', isOwner: true, isSelf: true }, { userId: 2, nickname: '今天的掌勺人', initial: '厨', roleBadge: 'member', roleLabel: '成员', tone: 'gold', sub: '忌口：少辣', removable: true }, { userId: 3, nickname: '一起吃饭的家人', initial: '家', roleBadge: 'member', roleLabel: '成员', tone: 'pop', sub: '一起点菜，一起准备晚饭', removable: true }] },
  'pkg-extra/family/invite/index': { inviteCode: '', codeDigits: ['', '', '', '', '', '', '', ''], codeFailed: true, familyName: '一家人的饭桌' },
  'pkg-extra/me/preference-profile/index': { failed: false, totalCooks: 12, favoriteCuisine: '家常', favoriteTaste: '鲜香', historyTotal: 12, bars: [{ name: '家常', pct: 67, width: 67, grad: '#c74d32' }, { name: '快手', pct: 33, width: 33, grad: '#426851' }], cloud: [{ name: '鲜香', count: 8, size: 'lg' }, { name: '清淡', count: 4, size: 'md' }], topList: [{ rank: 1, recipeId: 101, title: recipe.title, img: recipe.cover, sub: '家常 · 鲜香', count: 5 }] },
  'pkg-extra/me/profile-edit/index': { avatarInitial: '家', form: { nickname: '家人', avatarUrl: '', gender: 'male', phone: '', birthday: '', tasteTags: ['鲜香'], avoid: [] } },
  'pkg-extra/me/feedback/index': { historyLoading: false, historyFailed: false, history: [] }
};
const selectors = {
  'community/post-detail': '.author', vip: '.cpt-head', 'vip/upgrade': '.vu-hero', 'vip/orders': '.head', 'payment/checkout': '.merchant', 'payment/success': '.ps-badge', favorites: '.fav-head', 'recipe-detail': '.rd-hero', 'recipe-edit': '.rc-seg', 'recipes/search': '.grid', 'auth/login': '.hero', 'auth/login-phone': '.lp-body', 'family/join': '.head', 'family/members': '.famcard', 'family/invite': '.fi-invite', 'me/settings': '.set-group', 'me/notifications': '.cpt-head', 'me/preference-profile': '.ov', 'me/feedback': '.fb-head', 'me/help-faq': '.searchwrap', 'me/about': '.brand', 'legal/terms': '.hero', 'legal/privacy': '.doctitle', 'legal/deletion': '.doctitle', 'me/profile-edit': '.pe-avatar-wrap'
};
function capture(entry, selector, suffix = '') {
  const image = suffix ? entry.image.replace('.jpg', `-${suffix}.jpg`) : entry.image;
  const result = cli('simulator_screenshot', ['--wait-for-selector', selector, '--wait', '0.3', '--path', path.join(__dirname, image)]);
  assert.ok(result.imageWidth > 0 && result.imageHeight > 0 && fs.statSync(path.join(__dirname, image)).size > 1000, `${entry.title} screenshot exists`);
  proof.screens = proof.screens.filter(x => x.image !== image);
  proof.screens.push({ route: entry.route, state: suffix || 'main', image, width: result.imageWidth, height: result.imageHeight, gated: entry.gated });
  if (suffix) entry.variants = [...(entry.variants || []).filter(x => x.label !== suffix), { label: suffix, image }];
  console.log(`Captured ${entry.title}${suffix ? ' / ' + suffix : ''}`);
}
try {
  for (const entry of catalog.pages) {
    if (entry.existing || (selected.size && !selected.has(entry.route)) || (!selected.size && entry.captured)) continue;
    if (entry.route === 'pkg-extra/cook-log/index') {
      // onLoad immediately switches tabs; the navigation response can time out after the redirect.
      let navigationNote;
      try { cli('automation_navigate', ['--action', 'reLaunch', '--url', '/' + entry.route]); }
      catch (err) { navigationNote = err.message; }
      assert.equal(current(), 'pages/cook-log/index');
      Object.assign(entry, { image: 'screens/app-record.jpg', status: '兼容入口 · 跳转记录页', captured: true });
      proof.routes.push({ route: entry.route, actualRoute: 'pages/cook-log/index', navigationNote, passed: true });
      continue;
    }
    let original, mocked = false;
    const selector = selectors[entry.route.replace('pkg-extra/', '').replace('/index', '')];
    assert.ok(selector, `${entry.route} has a template selector`);
    try {
      if (entry.gated) {
        cli('automation_wx_api', ['--action', 'mock', '--method', 'switchTab', '--result', '{}']);
        mocked = true;
      }
      cli('automation_navigate', ['--action', 'reLaunch', '--url', '/' + entry.route]);
      assert.equal(current(), entry.route);
      original = read();
      for (let attempt = 0; (original.loading || original.historyLoading || original.pageLoading) && !entry.gated && attempt < 5; attempt++) {
        original = cli('automation_page_action', ['--action', 'getData', '--wait', '1']).data;
      }
      assert.ok(entry.gated || (!original.loading && !original.historyLoading && !original.pageLoading), `${entry.route} load settled`);
      delete original.__webviewId__;
      proof.layouts = proof.layouts.filter(x => x.route !== entry.route);
      patch({ loading: false, loaded: true, loadError: false, loadFailed: false, loadErrorDesc: '', fontScale: 'normal', revealOn: false, ...(sample[entry.route] || {}) });
      cli('automation_viewport_action', ['--action', 'pageScrollTo', '--scroll-top', '0']);
      assert.equal(current(), entry.route, 'capture remains on intended route');
      if (entry.route === 'pkg-extra/me/notifications/index') {
        callPage('recompute');
        const notificationData = read();
        assert.equal(notificationData.visibleCount, 1, 'temporary pantry reminder remains visible after grouping');
        assert.equal(notificationData.groups[0].items[0].action.type, 'pantry', 'reminder opens the pantry');
        notificationLayout(entry, 'pantry-reminder');
      }
      capture(entry, selector);
      if (entry.route === 'pkg-extra/me/notifications/index') {
        patch({ fontScale: 'lg', 'all[0].title': '番茄、鸡蛋和香菇快到期了，今天做饭可以先看看', 'all[0].body': [{ t: 'n', v: '番茄今天到期；鸡蛋剩 2 天；香菇剩 1 天。先检查食材新鲜度，再安排做菜。进入冰箱可查看每种食材的数量和具体到期日。' }] });
        callPage('recompute');
        notificationLayout(entry, 'large-long-text'); capture(entry, '.ncard', '大字');
        patch({ fontScale: 'normal', 'all[0].unread': false });
        callPage('recompute');
        notificationLayout(entry, 'read'); capture(entry, '.ncard', '已读');
      }
      if (entry.route === 'pkg-extra/community/post-detail/index') {
        postLayout(entry, 'normal');
        const single = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => { const q = wx.createSelectorQuery(); q.select(".pimgs").boundingClientRect(); q.select(".pimg").boundingClientRect(); q.exec(resolve); }); }']).result.result;
        assert.ok(Math.abs(single[0].width - single[1].width) < 1, 'single photo uses gallery width');
        patch({ 'post.images': [recipe.cover, '/assets/dishes/stir-fry-veg.jpg', '/assets/dishes/egg-drop-soup.jpg'] });
        const multiple = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => wx.createSelectorQuery().selectAll(".pimg").boundingClientRect().exec(resolve)); }']).result.result[0];
        assert.ok(multiple.length === 3 && multiple.every(box => Math.abs(box.width - single[0].width) < 1), 'multiple photos use full-width slides');
        capture(entry, '.pimgs', '多图');
        patch({ photoIndex: 2 }); capture(entry, '.post-gallery', '多图第三张');
        patch({ photoIndex: 0 });
        patch({ 'post.images': [recipe.cover] });
        cli('automation_element_action', ['--action', 'scrollTo', '--selector', '.scroll', '--x', '0', '--y', '600']);
        capture(entry, '.cmt', '评论');
        patch({ fontScale: 'lg', 'post.author': '喜欢做家常菜的一家人', 'post.title': '今晚用冰箱里的番茄和鸡蛋做了一盘家常菜，一家人都说下次还想吃', 'post.paragraphs': ['今天先用掉冰箱里的番茄和鸡蛋，番茄炒出汁以后再放鸡蛋，拌饭的时候酸甜刚刚好。家人都说下次可以加一点香菇，一起做成晚餐。', '火候和用量写清楚以后，跟着做也方便很多。原作者分享的做法链接：https://example.com/recipes/family-tomato-egg-with-mushrooms-and-long-recipe-name'], 'post.recipe.title': '妈妈拿手的番茄鸡蛋炒香菇', 'comments[0].author': '爱吃妈妈做的家常菜的一家人', 'comments[0].content': '家人都很喜欢这个做法，明天想加一点香菇一起炒。火候和用量写清楚以后，跟着做也方便很多。' });
        postLayout(entry, 'large-long-text');
        capture(entry, '.cmt', '评论大字');
        cli('automation_element_action', ['--action', 'scrollTo', '--selector', '.scroll', '--x', '0', '--y', '0']);
        capture(entry, '.author', '大字');
        patch({ commentText: '想问问这个火候：\n番茄需要炒软多久？下次想加一点香菇。' });
        postLayout(entry, 'composing-large', true); capture(entry, '.send', '写评论');
        patch({ submitting: true }); postLayout(entry, 'submitting', true); capture(entry, '.send', '发送中');
        patch({ commentText: '', submitting: false }); postLayout(entry, 'reading-after-clear');
        patch({ fontScale: 'normal', 'post.title': post.title, 'post.paragraphs': post.paragraphs, 'post.images': [], 'post.imageErrors': [] });
        const empty = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => wx.createSelectorQuery().selectAll(".pimgs").boundingClientRect().exec(resolve)); }']).result.result[0];
        assert.equal(empty.length, 0, 'no-photo post leaves no empty gallery');
        postLayout(entry, 'text-only');
        capture(entry, '.recipe-card', '无图');
        patch({ 'post.images': ['/assets/dishes/missing-ui-proof.jpg'], 'post.imageErrors': [] });
        assert.equal(read().post.imageErrors[0], true, 'native image failure reaches onPhotoError');
        const failed = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => wx.createSelectorQuery().selectAll(".pimg.img-broken").boundingClientRect().exec(resolve)); }']).result.result[0];
        assert.equal(failed.length, 1, 'failed post image has explicit fallback');
        capture(entry, '.pimgs', '图片失效');
        patch({ 'post.images': [], comments: [], commentsError: false }); capture(entry, '.comment-empty', '无评论');
        patch({ commentsError: true }); capture(entry, '.comment-retry', '评论加载失败');
      }
      if (entry.route === 'pkg-extra/recipe-detail/index') {
        const rects = boxes(['.rd-card', '.rd-scroll']);
        const ingredientTop = Math.max(0, rects['.rd-card'].top - rects['.rd-scroll'].top - 160);
        cli('automation_element_action', ['--action', 'scrollTo', '--selector', '.rd-scroll', '--x', '0', '--y', String(ingredientTop)]);
        ingredientLayout(entry, 'ingredients');
        capture(entry, '.rd-ing', '食材');
        patch({ fontScale: 'lg', 'recipe.ingredients[2].name': '妈妈种的小葱和新鲜香菜', 'recipe.ingredients[2].amountText': '适量', 'recipe.ingredients[2].unit': '' });
        ingredientLayout(entry, 'ingredients-large-long-name');
        capture(entry, '.rd-ing', '食材大字');
        patch({ fontScale: 'normal', 'recipe.ingredients': ingredients });
        const emptySteps = cli('automation_evaluate', ['--fn-source', 'function() { return new Promise(resolve => wx.createSelectorQuery().selectAll(".rd-step-img").boundingClientRect().exec(resolve)); }']).result.result[0];
        assert.equal(emptySteps.length, 0, 'steps without photos leave no empty photo blocks');
        cli('automation_element_action', ['--action', 'scrollTo', '--selector', '.rd-scroll', '--x', '0', '--y', '600']);
        capture(entry, '.rd-step', '做法与评价');
      }
      if (entry.route === 'pkg-extra/payment/checkout/index') {
        checkoutLayout(entry, 'normal');
        patch({ fontScale: 'lg' });
        checkoutLayout(entry, 'large');
        capture(entry, '.merchant', '大字');
      }
      if (entry.route === 'pkg-extra/recipe-edit/index') {
        patch({ editTab: 'ings' }); capture(entry, '.rc-body', '用料');
        patch({ editTab: 'steps' }); capture(entry, '.rc-body', '步骤');
      }
      if (entry.route === 'pkg-extra/favorites/index') {
        patch({ activeTab: 'post' }); capture(entry, '.fav-pcard', '帖子');
      }
      entry.captured = true;
      if (!entry.gated) entry.status = ['pkg-extra/community/post-detail/index', 'pkg-extra/recipe-detail/index', 'pkg-extra/me/settings/index', 'pkg-extra/me/notifications/index'].includes(entry.route) ? '已优化 · 临时样例' : entry.route === 'pkg-extra/family/invite/index' ? '原有布局 · 获取失败态' : (sample[entry.route] ? '原有布局 · 临时样例' : '原有布局 · 待逐页标注');
      else if (entry.route === 'pkg-extra/payment/checkout/index') entry.status = '功能关闭 · 已优化布局';
      proof.routes = proof.routes.filter(x => x.route !== entry.route);
      proof.routes.push({ route: entry.route, actualRoute: entry.route, gated: entry.gated, temporarySample: !!sample[entry.route], passed: true });
    } finally {
      try { if (original && current() === entry.route) patch(original); }
      finally {
        if (mocked) cli('automation_wx_api', ['--action', 'restore', '--method', 'switchTab']);
        fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
        fs.writeFileSync(proofFile, JSON.stringify(proof, null, 2) + '\n');
      }
    }
  }
  const app = JSON.parse(fs.readFileSync(path.join(root, 'miniapp/app.json')));
  const formal = [...app.pages, ...(app.subPackages || app.subpackages).filter(x => x.root !== 'pkg-preview').flatMap(x => x.pages.map(p => x.root + '/' + p))];
  assert.deepEqual(new Set(catalog.pages.map(x => x.route)), new Set(formal));
  assert.equal(catalog.formalRoutes, formal.length);
  proof.passed = selected.size ? true : catalog.pages.every(x => fs.existsSync(path.join(__dirname, x.image)));
  assert.ok(proof.passed, 'every formal route has a screenshot');
  proof.formalRoutes = formal.length;
  cli('automation_navigate', ['--action', 'switchTab', '--url', '/pages/home/index']);
  console.log(`Formal route capture passed: ${formal.length} routes; Page data and wx mocks restored.`);
} finally {
  fs.writeFileSync(catalogFile, JSON.stringify(catalog, null, 2) + '\n');
  fs.writeFileSync(proofFile, JSON.stringify(proof, null, 2) + '\n');
}
