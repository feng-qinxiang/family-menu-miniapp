/**
 * 运营后台 · 原生 JS，无打包（项目零构建工具链，刻意不引入 npm）。
 * 数据全部来自 /api/admin/**，token 仅存内存 + sessionStorage（关闭标签页即失效）。
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'admin_token';
  var state = {
    token: '',
    nickname: '',
    tab: 'dashboard',
    dashboard: null,
    reports: [],
    reportFilter: 'PENDING',
    users: { items: [], total: 0, page: 0, size: 20 },
    userKeyword: '',
    feedback: [],
    feedbackFilter: 'OPEN',
    posts: [],
    postFilter: '',
    recipes: [],
    recipeFilter: 'ACTIVE',
    recipeKeyword: '',
    comments: [],
    commentPostId: '',
    commentFilter: 'PENDING',
    orders: [],
    orderFilter: '',
    audit: [],
    auditKeyword: '',
    imports: [],
    importFilter: 'PENDING'
  };

  var $ = function (id) { return document.getElementById(id); };

  function toast(text, ms) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.hidden = false;
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.hidden = true; }, ms || 2200);
  }

  function setLoginMsg(text, kind) {
    var el = $('loginMsg');
    el.textContent = text || '';
    el.className = 'msg' + (kind ? ' ' + kind : '');
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  function request(path, options) {
    var opts = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['X-Auth-Token'] = state.token;
    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 401) {
        logout(true);
        throw new Error('登录已失效，请重新登录');
      }
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) throw new Error((data && data.error) || ('请求失败 ' + res.status));
        return data;
      });
    });
  }

  // ---------------- 登录 ----------------
  function sendOtp() {
    var phone = ($('phone').value || '').trim();
    if (!/^1\d{10}$/.test(phone)) { setLoginMsg('请输入正确的 11 位手机号', 'error'); return; }
    var btn = $('sendOtpBtn');
    btn.disabled = true;
    btn.textContent = '发送中…';
    request('/api/admin/auth/otp', { method: 'POST', body: { phone: phone } })
      .then(function (res) {
        setLoginMsg(res && res.devCode ? ('调试验证码：' + res.devCode) : '验证码已发送', 'ok');
        startCountdown(btn, 60);
      })
      .catch(function (err) {
        setLoginMsg(err.message, 'error');
        btn.disabled = false;
        btn.textContent = '获取验证码';
      });
  }

  function startCountdown(btn, seconds) {
    var left = seconds;
    btn.textContent = left + 's';
    var timer = setInterval(function () {
      left -= 1;
      if (left <= 0) { clearInterval(timer); btn.disabled = false; btn.textContent = '获取验证码'; }
      else { btn.textContent = left + 's'; }
    }, 1000);
  }

  function login(event) {
    if (event) event.preventDefault();
    var phone = ($('phone').value || '').trim();
    var code = ($('code').value || '').trim();
    if (!/^1\d{10}$/.test(phone)) { setLoginMsg('请输入正确的手机号', 'error'); return; }
    if (!/^\d{6}$/.test(code)) { setLoginMsg('请输入 6 位验证码', 'error'); return; }
    var btn = $('loginBtn');
    btn.disabled = true;
    setLoginMsg('');
    request('/api/admin/auth/login', { method: 'POST', body: { phone: phone, code: code } })
      .then(function (res) {
        state.token = res.token;
        state.nickname = res.nickname || '管理员';
        try { sessionStorage.setItem(TOKEN_KEY, res.token); } catch (e) {}
        showApp();
      })
      .catch(function (err) { setLoginMsg(err.message, 'error'); btn.disabled = false; });
  }

  function logout(silent) {
    state.token = '';
    try { sessionStorage.removeItem(TOKEN_KEY); } catch (e) {}
    $('appView').hidden = true;
    $('loginView').hidden = false;
    $('loginBtn').disabled = false;
    if (!silent) setLoginMsg('已退出', 'ok');
  }

  function showApp() {
    $('loginView').hidden = true;
    $('appView').hidden = false;
    $('adminName').textContent = state.nickname;
    renderTabs();
    loadTab();
  }

  // ---------------- 标签页 ----------------
  var TABS = [
    { key: 'dashboard', label: '看板' },
    { key: 'reports', label: '举报审核' },
    { key: 'posts', label: '内容治理' },
    { key: 'comments', label: '评论管理' },
    { key: 'recipes', label: '菜谱治理' },
    { key: 'feedback', label: '反馈工单' },
    { key: 'imports', label: '导入审核' },
    { key: 'users', label: '用户管理' },
    { key: 'orders', label: '订单' },
    { key: 'audit', label: '审计日志' }
  ];

  function renderTabs() {
    $('navTabs').innerHTML = TABS.map(function (t) {
      return '<div class="tab ' + (state.tab === t.key ? 'on' : '') + '" data-tab="' + t.key + '">' + t.label + '</div>';
    }).join('');
  }

  function loadTab() {
    var loaders = {
      dashboard: loadDashboard, reports: loadReports, posts: loadPosts,
      comments: loadComments, recipes: loadRecipes, feedback: loadFeedback,
      imports: loadImports, users: loadUsers, orders: loadOrders, audit: loadAudit
    };
    (loaders[state.tab] || loadDashboard)();
  }

  function loadingCard() {
    $('panelRoot').innerHTML = '<div class="card"><p class="muted">加载中…</p></div>';
  }

  function errorCard(err) {
    $('panelRoot').innerHTML = '<div class="card"><p class="msg error">' + escapeHtml(err.message) + '</p></div>';
  }

  // ---------------- 看板 ----------------
  function loadDashboard() {
    loadingCard();
    request('/api/admin/dashboard')
      .then(function (d) {
        state.dashboard = d;
        // 待办类指标可点击直达对应页面；有积压时标红提醒
        var cells = [
          { label: '用户数', value: d.userCount },
          { label: '家庭数', value: d.familyCount },
          { label: '在线菜谱', value: d.recipeCount },
          { label: '已发布帖子', value: d.postCount },
          { label: '待审帖子', value: d.pendingPostCount, tab: 'posts', filter: 'PENDING' },
          { label: '待审评论', value: d.pendingCommentCount, tab: 'comments', filter: 'PENDING' },
          { label: '待处理举报', value: d.pendingReportCount, tab: 'reports', filter: 'PENDING' },
          { label: '待处理反馈', value: d.openFeedbackCount, tab: 'feedback', filter: 'OPEN' },
          { label: '已支付订单', value: d.paidOrderCount, tab: 'orders', filter: 'PAID' },
          { label: '有效会员', value: d.activeVipCount }
        ];
        $('panelRoot').innerHTML =
          '<div class="card"><h2>运营概览</h2><div class="stat-grid">' +
          cells.map(function (c) {
            var alert = c.tab && Number(c.value) > 0;
            var attrs = c.tab
              ? ' data-goto="' + c.tab + '" data-gotofilter="' + (c.filter || '') + '" role="button" tabindex="0"'
              : '';
            return '<div class="stat' + (alert ? ' stat-alert' : '') + (c.tab ? ' stat-link' : '') + '"' + attrs + '>' +
              '<div class="stat-num">' + escapeHtml(String(c.value)) + '</div>' +
              '<div class="stat-label">' + escapeHtml(c.label) + (c.tab ? ' ›' : '') + '</div></div>';
          }).join('') + '</div>' +
          '<p class="muted" style="margin-top:14px">统计时间：' + escapeHtml(d.generatedAt) +
          '　·　点击带 › 的指标可直达对应列表</p></div>';
      })
      .catch(errorCard);
  }

  /** 看板指标 → 跳转到对应标签页并带上筛选条件 */
  function gotoStat(tab, filter) {
    state.tab = tab;
    if (tab === 'posts') state.postFilter = filter || '';
    if (tab === 'comments') state.commentFilter = filter || '';
    if (tab === 'reports') state.reportFilter = filter || '';
    if (tab === 'feedback') state.feedbackFilter = filter || '';
    if (tab === 'orders') state.orderFilter = filter || '';
    renderTabs();
    loadTab();
  }

  // ---------------- 举报审核 ----------------
  function loadReports() {
    loadingCard();
    request('/api/community/reports?status=' + encodeURIComponent(state.reportFilter || ''))
      .then(function (list) { state.reports = Array.isArray(list) ? list : []; renderReports(); })
      .catch(errorCard);
  }

  function renderReports() {
    var rows = state.reports;
    var filters = [['PENDING', '待处理'], ['REMOVED', '已下架'], ['IGNORED', '已忽略'], ['', '全部']];
    var head = '<div class="toolbar">' + filters.map(function (f) {
      return '<button class="btn small ' + (state.reportFilter === f[0] ? 'primary-sm' : '') +
        '" data-rptfilter="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '<span class="muted" style="align-self:center">共 ' + escapeHtml(String(rows.length)) + ' 条</span></div>';
    var body = rows.length ? rows.map(function (r) {
      var pending = r.status === 'PENDING';
      var pill = pending ? '<span class="pill pending">待处理</span>'
        : (r.status === 'REMOVED' ? '<span class="pill bad">已下架</span>' : '<span class="pill">已忽略</span>');
      return '<tr><td>' + escapeHtml(String(r.reportId)) + '</td><td>#' + escapeHtml(String(r.postId)) + '</td>' +
        '<td>' + escapeHtml(r.reason || '') + '</td><td class="clamp">' + escapeHtml(r.description || '—') + '</td>' +
        '<td>' + pill + '</td>' +
        '<td>' + escapeHtml(r.createdAt || '') + '</td><td class="actions">' +
        (pending
          ? '<button class="btn small danger" data-review="' + escapeHtml(String(r.reportId)) + '" data-status="REMOVED">下架帖子</button> ' +
            '<button class="btn small" data-review="' + escapeHtml(String(r.reportId)) + '" data-status="IGNORED">忽略</button>'
          : escapeHtml(r.reviewNote || '—')) +
        '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty">没有举报记录</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>举报审核</h2>' + head +
      '<table><thead><tr><th>ID</th><th>帖子</th><th>原因</th><th>说明</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function reviewReport(reportId, status) {
    request('/api/community/reports/' + encodeURIComponent(reportId) + '/review', {
      method: 'POST', body: { status: status, note: '' }
    }).then(function () {
      toast(status === 'REMOVED' ? '已下架' : '已忽略');
      loadReports();
    }).catch(function (err) { toast(err.message); });
  }

  // ---------------- 内容治理 ----------------
  function loadPosts() {
    loadingCard();
    request('/api/admin/posts?auditStatus=' + encodeURIComponent(state.postFilter))
      .then(function (list) { state.posts = Array.isArray(list) ? list : []; renderPosts(); })
      .catch(errorCard);
  }

  function renderPosts() {
    var rows = state.posts;
    var filters = [['PENDING', '待审核'], ['', '全部'], ['APPROVED', '已发布'], ['REMOVED', '已下架']];
    var head = '<div class="toolbar">' + filters.map(function (f) {
      return '<button class="btn small ' + (state.postFilter === f[0] ? 'primary-sm' : '') +
        '" data-postfilter="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    var body = rows.length ? rows.map(function (p) {
      var removed = p.auditStatus === 'REMOVED';
      var pending = p.auditStatus === 'PENDING';
      var pill = removed ? '<span class="pill bad">已下架</span>'
        : (pending ? '<span class="pill pending">待审核</span>' : '<span class="pill ok">已发布</span>');
      var actions = '';
      if (pending) {
        actions = '<button class="btn small primary-sm" data-poststatus="' + escapeHtml(String(p.id)) +
            '" data-on="APPROVED">通过</button> ' +
          '<button class="btn small danger" data-poststatus="' + escapeHtml(String(p.id)) +
            '" data-on="REMOVED">下架</button>';
      } else if (removed) {
        actions = '<button class="btn small" data-poststatus="' + escapeHtml(String(p.id)) +
          '" data-on="APPROVED">恢复</button>';
      } else {
        actions = '<button class="btn small danger" data-poststatus="' + escapeHtml(String(p.id)) +
          '" data-on="REMOVED">下架</button>';
      }
      return '<tr><td>' + escapeHtml(String(p.id)) + '</td><td>' + escapeHtml(p.title || '') + '</td>' +
        '<td>' + escapeHtml(p.author || '') + '</td>' +
        '<td>' + pill + '</td>' +
        '<td>' + escapeHtml(String(p.likeCount)) + '</td><td>' + escapeHtml(String(p.commentCount)) + '</td>' +
        '<td>' + escapeHtml(p.createdAt || '') + '</td><td class="actions">' + actions + '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">没有内容</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>帖子治理</h2>' + head +
      '<table><thead><tr><th>ID</th><th>标题</th><th>作者</th><th>状态</th><th>赞</th><th>评论</th><th>时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function setPostStatus(postId, status) {
    request('/api/admin/posts/' + encodeURIComponent(postId) + '/status', {
      method: 'POST', body: { status: status }
    }).then(function () { toast(status === 'REMOVED' ? '已下架' : (status === 'APPROVED' ? '已通过' : '已更新')); loadPosts(); })
      .catch(function (err) { toast(err.message); });
  }

  // ---------------- 评论管理 ----------------
  function loadComments() {
    loadingCard();
    var q = '/api/admin/comments?limit=200' +
      '&auditStatus=' + encodeURIComponent(state.commentFilter || '') +
      (state.commentPostId ? '&postId=' + encodeURIComponent(state.commentPostId) : '');
    request(q)
      .then(function (list) { state.comments = Array.isArray(list) ? list : []; renderComments(); })
      .catch(errorCard);
  }

  function renderComments() {
    var rows = state.comments;
    var filters = [['PENDING', '待审核'], ['APPROVED', '已通过'], ['REMOVED', '已驳回'], ['', '全部']];
    var head = '<div class="toolbar">' + filters.map(function (f) {
      return '<button class="btn small ' + (state.commentFilter === f[0] ? 'primary-sm' : '') +
        '" data-cmtfilter="' + f[0] + '">' + f[1] + '</button>';
    }).join('') +
      '<input id="commentPostFilter" type="search" placeholder="按帖子 ID 过滤（留空看全部）" value="' +
      escapeHtml(state.commentPostId) + '" /><button class="btn" id="commentFilterBtn">过滤</button>' +
      '<span class="muted" style="align-self:center">共 ' + escapeHtml(String(rows.length)) + ' 条</span></div>';
    var body = rows.length ? rows.map(function (c) {
      var pill = c.deleted
        ? '<span class="pill bad">已删除</span>'
        : (c.auditStatus === 'PENDING'
          ? '<span class="pill pending">待审核</span>'
          : (c.auditStatus === 'REMOVED'
            ? '<span class="pill bad">已驳回</span>'
            : '<span class="pill ok">已通过</span>'));
      var cid = escapeHtml(String(c.commentId));
      var actions = '';
      if (c.auditStatus === 'PENDING') {
        actions += '<button class="btn small primary-sm" data-cmtstatus="' + cid + '" data-on="APPROVED">通过</button> ' +
          '<button class="btn small danger" data-cmtstatus="' + cid + '" data-on="REMOVED">驳回</button> ';
      } else if (c.auditStatus === 'REMOVED') {
        actions += '<button class="btn small" data-cmtstatus="' + cid + '" data-on="APPROVED">恢复可见</button> ';
      }
      actions += c.deleted
        ? '<button class="btn small" data-cmtrestore="' + cid + '">恢复</button>'
        : '<button class="btn small danger" data-cmtdel="' + cid + '">删除</button>';
      return '<tr><td>' + cid + '</td>' +
        '<td>#' + escapeHtml(String(c.postId)) + ' ' + escapeHtml(c.postTitle || '') + '</td>' +
        '<td>' + escapeHtml(c.authorNickname || ('用户' + c.authorUserId)) + '</td>' +
        '<td class="clamp">' + escapeHtml(c.content || '') + '</td>' +
        '<td>' + pill + '</td>' +
        '<td>' + escapeHtml(c.createdAt || '') + '</td><td class="actions">' + actions + '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty">没有评论</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>评论管理</h2>' +
      '<p class="muted">「待审核」是机审无法判定的评论（游客账号没有真实微信 openid）：作者本人可见，其他人看不到，需要你在这里通过或驳回。</p>' +
      head +
      '<table><thead><tr><th>ID</th><th>帖子</th><th>作者</th><th>内容</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function setCommentStatus(commentId, status) {
    request('/api/admin/comments/' + encodeURIComponent(commentId) + '/status', {
      method: 'POST', body: { status: status }
    }).then(function () { toast(status === 'APPROVED' ? '已通过' : '已驳回'); loadComments(); })
      .catch(function (err) { toast(err.message); });
  }

  function deleteComment(commentId) {
    if (!window.confirm('确认删除该评论？（软删除，可在「已删除」中恢复）')) return;
    request('/api/admin/comments/' + encodeURIComponent(commentId), { method: 'DELETE' })
      .then(function () { toast('已删除'); loadComments(); })
      .catch(function (err) { toast(err.message); });
  }

  function restoreComment(commentId) {
    request('/api/admin/comments/' + encodeURIComponent(commentId) + '/restore', { method: 'POST' })
      .then(function () { toast('已恢复'); loadComments(); })
      .catch(function (err) { toast(err.message); });
  }

  // ---------------- 菜谱治理 ----------------
  function loadRecipes() {
    loadingCard();
    request('/api/admin/recipes?keyword=' + encodeURIComponent(state.recipeKeyword || '') +
      '&status=' + encodeURIComponent(state.recipeFilter))
      .then(function (list) { state.recipes = Array.isArray(list) ? list : []; renderRecipes(); })
      .catch(errorCard);
  }

  function renderRecipes() {
    var rows = state.recipes;
    var filters = [['ACTIVE', '在线'], ['REMOVED', '已下架'], ['', '全部']];
    var head = '<div class="toolbar">' + filters.map(function (f) {
      return '<button class="btn small ' + (state.recipeFilter === f[0] ? 'primary-sm' : '') +
        '" data-recipefilter="' + f[0] + '">' + f[1] + '</button>';
    }).join('') +
      '<input id="recipeSearch" type="search" placeholder="按标题搜索" value="' +
      escapeHtml(state.recipeKeyword) + '" /><button class="btn" id="recipeSearchBtn">搜索</button>' +
      '</div>';
    var body = rows.length ? rows.map(function (r) {
      var removed = r.status === 'REMOVED';
      return '<tr><td>' + escapeHtml(String(r.recipeId)) + '</td><td>' + escapeHtml(r.title || '') + '</td>' +
        '<td>' + escapeHtml(r.ownerNickname || '—') + '</td>' +
        '<td>' + escapeHtml(r.cuisine || '—') + '</td>' +
        '<td>' + escapeHtml(r.timeCost != null ? r.timeCost + ' 分钟' : '—') + '</td>' +
        '<td>' + (removed ? '<span class="pill bad">已下架</span>' : '<span class="pill ok">在线</span>') + '</td>' +
        '<td>' + escapeHtml(r.createdAt || '') + '</td><td class="actions">' +
        (removed
          ? '<button class="btn small" data-recipestatus="' + escapeHtml(String(r.recipeId)) + '" data-on="ACTIVE">恢复</button>'
          : '<button class="btn small danger" data-recipestatus="' + escapeHtml(String(r.recipeId)) + '" data-on="REMOVED">下架</button>') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">没有菜谱</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>菜谱治理</h2>' + head +
      '<table><thead><tr><th>ID</th><th>标题</th><th>作者</th><th>菜系</th><th>耗时</th><th>状态</th><th>创建时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function setRecipeStatus(recipeId, status) {
    if (status === 'REMOVED' && !window.confirm('确认下架该菜谱？用户端将不再展示。')) return;
    request('/api/admin/recipes/' + encodeURIComponent(recipeId) + '/status', {
      method: 'POST', body: { status: status }
    }).then(function () { toast(status === 'REMOVED' ? '已下架' : '已恢复'); loadRecipes(); })
      .catch(function (err) { toast(err.message); });
  }

  // ---------------- 反馈工单 ----------------
  function loadFeedback() {
    loadingCard();
    request('/api/admin/feedback?status=' + encodeURIComponent(state.feedbackFilter))
      .then(function (list) { state.feedback = Array.isArray(list) ? list : []; renderFeedback(); })
      .catch(errorCard);
  }

  function renderFeedback() {
    var rows = state.feedback;
    var filters = [['OPEN', '待处理'], ['PROCESSING', '处理中'], ['CLOSED', '已关闭'], ['', '全部']];
    var head = '<div class="toolbar">' + filters.map(function (f) {
      return '<button class="btn small ' + (state.feedbackFilter === f[0] ? 'primary-sm' : '') +
        '" data-fbfilter="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    var body = rows.length ? rows.map(function (f) {
      var pill = f.status === 'CLOSED' ? 'ok' : (f.status === 'PROCESSING' ? 'pending' : 'bad');
      return '<tr><td>' + escapeHtml(String(f.id)) + '</td>' +
        '<td>' + escapeHtml(f.nickname || ('用户' + f.userId)) + '</td>' +
        '<td>' + escapeHtml((f.types || []).join('、')) + '</td>' +
        '<td>' + escapeHtml(f.content || '') + '</td>' +
        '<td>' + escapeHtml(f.contact || '—') + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(f.status) + '</span></td>' +
        '<td>' + escapeHtml(f.createdAt || '') + '</td><td class="actions">' +
        (f.status === 'OPEN' ? '<button class="btn small" data-fb="' + escapeHtml(String(f.id)) + '" data-on="PROCESSING">受理</button> ' : '') +
        (f.status !== 'CLOSED' ? '<button class="btn small" data-fb="' + escapeHtml(String(f.id)) + '" data-on="CLOSED">关闭</button>' : '') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">没有工单</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>反馈工单</h2>' + head +
      '<table><thead><tr><th>ID</th><th>用户</th><th>类型</th><th>内容</th><th>联系方式</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function handleFeedback(id, status) {
    var reply = status === 'CLOSED' ? (window.prompt('回复内容（可选）') || '') : '';
    request('/api/admin/feedback/' + encodeURIComponent(id) + '/handle', {
      method: 'POST', body: { status: status, reply: reply }
    }).then(function () { toast('已更新'); loadFeedback(); })
      .catch(function (err) { toast(err.message); });
  }

  // ---------------- 导入源审核 ----------------
  function loadImports() {
    loadingCard();
    request('/api/admin/imports?auditStatus=' + encodeURIComponent(state.importFilter))
      .then(function (list) { state.imports = Array.isArray(list) ? list : []; renderImports(); })
      .catch(errorCard);
  }

  function renderImports() {
    var rows = state.imports;
    var filters = [['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已驳回'], ['', '全部']];
    var head = '<div class="toolbar">' + filters.map(function (f) {
      return '<button class="btn small ' + (state.importFilter === f[0] ? 'primary-sm' : '') +
        '" data-importfilter="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    var body = rows.length ? rows.map(function (im) {
      var pill = im.auditStatus === 'APPROVED' ? 'ok' : (im.auditStatus === 'REJECTED' ? 'bad' : 'pending');
      return '<tr><td>' + escapeHtml(String(im.id)) + '</td>' +
        '<td>' + escapeHtml(im.sourceType || '—') + '</td>' +
        '<td>' + escapeHtml(im.sourceUrl || '—') + '</td>' +
        '<td class="clamp">' + escapeHtml(im.sourceText || '—') + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(im.auditStatus) + '</span></td>' +
        '<td>' + escapeHtml(im.createdAt || '') + '</td><td class="actions">' +
        (im.auditStatus === 'PENDING'
          ? '<button class="btn small" data-import="' + escapeHtml(String(im.id)) + '" data-on="APPROVED">通过</button> ' +
            '<button class="btn small danger" data-import="' + escapeHtml(String(im.id)) + '" data-on="REJECTED">驳回</button>'
          : escapeHtml(im.reviewNote || '—')) +
        '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty">没有导入记录</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>导入源审核</h2>' + head +
      '<table><thead><tr><th>ID</th><th>类型</th><th>来源链接</th><th>内容摘要</th><th>状态</th><th>时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function reviewImport(id, status) {
    var note = status === 'REJECTED' ? (window.prompt('驳回原因（可选）') || '') : '';
    request('/api/admin/imports/' + encodeURIComponent(id) + '/status', {
      method: 'POST', body: { status: status, note: note }
    }).then(function () { toast(status === 'APPROVED' ? '已通过' : '已驳回'); loadImports(); })
      .catch(function (err) { toast(err.message); });
  }

  // ---------------- 用户 ----------------
  function loadUsers() {
    loadingCard();
    request('/api/admin/users?keyword=' + encodeURIComponent(state.userKeyword || '') +
      '&page=' + state.users.page + '&size=' + state.users.size)
      .then(function (page) { state.users = page || { items: [], total: 0, page: 0, size: 20 }; renderUsers(); })
      .catch(errorCard);
  }

  function renderUsers() {
    var p = state.users;
    var rows = p.items || [];
    var body = rows.length ? rows.map(function (u) {
      var banned = u.status === 'BANNED';
      return '<tr><td>' + escapeHtml(String(u.userId)) + '</td><td>' + escapeHtml(u.nickname || '') + '</td>' +
        '<td>' + escapeHtml(u.phone || '—') + '</td><td>' + escapeHtml(u.openid || '—') + '</td>' +
        '<td>' + (u.admin ? '<span class="pill ok">管理员</span>' : '<span class="pill">普通</span>') + '</td>' +
        '<td>' + (banned ? '<span class="pill bad">已封禁</span>' : '<span class="pill ok">正常</span>') + '</td>' +
        '<td>' + escapeHtml(u.createdAt || '') + '</td><td class="actions">' +
        (u.admin
          ? '<button class="btn small danger" data-admin="' + escapeHtml(String(u.userId)) + '" data-on="0">撤销管理员</button>'
          : '<button class="btn small" data-admin="' + escapeHtml(String(u.userId)) + '" data-on="1">设为管理员</button>') +
        ' <button class="btn small" data-vip="' + escapeHtml(String(u.userId)) + '">开通会员</button>' +
        (u.admin ? '' : (banned
          ? ' <button class="btn small" data-userstatus="' + escapeHtml(String(u.userId)) + '" data-on="ACTIVE">解封</button>'
          : ' <button class="btn small danger" data-userstatus="' + escapeHtml(String(u.userId)) + '" data-on="BANNED">封禁</button>')) +
        '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">没有匹配的用户</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card">' +
      '<div class="toolbar"><input id="userSearch" type="search" placeholder="搜昵称 / 手机号 / openid" value="' +
      escapeHtml(state.userKeyword) + '" /><button class="btn" id="userSearchBtn">搜索</button>' +
      '<span class="muted" style="align-self:center">共 ' + escapeHtml(String(p.total)) + ' 条</span></div>' +
      '<table><thead><tr><th>ID</th><th>昵称</th><th>手机号</th><th>openid</th><th>角色</th><th>状态</th><th>注册时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table>' +
      '<div class="toolbar" style="margin-top:14px">' +
      '<button class="btn small" id="prevPage"' + (p.page <= 0 ? ' disabled' : '') + '>上一页</button>' +
      '<button class="btn small" id="nextPage"' + ((p.page + 1) * p.size >= p.total ? ' disabled' : '') + '>下一页</button>' +
      '</div></div>';
  }

  function setUserStatus(userId, status) {
    var banned = status === 'BANNED';
    if (banned && !window.confirm('确认封禁该用户？其所有会话将立即失效。')) return;
    request('/api/admin/users/' + encodeURIComponent(userId) + '/status', {
      method: 'POST', body: { status: status }
    }).then(function () { toast(banned ? '已封禁' : '已解封'); loadUsers(); })
      .catch(function (err) { toast(err.message); });
  }

  function setAdmin(userId, on) {
    request('/api/admin/users/' + encodeURIComponent(userId) + '/admin', {
      method: 'POST', body: { admin: !!on }
    }).then(function () { toast(on ? '已设为管理员' : '已撤销管理员'); loadUsers(); })
      .catch(function (err) { toast(err.message); });
  }

  function grantVip(userId) {
    var plan = window.prompt('套餐代码（annual / monthly）', 'annual');
    if (!plan) return;
    request('/api/admin/users/' + encodeURIComponent(userId) + '/vip', {
      method: 'POST', body: { planCode: plan.trim() }
    }).then(function () { toast('已开通会员'); })
      .catch(function (err) { toast(err.message); });
  }

  // ---------------- 订单 ----------------
  function loadOrders() {
    loadingCard();
    request('/api/admin/orders?status=' + encodeURIComponent(state.orderFilter))
      .then(function (list) { state.orders = Array.isArray(list) ? list : []; renderOrders(); })
      .catch(errorCard);
  }

  function renderOrders() {
    var rows = state.orders;
    var filters = [['', '全部'], ['PENDING', '待支付'], ['PAID', '已支付'], ['CLOSED', '已关闭'], ['REFUNDED', '已退款']];
    var head = '<div class="toolbar">' + filters.map(function (f) {
      return '<button class="btn small ' + (state.orderFilter === f[0] ? 'primary-sm' : '') +
        '" data-orderfilter="' + f[0] + '">' + f[1] + '</button>';
    }).join('') + '</div>';
    var body = rows.length ? rows.map(function (o) {
      var yuan = (o.amountFen / 100).toFixed(2);
      var pill = o.status === 'PAID' ? 'ok' : (o.status === 'PENDING' ? 'pending' : 'bad');
      return '<tr><td>' + escapeHtml(String(o.orderId)) + '</td><td>' + escapeHtml(o.outTradeNo) + '</td>' +
        '<td>' + escapeHtml(String(o.payerUserId)) + '</td><td>' + escapeHtml(o.planName || o.planCode) + '</td>' +
        '<td>¥' + escapeHtml(yuan) + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(o.status) + '</span></td>' +
        '<td>' + escapeHtml(o.paymentMethod || '—') + '</td><td>' + escapeHtml(o.createdAt || '') + '</td>' +
        '<td class="actions">' +
        (o.status === 'PENDING'
          ? '<button class="btn small danger" data-orderclose="' + escapeHtml(o.outTradeNo) + '">关单</button>' : '') +
        (o.status === 'PAID'
          ? '<button class="btn small danger" data-orderrefund="' + escapeHtml(o.outTradeNo) + '">退款</button>' : '') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="9"><div class="empty">没有订单</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>订单</h2>' + head +
      '<table><thead><tr><th>ID</th><th>商户单号</th><th>用户</th><th>套餐</th><th>金额</th><th>状态</th><th>方式</th><th>创建时间</th><th>操作</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  function closeOrder(outTradeNo) {
    if (!window.confirm('确认关闭该未支付订单？')) return;
    request('/api/admin/orders/' + encodeURIComponent(outTradeNo) + '/close', { method: 'POST' })
      .then(function () { toast('已关单'); loadOrders(); })
      .catch(function (err) { toast(err.message); });
  }

  function refundOrder(outTradeNo) {
    if (!window.confirm('确认退款？将回收该订单对应的会员权益（真实资金退款需在商户平台操作）。')) return;
    request('/api/admin/orders/' + encodeURIComponent(outTradeNo) + '/refund', { method: 'POST' })
      .then(function () { toast('已退款'); loadOrders(); })
      .catch(function (err) { toast(err.message); });
  }

  // ---------------- 审计 ----------------
  function loadAudit() {
    loadingCard();
    request('/api/admin/audit?limit=200')
      .then(function (list) { state.audit = Array.isArray(list) ? list : []; renderAudit(); })
      .catch(errorCard);
  }

  function renderAudit() {
    var kw = (state.auditKeyword || '').trim().toLowerCase();
    var all = state.audit;
    var rows = kw ? all.filter(function (a) {
      return [a.actorNickname, a.action, a.targetType, a.targetId, a.detail, a.result]
        .some(function (v) { return String(v == null ? '' : v).toLowerCase().indexOf(kw) >= 0; });
    }) : all;
    var head = '<div class="toolbar"><input id="auditSearch" type="search" placeholder="搜操作人 / 动作 / 对象 / 详情" value="' +
      escapeHtml(state.auditKeyword) + '" /><button class="btn" id="auditSearchBtn">搜索</button>' +
      '<span class="muted" style="align-self:center">显示 ' + escapeHtml(String(rows.length)) + ' / ' +
      escapeHtml(String(all.length)) + ' 条（最近 200 条）</span></div>';
    var body = rows.length ? rows.map(function (a) {
      return '<tr><td>' + escapeHtml(String(a.id)) + '</td>' +
        '<td>' + escapeHtml(a.actorNickname || String(a.actorUserId)) + '</td>' +
        '<td>' + escapeHtml(a.action) + '</td>' +
        '<td>' + escapeHtml(a.targetType + (a.targetId ? '#' + a.targetId : '')) + '</td>' +
        '<td class="clamp">' + escapeHtml(a.detail || '—') + '</td>' +
        '<td><span class="pill ' + (a.result === 'OK' ? 'ok' : 'bad') + '">' + escapeHtml(a.result) + '</span></td>' +
        '<td>' + escapeHtml(a.createdAt || '') + '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty">没有匹配的操作记录</div></td></tr>';
    $('panelRoot').innerHTML = '<div class="card"><h2>审计日志</h2>' + head +
      '<table><thead><tr><th>ID</th><th>操作人</th><th>动作</th><th>对象</th><th>详情</th><th>结果</th><th>时间</th></tr></thead>' +
      '<tbody>' + body + '</tbody></table></div>';
  }

  // ---------------- 事件绑定 ----------------
  // 可点击元素内部常有子节点（如看板卡片的数字/文字），点击时 e.target 是子节点，
  // 直接读它的 data-* 会拿到 null，所以先向上找到真正带属性的宿主元素。
  var CLICKABLE = [
    '[data-tab]', '[data-goto]', '[data-review]', '[data-rptfilter]',
    '[data-admin]', '[data-vip]', '[data-postfilter]', '[data-poststatus]',
    '[data-recipefilter]', '[data-recipestatus]', '[data-cmtfilter]', '[data-cmtstatus]',
    '[data-cmtdel]', '[data-cmtrestore]', '[data-fbfilter]', '[data-fb]',
    '[data-orderfilter]', '[data-orderclose]', '[data-orderrefund]', '[data-userstatus]',
    '[data-importfilter]', '[data-import]'
  ].join(',');

  document.addEventListener('click', function (e) {
    var t = e.target;
    if (!(t instanceof HTMLElement)) return;
    if (t.closest) {
      var host = t.closest(CLICKABLE);
      if (host) t = host;
    }
    var id = t.id;

    if (id === 'sendOtpBtn') { sendOtp(); return; }
    if (id === 'logoutBtn') { logout(); return; }
    if (id === 'userSearchBtn') {
      state.userKeyword = ($('userSearch') || {}).value || '';
      state.users.page = 0; loadUsers(); return;
    }
    if (id === 'prevPage') { state.users.page = Math.max(0, state.users.page - 1); loadUsers(); return; }
    if (id === 'nextPage') { state.users.page += 1; loadUsers(); return; }

    var tab = t.getAttribute('data-tab');
    if (tab) { state.tab = tab; renderTabs(); loadTab(); return; }

    var review = t.getAttribute('data-review');
    if (review) { reviewReport(review, t.getAttribute('data-status')); return; }

    var rptf = t.getAttribute('data-rptfilter');
    if (rptf !== null) { state.reportFilter = rptf; loadReports(); return; }

    var goto = t.getAttribute('data-goto');
    if (goto) { gotoStat(goto, t.getAttribute('data-gotofilter')); return; }

    var adminId = t.getAttribute('data-admin');
    if (adminId) { setAdmin(adminId, t.getAttribute('data-on') === '1'); return; }

    var vipId = t.getAttribute('data-vip');
    if (vipId) { grantVip(vipId); return; }

    var pf = t.getAttribute('data-postfilter');
    if (pf !== null) { state.postFilter = pf; loadPosts(); return; }

    var ps = t.getAttribute('data-poststatus');
    if (ps) { setPostStatus(ps, t.getAttribute('data-on')); return; }

    if (id === 'recipeSearchBtn') {
      state.recipeKeyword = ($('recipeSearch') || {}).value || '';
      loadRecipes(); return;
    }
    var rf = t.getAttribute('data-recipefilter');
    if (rf !== null) { state.recipeFilter = rf; loadRecipes(); return; }
    var rs = t.getAttribute('data-recipestatus');
    if (rs) { setRecipeStatus(rs, t.getAttribute('data-on')); return; }

    if (id === 'commentFilterBtn') {
      state.commentPostId = ($('commentPostFilter') || {}).value || '';
      loadComments(); return;
    }
    var cd = t.getAttribute('data-cmtdel');
    if (cd) { deleteComment(cd); return; }
    var cr = t.getAttribute('data-cmtrestore');
    if (cr) { restoreComment(cr); return; }
    var ctf = t.getAttribute('data-cmtfilter');
    if (ctf !== null) { state.commentFilter = ctf; loadComments(); return; }
    var cts = t.getAttribute('data-cmtstatus');
    if (cts) { setCommentStatus(cts, t.getAttribute('data-on')); return; }

    if (id === 'auditSearchBtn') {
      state.auditKeyword = ($('auditSearch') || {}).value || '';
      renderAudit(); return;
    }

    var fbf = t.getAttribute('data-fbfilter');
    if (fbf !== null) { state.feedbackFilter = fbf; loadFeedback(); return; }

    var fb = t.getAttribute('data-fb');
    if (fb) { handleFeedback(fb, t.getAttribute('data-on')); return; }

    var of = t.getAttribute('data-orderfilter');
    if (of !== null) { state.orderFilter = of; loadOrders(); return; }

    var us = t.getAttribute('data-userstatus');
    if (us) { setUserStatus(us, t.getAttribute('data-on')); return; }

    var imf = t.getAttribute('data-importfilter');
    if (imf !== null) { state.importFilter = imf; loadImports(); return; }

    var im = t.getAttribute('data-import');
    if (im) { reviewImport(im, t.getAttribute('data-on')); return; }

    var oc = t.getAttribute('data-orderclose');
    if (oc) { closeOrder(oc); return; }

    var orf = t.getAttribute('data-orderrefund');
    if (orf) { refundOrder(orf); return; }
  });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Enter' && e.target && e.target.id === 'userSearch') {
      state.userKeyword = e.target.value || '';
      state.users.page = 0;
      loadUsers();
    }
    if (e.key === 'Enter' && e.target && e.target.id === 'recipeSearch') {
      state.recipeKeyword = e.target.value || '';
      loadRecipes();
    }
    if (e.key === 'Enter' && e.target && e.target.id === 'commentPostFilter') {
      state.commentPostId = e.target.value || '';
      loadComments();
    }
    if (e.key === 'Enter' && e.target && e.target.id === 'auditSearch') {
      state.auditKeyword = e.target.value || '';
      renderAudit();
    }
  });

  $('loginForm').addEventListener('submit', login);

  // 恢复会话（刷新页面时）
  try {
    var saved = sessionStorage.getItem(TOKEN_KEY);
    if (saved) {
      state.token = saved;
      request('/api/auth/me').then(function (me) {
        if (me && me.admin) { state.nickname = me.nickname || '管理员'; showApp(); }
        else { logout(true); }
      }).catch(function () { logout(true); });
    }
  } catch (e) {}
})();
