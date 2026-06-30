const state = {
  token: '',
  user: null,
  dashboard: null,
  recipes: [],
  communityPosts: [],
  communityReports: [],
  familyProfile: null,
  todayMenu: null,
  shoppingList: null,
  vipStatus: null,
  importPreview: null,
  activeSource: 'owned',
  activeCuisine: 'all',
  cuisineTabs: [],
  selectedCommunityPostId: null,
  communityComments: [],
  communityCommentDraft: '',
  communityReportReason: '内容不实',
  recipeSearch: ''
};

const sourceTabs = [
  { key: 'owned', label: '我做过的' },
  { key: 'community', label: '社区菜谱' },
  { key: 'imported', label: '链接导入' },
  { key: 'all', label: '随机推荐' }
];

const communityReportReasons = ['内容不实', '步骤不全', '疑似搬运', '其他'];

const $ = (id) => document.getElementById(id);

function setStatus(text, isError = false) {
  const el = $('statusText');
  el.textContent = text;
  el.style.color = isError ? 'var(--danger)' : 'var(--muted)';
}

function setToken(token) {
  state.token = token || '';
  if (token) {
    localStorage.setItem('family_menu_token', token);
  } else {
    localStorage.removeItem('family_menu_token');
  }
}

function getToken() {
  return state.token || localStorage.getItem('family_menu_token') || '';
}

async function request(path, options = {}) {
  const headers = {
    'Content-Type': 'application/json',
    ...(options.headers || {})
  };
  const token = getToken();
  if (token) {
    headers['X-Auth-Token'] = token;
  }
  const response = await fetch(path, {
    method: options.method || 'GET',
    headers,
    body: options.body
  });
  if (!response.ok) {
    throw new Error(`${response.status} ${response.statusText}`);
  }
  const text = await response.text();
  return text ? JSON.parse(text) : null;
}

async function guestLogin() {
  const response = await request('/api/auth/guest', { method: 'POST' });
  setToken(response.token);
  state.user = response.user;
  return response.user;
}

async function loadAll() {
  const [
    dashboard,
    recipes,
    communityPosts,
    communityReports,
    familyProfile,
    todayMenu,
    shoppingList,
    vipStatus
  ] = await Promise.all([
    request('/api/home/dashboard'),
    request('/api/recipes?source=all'),
    request('/api/community/posts'),
    request('/api/community/reports?status=PENDING'),
    request('/api/family/profile'),
    request('/api/daily-menu/today'),
    request('/api/shopping-list/today'),
    request('/api/vip/status')
  ]);

  state.dashboard = dashboard;
  state.recipes = recipes;
  state.communityPosts = communityPosts;
  state.communityReports = communityReports;
  state.familyProfile = familyProfile;
  state.todayMenu = todayMenu;
  state.shoppingList = shoppingList;
  state.vipStatus = vipStatus;
  if (!state.selectedCommunityPostId || !state.communityPosts.some((post) => String(post.id) === String(state.selectedCommunityPostId))) {
    state.selectedCommunityPostId = state.communityPosts[0] ? state.communityPosts[0].id : null;
    state.communityComments = [];
  }
  state.cuisineTabs = buildCuisineTabs();
  if (!state.cuisineTabs.some((tab) => tab.key === state.activeCuisine)) {
    state.activeCuisine = 'all';
  }
}

function buildCuisineTabs() {
  const counts = new Map();
  const allRecipes = state.recipes || [];
  for (const recipe of allRecipes) {
    const cuisine = normalizeCuisine(recipe.cuisine);
    counts.set(cuisine, (counts.get(cuisine) || 0) + 1);
  }
  return [
    { key: 'all', label: '全部' },
    ...Array.from(counts.entries())
      .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], 'zh-Hans-CN'))
      .map(([key]) => ({ key, label: key }))
  ];
}

function normalizeCuisine(cuisine) {
  return String(cuisine || '其他').trim() || '其他';
}

function setMarkup(target, markup) {
  target.replaceChildren();
  const range = document.createRange();
  range.selectNode(target);
  target.append(range.createContextualFragment(markup));
}

function visibleRecipes() {
  const search = state.recipeSearch.trim().toLowerCase();
  const list = state.recipes.filter((recipe) => {
    const sourceMatch = state.activeSource === 'all' || recipe.sourceType === state.activeSource;
    if (!sourceMatch) {
      return false;
    }
    const cuisineMatch = state.activeCuisine === 'all' || normalizeCuisine(recipe.cuisine) === state.activeCuisine;
    if (!cuisineMatch) {
      return false;
    }
    if (!search) {
      return true;
    }
    const target = [recipe.title, recipe.cuisine, recipe.summary, (recipe.tasteTags || []).join(' ')].join(' ').toLowerCase();
    return target.includes(search);
  });
  return state.activeSource === 'all' ? list.slice(0, 8) : list;
}

function recipeCard(recipe, withAddButton = true) {
  const tags = (recipe.tasteTags || []).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join('');
  return `
    <div class="card">
      <div class="title">${escapeHtml(recipe.title)}</div>
      <div class="meta-line">${escapeHtml(recipe.cuisine)} · ${recipe.timeCost} 分钟 · ${recipe.servings} 人份 · ${escapeHtml(recipe.sourceType)}</div>
      <div class="tag-row">${tags}</div>
      <div class="meta-line">${escapeHtml(recipe.summary || '')}</div>
      ${withAddButton ? `<div class="card-actions"><button class="btn secondary" data-action="add-to-menu" data-id="${recipe.id}">加入今日菜单</button></div>` : ''}
    </div>
  `;
}

function renderTabs() {
  setMarkup($('sourceTabs'), sourceTabs.map((tab) => `
    <button class="tab ${state.activeSource === tab.key ? 'active' : ''}" data-action="switch-source" data-source="${tab.key}">${tab.label}</button>
  `).join(''));
}

function renderCuisineTabs() {
  setMarkup($('cuisineTabs'), state.cuisineTabs.map((tab) => `
    <button class="tab ${state.activeCuisine === tab.key ? 'active' : ''}" data-action="switch-cuisine" data-cuisine="${tab.key}">${tab.label}</button>
  `).join(''));
}

function renderRecipes() {
  const list = visibleRecipes();
  setMarkup($('recipeList'), list.length
    ? list.map((recipe) => recipeCard(recipe, true)).join('')
    : '<div class="muted-box">没有符合条件的菜谱。</div>');
}

function renderTodayMenu() {
  const items = (state.todayMenu && state.todayMenu.items) || [];
  setMarkup($('todayMenu'), items.length
    ? items.map((item) => `
        <div class="card">
          <div class="title">${escapeHtml(item.recipe.title)}</div>
          <div class="meta-line">${escapeHtml(item.recipe.cuisine)} · ${escapeHtml(item.mealType)}</div>
          <div class="card-actions">
            <button class="btn ghost" data-action="remove-menu" data-id="${item.recipeId}">移除</button>
          </div>
        </div>
      `).join('')
    : '<div class="muted-box">还没有选择今日菜单。</div>');
}

function renderShoppingList() {
  const items = (state.shoppingList && state.shoppingList.items) || [];
  setMarkup($('shoppingList'), items.length
    ? items.map((item) => `
        <div class="check-row">
          <label>
            <input type="checkbox" data-action="toggle-purchased" data-id="${item.itemId}" ${item.purchased ? 'checked' : ''} />
            <span>
              <strong>${escapeHtml(item.ingredientName)}</strong>
              <br />
              <span class="muted">${escapeHtml([item.amount, item.unit].filter(Boolean).join(' '))}</span>
            </span>
          </label>
          <span class="badge">${item.purchased ? '已买' : '未买'}</span>
        </div>
      `).join('')
    : '<div class="muted-box">今日购物清单为空。</div>');
}

function renderFamilyMembers() {
  const members = (state.familyProfile && state.familyProfile.members) || [];
  setMarkup($('familyMembers'), members.length
    ? members.map((member, index) => `
        <div class="card">
          <div class="title">${index + 1}. ${escapeHtml(member.nickname)}</div>
          <div class="meta-line">${escapeHtml(member.role)} · ${escapeHtml(member.status)}</div>
        </div>
      `).join('')
    : '<div class="muted-box">暂无家庭成员。</div>');
}

function renderCommunityPosts() {
  setMarkup($('communityPosts'), state.communityPosts.length
    ? state.communityPosts.map((post) => {
        const selected = String(post.id) === String(state.selectedCommunityPostId);
        return `
          <div class="card ${selected ? 'card-active' : ''}">
            <div class="title">${escapeHtml(post.title)}</div>
            <div class="meta-line">${escapeHtml(post.author)} · ${post.likeCount} 赞 · ${post.commentCount} 评论 · ${post.favoriteCount || 0} 收藏</div>
            <div class="tag-row">${(post.tags || []).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}</div>
            <div class="meta-line">${escapeHtml(post.content)}</div>
            ${post.recipe ? `<div class="muted-box">关联菜谱：${escapeHtml(post.recipe.title)} · ${escapeHtml(post.recipe.cuisine)}</div>` : ''}
            <div class="card-actions">
              <button class="btn secondary" data-action="select-community" data-id="${post.id}">评论</button>
              <button class="btn ghost" data-action="toggle-favorite" data-id="${post.id}">${post.favorited ? '取消收藏' : '收藏'}</button>
              <button class="btn ghost" data-action="report-post" data-id="${post.id}">举报</button>
            </div>
          </div>
        `;
      }).join('')
    : '<div class="muted-box">暂无社区内容。</div>');
}

function renderCommunityDetail() {
  const container = $('communityDetail');
  const post = state.communityPosts.find((item) => String(item.id) === String(state.selectedCommunityPostId));
  if (!post) {
    setMarkup(container, '<div class="muted-box">选一条社区帖子，看评论、收藏和举报操作。</div>');
    return;
  }
  const comments = state.communityComments || [];
  setMarkup(container, `
    <div class="card card-active">
      <div class="title">社区互动</div>
      <div class="meta-line">${escapeHtml(post.title)} · ${escapeHtml(post.author)} · ${post.favoriteCount || 0} 收藏</div>
      <div class="tag-row">${(post.tags || []).map((tag) => `<span class="chip">${escapeHtml(tag)}</span>`).join('')}</div>
      <div class="meta-line">${escapeHtml(post.content)}</div>
      ${post.recipe ? `<div class="muted-box">关联菜谱：${escapeHtml(post.recipe.title)} · ${escapeHtml(post.recipe.cuisine)}</div>` : ''}
      <div class="card-actions">
        <button class="btn secondary" data-action="toggle-favorite" data-id="${post.id}">${post.favorited ? '取消收藏' : '收藏'}</button>
        <button class="btn ghost" data-action="report-post" data-id="${post.id}">举报</button>
      </div>
      <div class="muted-box">
        <strong>最新评论</strong>
        <div class="comment-list">
          ${comments.length ? comments.map((comment) => `
            <div class="comment-item">
              <div class="meta-line">${escapeHtml(comment.author)} · ${escapeHtml(comment.createdAt || '')}</div>
              <div>${escapeHtml(comment.content)}</div>
            </div>
          `).join('') : '<div class="muted">还没有评论，先发第一条。</div>'}
        </div>
      </div>
      <div class="toolbar">
        <input id="communityCommentInput" type="text" placeholder="写一条评论，讲讲你的做法" value="${escapeHtml(state.communityCommentDraft || '')}" />
        <button id="communityCommentSubmitBtn" class="btn primary" data-action="submit-community-comment">发布评论</button>
      </div>
      <div class="toolbar filter-bar">
        <span class="filter-label">举报理由</span>
        <div class="tabs" id="communityReportReasons"></div>
      </div>
      <div class="muted-box">举报后会进入审核队列。</div>
    </div>
  `);
  const reasons = $('communityReportReasons');
  if (reasons) {
    setMarkup(reasons, communityReportReasons.map((reason) => `
      <button class="tab ${state.communityReportReason === reason ? 'active' : ''}" data-action="set-report-reason" data-reason="${escapeHtml(reason)}">${escapeHtml(reason)}</button>
    `).join(''));
  }
}

function renderCommunityReports() {
  const reports = state.communityReports || [];
  setMarkup($('communityReports'), reports.length
    ? reports.map((report) => `
        <div class="card">
          <div class="title">${escapeHtml(report.postTitle)}</div>
          <div class="meta-line">${escapeHtml(report.reporter)} · ${escapeHtml(report.reason)} · ${escapeHtml(report.createdAt || '')}</div>
          <div class="tag-row">
            <span class="chip danger-chip">${escapeHtml(report.status)}</span>
          </div>
          <div class="card-actions">
            <button class="btn secondary" data-action="review-report" data-id="${report.reportId}" data-status="REVIEWED">标记已处理</button>
            <button class="btn ghost" data-action="review-report" data-id="${report.reportId}" data-status="IGNORED">忽略</button>
          </div>
        </div>
      `).join('')
    : '<div class="muted-box">暂无待处理举报。</div>');
}

function renderProfile() {
  const membersCount = (state.familyProfile && state.familyProfile.members || []).length;
  const vip = state.vipStatus || { planName: '免费版', benefits: [], adPlacements: [] };
  setMarkup($('profilePanel'), `
    <div class="card">
      <div class="title">${escapeHtml(state.user?.nickname || '阿昊')}</div>
      <div class="meta-line">${escapeHtml(state.familyProfile?.familyName || '周末厨房')} · 家庭 ID ${state.familyProfile?.familyId ?? '-'}</div>
      <div class="meta-line">成员数量：${membersCount} · 当前版本：${vip.vip ? 'VIP' : '免费版'}</div>
    </div>
    <div class="card">
      <div class="title">VIP 价值</div>
      <div class="tag-row">${(vip.benefits || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>
    </div>
    <div class="card">
      <div class="title">广告位预留</div>
      <div class="tag-row">${(vip.adPlacements || []).map((item) => `<span class="chip">${escapeHtml(item)}</span>`).join('')}</div>
    </div>
  `);
}

function renderImportPreview() {
  const preview = state.importPreview;
  if (!preview) {
    setMarkup($('importPreview'), '<div class="muted-box">解析结果会显示在这里。</div>');
    return;
  }
  setMarkup($('importPreview'), `
    <div class="card">
      <div class="title">${escapeHtml(preview.title)}</div>
      <div class="meta-line">${escapeHtml(preview.detectedCuisine)} · 来源：${escapeHtml(preview.sourceType)} · 置信度 ${Number(preview.confidence).toFixed(2)}</div>
      ${preview.sourceUrl ? `<div class="muted-box">${escapeHtml(preview.sourceUrl)}</div>` : ''}
      <div class="tag-row">${(preview.notes || []).map((note) => `<span class="chip">${escapeHtml(note)}</span>`).join('')}</div>
      <div class="muted-box">
        <strong>食材</strong><br />
        ${(preview.ingredients || []).map((ingredient) => escapeHtml(ingredient.name)).join('<br />') || '无'}
      </div>
      <div class="muted-box" style="margin-top: 10px;">
        <strong>步骤</strong><br />
        ${(preview.steps || []).map((step, index) => formatImportStep(step, index)).join('<br />') || '无'}
      </div>
    </div>
  `);
}

function formatImportStep(step, index) {
  const normalized = String(step ?? '').replace(/^\s*\d+[.、)]\s*/, '');
  return `${index + 1}. ${escapeHtml(normalized)}`;
}

function renderHeader() {
  $('userBadge').textContent = state.user ? state.user.nickname : '游客';
  $('familyBadge').textContent = `家庭 ID ${state.familyProfile?.familyId ?? '-'}`;
  $('vipBadge').textContent = state.vipStatus?.vip ? 'VIP' : '免费版';
}

function renderSkeletons() {
  const panels = ['recipeList', 'todayMenu', 'shoppingList', 'familyMembers', 'communityPosts', 'communityReports', 'profilePanel'];
  for (const id of panels) {
    const el = $(id);
    if (el) {
      setMarkup(el, '<div class="skeleton"></div><div class="skeleton"></div>');
    }
  }
}

function renderFatalError(message) {
  const rest = ['todayMenu', 'shoppingList', 'familyMembers', 'communityPosts', 'communityReports', 'profilePanel'];
  for (const id of rest) {
    const el = $(id);
    if (el) {
      setMarkup(el, '<div class="muted-box">加载失败，请先重试。</div>');
    }
  }
  setMarkup($('recipeList'), `
    <div class="error-box">
      <span>加载失败：${escapeHtml(message)}</span>
      <button type="button" class="btn" data-action="retry-load">重试</button>
    </div>
  `);
}

function renderAll() {
  renderHeader();
  renderTabs();
  renderCuisineTabs();
  renderRecipes();
  renderTodayMenu();
  renderShoppingList();
  renderFamilyMembers();
  renderCommunityPosts();
  renderCommunityDetail();
  renderCommunityReports();
  renderProfile();
  renderImportPreview();
}

async function refreshDashboard() {
  await loadAll();
  renderAll();
}

async function addToMenu(recipeId) {
  await request('/api/daily-menu/today/items', {
    method: 'POST',
    body: JSON.stringify({ recipeId, mealType: 'dinner' })
  });
  await refreshTodayBlocks();
}

async function removeFromMenu(recipeId) {
  await request(`/api/daily-menu/today/items/${recipeId}`, { method: 'DELETE' });
  await refreshTodayBlocks();
}

async function togglePurchased(itemId, purchased) {
  await request(`/api/shopping-list/today/items/${itemId}`, {
    method: 'PATCH',
    body: JSON.stringify({ purchased })
  });
  state.shoppingList = await request('/api/shopping-list/today');
  renderShoppingList();
}

async function refreshTodayBlocks() {
  state.todayMenu = await request('/api/daily-menu/today');
  state.shoppingList = await request('/api/shopping-list/today');
  renderTodayMenu();
  renderShoppingList();
}

function getCommunityPost(postId) {
  return state.communityPosts.find((post) => String(post.id) === String(postId)) || null;
}

async function loadCommunityComments(postId) {
  if (!postId) {
    state.communityComments = [];
    renderCommunityDetail();
    return;
  }
  state.selectedCommunityPostId = postId;
  state.communityComments = await request(`/api/community/posts/${postId}/comments`);
  renderCommunityDetail();
}

async function selectCommunityPost(postId) {
  await loadCommunityComments(postId);
}

async function toggleCommunityFavorite(postId) {
  const updated = await request(`/api/community/posts/${postId}/favorite`, {
    method: 'POST'
  });
  state.communityPosts = state.communityPosts.map((post) => (String(post.id) === String(updated.id) ? updated : post));
  renderCommunityPosts();
  renderCommunityDetail();
}

async function submitCommunityComment() {
  const postId = state.selectedCommunityPostId;
  const content = (state.communityCommentDraft || '').trim();
  if (!postId) {
    setStatus('先选择一条社区帖子。', true);
    return;
  }
  if (!content) {
    setStatus('先写一条评论。', true);
    return;
  }
  await request(`/api/community/posts/${postId}/comments`, {
    method: 'POST',
    body: JSON.stringify({ content })
  });
  state.communityCommentDraft = '';
  await refreshDashboard();
  await loadCommunityComments(postId);
  setStatus('评论已发布');
}

async function reportCommunityPost(postId) {
  if (!postId) {
    return;
  }
  await request(`/api/community/posts/${postId}/report`, {
    method: 'POST',
    body: JSON.stringify({ reason: state.communityReportReason || '内容不实' })
  });
  state.communityReports = await request('/api/community/reports?status=PENDING');
  renderCommunityReports();
  setStatus('已提交举报');
}

async function refreshCommunityReports() {
  state.communityReports = await request('/api/community/reports?status=PENDING');
  renderCommunityReports();
}

async function reviewCommunityReport(reportId, status) {
  await request(`/api/community/reports/${reportId}/review`, {
    method: 'POST',
    body: JSON.stringify({ status, note: status === 'IGNORED' ? '已忽略重复举报' : '已完成人工处理' })
  });
  await refreshCommunityReports();
  setStatus(status === 'IGNORED' ? '举报已忽略' : '举报已处理');
}

async function addMember() {
  const input = $('memberName');
  const nickname = input.value.trim();
  if (!nickname) {
    return;
  }
  await request('/api/family/members', {
    method: 'POST',
    body: JSON.stringify({ nickname, role: 'member' })
  });
  input.value = '';
  state.familyProfile = await request('/api/family/profile');
  renderFamilyMembers();
  renderProfile();
}

async function previewImport() {
  const rawText = $('importRaw').value.trim();
  if (!rawText) {
    setStatus('先输入导入文本。', true);
    return;
  }
  state.importPreview = await request('/api/import/preview', {
    method: 'POST',
    body: JSON.stringify({ rawText })
  });
  renderImportPreview();
}

async function saveImport() {
  if (!state.importPreview) {
    setStatus('先解析一次配方。', true);
    return;
  }
  await request('/api/recipes', {
    method: 'POST',
    body: JSON.stringify({
      title: state.importPreview.title,
      sourceType: 'imported',
      sourceUrl: state.importPreview.sourceUrl || '',
      cuisine: state.importPreview.detectedCuisine,
      tasteTags: ['自家录入', '待复核'],
      timeCost: 15,
      servings: 2,
      steps: state.importPreview.steps || [],
      ingredients: state.importPreview.ingredients || [],
      summary: '从浏览器预览页整理保存'
    })
  });
  await refreshDashboard();
  state.activeSource = 'imported';
  renderTabs();
  renderRecipes();
}

async function bindActions() {
  document.addEventListener('click', async (event) => {
    const actionTarget = event.target.closest('[data-action]');
    if (!actionTarget) {
      return;
    }
    const action = actionTarget.dataset.action;
    const id = actionTarget.dataset.id;
    if (action === 'retry-load') {
      await main();
      return;
    }
    if (action === 'switch-source') {
      state.activeSource = actionTarget.dataset.source;
      renderTabs();
      renderCuisineTabs();
      renderRecipes();
      return;
    }
    if (action === 'switch-cuisine') {
      state.activeCuisine = actionTarget.dataset.cuisine;
      renderCuisineTabs();
      renderRecipes();
      return;
    }
    if (action === 'select-community') {
      await selectCommunityPost(id);
      return;
    }
    if (action === 'toggle-favorite') {
      await toggleCommunityFavorite(id);
      return;
    }
    if (action === 'report-post') {
      await reportCommunityPost(id);
      return;
    }
    if (action === 'set-report-reason') {
      state.communityReportReason = actionTarget.dataset.reason || '内容不实';
      renderCommunityDetail();
      return;
    }
    if (action === 'submit-community-comment') {
      await submitCommunityComment();
      return;
    }
    if (action === 'review-report') {
      await reviewCommunityReport(id, actionTarget.dataset.status || 'REVIEWED');
      return;
    }
    if (action === 'add-to-menu') {
      await addToMenu(id);
      return;
    }
    if (action === 'remove-menu') {
      await removeFromMenu(id);
      return;
    }
    if (action === 'toggle-purchased') {
      const checked = Boolean(actionTarget.checked);
      await togglePurchased(id, checked);
    }
  });

  $('recipeSearch').addEventListener('input', (event) => {
    state.recipeSearch = event.target.value || '';
    renderRecipes();
  });

  $('addMemberForm').addEventListener('submit', (event) => {
    event.preventDefault();
    addMember();
  });

  document.addEventListener('input', (event) => {
    if (event.target && event.target.id === 'communityCommentInput') {
      state.communityCommentDraft = event.target.value || '';
    }
  });

  $('randomPickBtn').addEventListener('click', async () => {
    const list = visibleRecipes();
    if (!list.length) {
      return;
    }
    const pick = list[Math.floor(Math.random() * list.length)];
    await addToMenu(pick.id);
  });

  $('reloadMenuBtn').addEventListener('click', refreshTodayBlocks);
  $('reloadReportsBtn').addEventListener('click', refreshCommunityReports);
  $('rebuildShoppingBtn').addEventListener('click', async () => {
    state.shoppingList = await request('/api/shopping-list/today/rebuild', { method: 'POST' });
    renderShoppingList();
  });
  $('sampleImportBtn').addEventListener('click', () => {
    $('importRaw').value = '蒜蓉西兰花\n西兰花 1 颗\n蒜 5 瓣\n1. 西兰花焯水\n2. 蒜末爆香\n3. 快速翻炒';
  });
  $('previewImportBtn').addEventListener('click', previewImport);
  $('saveImportBtn').addEventListener('click', saveImport);
}

function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}

let actionsBound = false;

async function main() {
  try {
    if (!actionsBound) {
      await bindActions();
      actionsBound = true;
    }
    renderSkeletons();
    setStatus('正在登录游客会话...');
    const user = await guestLogin();
    setStatus(`已登录：${user.nickname}`);
    await refreshDashboard();
    if (state.selectedCommunityPostId) {
      await loadCommunityComments(state.selectedCommunityPostId);
    }
  } catch (error) {
    console.error(error);
    setStatus(`启动失败：${error.message}`, true);
    renderFatalError(error.message);
  }
}

main();
