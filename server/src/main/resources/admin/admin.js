/**
 * 运营后台 · 原生 JS，无打包（项目零构建工具链，刻意不引入 npm）。
 * 数据全部来自 /api/admin/**，token 仅存内存 + sessionStorage（关闭标签页即失效）。
 * 图表为手写 SVG，不依赖任何图表库。
 */
(function () {
  'use strict';

  var TOKEN_KEY = 'admin_token';
  var state = {
    token: '',
    nickname: '',
    /** 当前管理员的角色与权限点（由 /api/admin/me 下发；后端仍逐接口校验） */
    role: null,
    roleName: '管理员',
    permissions: [],
    tab: 'dashboard',
    dashboard: null,
    metrics: null,
    recentAudit: [],
    reports: [],
    reportFilter: 'PENDING',
    users: { items: [], total: 0, page: 0, size: 20 },
    userKeyword: '',
    userSort: 'id',
    userOrder: 'desc',
    feedback: [],
    feedbackFilter: 'OPEN',
    feedbackPage: 0,
    feedbackTotal: 0,
    feedbackSize: 50,
    posts: [],
    postFilter: '',
    recipes: [],
    recipeFilter: 'ACTIVE',
    recipeKeyword: '',
    comments: [],
    commentPostId: '',
    commentFilter: 'PENDING',
    commentPage: 0,
    commentTotal: 0,
    commentSize: 50,
    orders: [],
    orderFilter: '',
    orderPage: 0,
    orderTotal: 0,
    orderSize: 50,
    orderFrom: '',
    orderTo: '',
    orderSort: 'id',
    orderOrder: 'desc',
    audit: [],
    auditKeyword: '',
    auditPage: 0,
    auditTotal: 0,
    auditSize: 50,
    auditFrom: '',
    auditTo: '',
    auditSort: 'id',
    auditOrder: 'desc',
    /** 批量勾选：{ comments: {id:true}, posts: {...}, reports: {...} } */
    picked: { comments: {}, posts: {}, reports: {} },
    imports: [],
    importFilter: 'PENDING'
  };

  var $ = function (id) { return document.getElementById(id); };

  // ==================== 基础工具 ====================

  function toast(text, ms, kind) {
    var el = $('toast');
    if (!el) return;
    el.textContent = text;
    el.className = 'toast' + (kind ? ' ' + kind : '');
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

  /** "2026-09-10T00:02:55" / "2026-09-10 00:02:55" → "09-10 00:02" */
  function fmtTime(value) {
    if (!value) return '—';
    var s = String(value).replace('T', ' ');
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})[ ](\d{2}):(\d{2})/);
    if (!m) return escapeHtml(s);
    return m[2] + '-' + m[3] + ' ' + m[4] + ':' + m[5];
  }

  function fmtDate(value) {
    if (!value) return '—';
    var m = String(value).match(/^(\d{4})-(\d{2})-(\d{2})/);
    return m ? m[2] + '-' + m[3] : escapeHtml(String(value));
  }

  function fmtMoney(fen) {
    var n = Number(fen || 0) / 100;
    return '¥' + n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function fmtNum(n) {
    return String(Number(n || 0)).replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  }

  function avatarClass(seed) {
    var s = String(seed == null ? '' : seed);
    var sum = 0;
    for (var i = 0; i < s.length; i++) sum += s.charCodeAt(i);
    return 'c' + (sum % 5 + 1);
  }

  function avatarHtml(name, url) {
    var label = String(name || '?').trim().slice(0, 1) || '?';
    if (url) {
      return '<span class="avatar ' + avatarClass(name) + '"><img src="' + escapeHtml(url) + '" alt="" /></span>';
    }
    return '<span class="avatar ' + avatarClass(name) + '">' + escapeHtml(label) + '</span>';
  }

  var ICONS = {
    grid: '<rect x="3" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1.6"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1.6"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1.6"/>',
    file: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/>',
    comment: '<path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4.5 3v-5.6A7.5 7.5 0 0 1 13 4a7.5 7.5 0 0 1 7.5 7.5z"/>',
    flag: '<path d="M6 21V4h12l-2.2 4.5L18 13H6"/>',
    download: '<path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 20.5h15"/>',
    users: '<path d="M15.5 20v-1.6a4 4 0 0 0-4-4H6.5a4 4 0 0 0-4 4V20"/><circle cx="9" cy="7.5" r="3.6"/><path d="M17.5 4.2a3.6 3.6 0 0 1 0 7"/><path d="M21.5 20v-1.6a4 4 0 0 0-3-3.8"/>',
    card: '<rect x="2.5" y="5" width="19" height="14" rx="2.6"/><path d="M2.5 9.8h19"/><path d="M6.5 14.5h4"/>',
    inbox: '<path d="M4 5.5h16v13H9l-5 3.5v-3.5H4z"/>',
    book: '<path d="M4 5.6A2.6 2.6 0 0 1 6.6 3H19v15H6.6A2.6 2.6 0 0 0 4 20.6z"/><path d="M19 18v3H6.6A2.6 2.6 0 0 1 4 18.4"/>',
    shield: '<path d="M12 3l7 3v5.6c0 4.2-2.9 7.9-7 9.4-4.1-1.5-7-5.2-7-9.4V6l7-3z"/><path d="M9.2 12.1l2 2 3.6-3.8"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || ICONS.grid) + '</svg>';
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

  // ==================== 手写图表 ====================

  function niceCeil(v) {
    if (v <= 5) return 5;
    var mag = Math.pow(10, Math.floor(Math.log(v) / Math.LN10));
    var norm = v / mag;
    var step = norm <= 1 ? 1 : norm <= 2 ? 2 : norm <= 5 ? 5 : 10;
    return step * mag;
  }

  function sparkline(values, color, w, h) {
    w = w || 96; h = h || 30;
    var max = Math.max.apply(null, values.concat([1]));
    var n = values.length;
    var pts = values.map(function (v, i) {
      var x = n <= 1 ? w / 2 : w * i / (n - 1);
      var y = h - 3 - (h - 6) * (v / max);
      return x.toFixed(1) + ',' + y.toFixed(1);
    });
    return '<svg class="spark" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '" aria-hidden="true">' +
      '<polyline points="' + pts.join(' ') + '" fill="none" stroke="' + color + '" stroke-width="1.8" ' +
      'stroke-linejoin="round" stroke-linecap="round"/></svg>';
  }

  /** 折线图：cfg = { labels, series:[{name,color,values}], height } */
  function lineChart(cfg) {
    var labels = cfg.labels || [];
    var series = cfg.series || [];
    var W = 760, H = cfg.height || 250;
    var padL = 46, padR = 14, padT = 14, padB = 26;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var max = 1;
    series.forEach(function (s) {
      s.values.forEach(function (v) { if (v > max) max = v; });
    });
    var top = niceCeil(max);
    var n = labels.length;
    var x = function (i) { return n <= 1 ? padL + innerW / 2 : padL + innerW * i / (n - 1); };
    var y = function (v) { return padT + innerH - innerH * (v / top); };
    var out = [];

    for (var g = 0; g <= 4; g++) {
      var gy = padT + innerH * g / 4;
      out.push('<line class="grid" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/>');
      out.push('<text class="axis" x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' +
        Math.round(top * (4 - g) / 4) + '</text>');
    }
    var step = Math.max(1, Math.ceil(n / 7));
    labels.forEach(function (lb, i) {
      if (i % step === 0 || i === n - 1) {
        out.push('<text class="axis" x="' + x(i) + '" y="' + (H - 7) + '" text-anchor="middle">' +
          escapeHtml(fmtDate(lb)) + '</text>');
      }
    });
    series.forEach(function (s) {
      var d = s.values.map(function (v, i) { return (i ? 'L' : 'M') + x(i).toFixed(1) + ' ' + y(v).toFixed(1); }).join(' ');
      out.push('<path d="' + d + '" fill="none" stroke="' + s.color + '" stroke-width="2" ' +
        'stroke-linejoin="round" stroke-linecap="round"/>');
      s.values.forEach(function (v, i) {
        if (!v) return;
        out.push('<circle cx="' + x(i).toFixed(1) + '" cy="' + y(v).toFixed(1) + '" r="3" fill="' + s.color + '">' +
          '<title>' + escapeHtml(fmtDate(labels[i]) + ' · ' + s.name + ' ' + v) + '</title></circle>');
      });
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + out.join('') + '</svg>';
  }

  /** 柱状图：cfg = { labels, values, color, format, height } */
  function barChart(cfg) {
    var labels = cfg.labels || [];
    var values = cfg.values || [];
    var W = 520, H = cfg.height || 250;
    var padL = 50, padR = 12, padT = 14, padB = 26;
    var innerW = W - padL - padR, innerH = H - padT - padB;
    var max = Math.max.apply(null, values.concat([1]));
    var top = niceCeil(max);
    var n = values.length || 1;
    var slot = innerW / n;
    var bw = Math.max(4, Math.min(slot * 0.58, 30));
    var out = [];
    var fmt = cfg.format || function (v) { return v; };

    for (var g = 0; g <= 4; g++) {
      var gy = padT + innerH * g / 4;
      out.push('<line class="grid" x1="' + padL + '" y1="' + gy + '" x2="' + (W - padR) + '" y2="' + gy + '"/>');
      out.push('<text class="axis" x="' + (padL - 8) + '" y="' + (gy + 4) + '" text-anchor="end">' +
        fmt(Math.round(top * (4 - g) / 4)) + '</text>');
    }
    var step = Math.max(1, Math.ceil(n / 6));
    values.forEach(function (v, i) {
      var cx = padL + slot * i + slot / 2;
      var h = innerH * (v / top);
      var by = padT + innerH - h;
      out.push('<rect class="bar" x="' + (cx - bw / 2).toFixed(1) + '" y="' + by.toFixed(1) + '" width="' + bw.toFixed(1) +
        '" height="' + Math.max(h, v > 0 ? 2 : 0).toFixed(1) + '" rx="3" fill="' + cfg.color + '">' +
        '<title>' + escapeHtml(fmtDate(labels[i]) + ' · ' + fmt(v)) + '</title></rect>');
      if (i % step === 0 || i === n - 1) {
        out.push('<text class="axis" x="' + cx.toFixed(1) + '" y="' + (H - 7) + '" text-anchor="middle">' +
          escapeHtml(fmtDate(labels[i])) + '</text>');
      }
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img">' + out.join('') + '</svg>';
  }

  // ==================== 登录 ====================

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
    loadingCard();
    request('/api/admin/me').then(function (me) {
      state.role = me.role;
      state.roleName = me.roleName || '管理员';
      state.permissions = me.permissions || [];
      state.nickname = me.nickname || state.nickname;
      $('adminName').textContent = state.nickname;
      var roleEl = $('adminRole');
      if (roleEl) roleEl.textContent = state.roleName;
      // 当前标签没有权限就落到第一个有权限的页面
      if (!canTab(state.tab)) {
        state.tab = firstAllowedTab();
      }
      renderNav();
      loadTab();
    }).catch(function (err) {
      // /me 失败时按最小权限渲染，避免白屏
      state.permissions = ['DASHBOARD_VIEW'];
      state.tab = 'dashboard';
      renderNav();
      loadTab();
      toast(err.message || '权限信息获取失败', 2600, 'error');
    });
  }

  /** 是否拥有某权限点 */
  function can(permission) {
    return state.permissions.indexOf(permission) >= 0;
  }

  function canTab(key) {
    var item = navItem(key);
    return !item || !item.perm || can(item.perm);
  }

  function firstAllowedTab() {
    for (var i = 0; i < NAV.length; i++) {
      for (var j = 0; j < NAV[i].items.length; j++) {
        if (can(NAV[i].items[j].perm)) return NAV[i].items[j].key;
      }
    }
    return 'dashboard';
  }

  // ==================== 导航 ====================

  var NAV = [
    {
      group: '概览',
      items: [{ key: 'dashboard', label: '数据看板', icon: 'grid', perm: 'DASHBOARD_VIEW', desc: '核心指标与趋势' }]
    },
    {
      group: '内容',
      items: [
        { key: 'posts', label: '内容治理', icon: 'file', perm: 'CONTENT_MODERATE', badge: 'pendingPostCount', desc: '帖子审核与下架' },
        { key: 'comments', label: '评论管理', icon: 'comment', perm: 'COMMENT_MODERATE', badge: 'pendingCommentCount', desc: '评论审核与删除' },
        { key: 'reports', label: '举报审核', icon: 'flag', perm: 'REPORT_REVIEW', badge: 'pendingReportCount', desc: '用户举报处置' },
        { key: 'imports', label: '导入审核', icon: 'download', perm: 'IMPORT_REVIEW', badge: 'pendingImportCount', desc: '外部菜谱导入队列' }
      ]
    },
    {
      group: '用户',
      items: [{ key: 'users', label: '用户管理', icon: 'users', perm: 'USER_VIEW', desc: '检索、权限、封禁、会员' }]
    },
    {
      group: '运营',
      items: [
        { key: 'orders', label: '订单管理', icon: 'card', perm: 'ORDER_VIEW', desc: '支付订单与退款' },
        { key: 'feedback', label: '反馈工单', icon: 'inbox', perm: 'FEEDBACK_HANDLE', badge: 'openFeedbackCount', desc: '用户反馈处理' }
      ]
    },
    {
      group: '系统',
      items: [
        { key: 'recipes', label: '菜谱治理', icon: 'book', perm: 'RECIPE_MODERATE', desc: '菜谱下架与恢复' },
        { key: 'audit', label: '审计日志', icon: 'shield', perm: 'AUDIT_VIEW', desc: '全部管理操作留痕' }
      ]
    }
  ];

  function navItem(key) {
    for (var i = 0; i < NAV.length; i++) {
      for (var j = 0; j < NAV[i].items.length; j++) {
        if (NAV[i].items[j].key === key) return NAV[i].items[j];
      }
    }
    return NAV[0].items[0];
  }

  function renderNav() {
    var d = state.dashboard || {};
    $('navList').innerHTML = NAV.map(function (group) {
      var visible = group.items.filter(function (item) { return can(item.perm); });
      if (!visible.length) return '';
      return '<div class="nav-group"><div class="nav-group-label">' + escapeHtml(group.group) + '</div>' +
        visible.map(function (item) {
          var count = item.badge ? Number(d[item.badge] || 0) : 0;
          var badge = item.badge
            ? '<span class="nav-badge' + (count > 0 ? '' : ' zero') + '">' + (count > 99 ? '99+' : count) + '</span>'
            : '';
          return '<div class="nav-item' + (state.tab === item.key ? ' on' : '') + '" data-tab="' + item.key +
            '" role="button" tabindex="0" title="' + escapeHtml(item.desc || item.label) + '">' +
            icon(item.icon) + '<span class="nav-label">' + escapeHtml(item.label) + '</span>' + badge + '</div>';
        }).join('') + '</div>';
    }).join('');
  }

  function setPageHeader(meta) {
    var item = navItem(state.tab);
    $('pageTitle').textContent = item.label;
    $('pageMeta').textContent = meta || '';
  }

  function loadTab() {
    var item = navItem(state.tab);
    $('pageTitle').textContent = item.label;
    $('pageMeta').textContent = '';
    var loaders = {
      dashboard: loadDashboard, reports: loadReports, posts: loadPosts,
      comments: loadComments, recipes: loadRecipes, feedback: loadFeedback,
      imports: loadImports, users: loadUsers, orders: loadOrders, audit: loadAudit
    };
    return (loaders[state.tab] || loadDashboard)();
  }

  /** 刷新按钮：给出进行中反馈，而不是点了没反应 */
  function refreshCurrent() {
    var btn = $('refreshBtn');
    var label = btn.textContent;
    btn.disabled = true;
    btn.textContent = '刷新中…';
    var done = function () { btn.disabled = false; btn.textContent = label; };
    Promise.resolve(loadTab()).then(done, done);
  }

  function goTab(key, filter) {
    state.tab = key;
    if (key === 'posts') state.postFilter = filter || '';
    if (key === 'comments') state.commentFilter = filter || '';
    if (key === 'reports') state.reportFilter = filter || '';
    if (key === 'feedback') state.feedbackFilter = filter || '';
    if (key === 'imports') state.importFilter = filter || '';
    if (key === 'orders') state.orderFilter = filter || '';
    closeNav();
    renderNav();
    loadTab();
  }

  function closeNav() { $('appView').classList.remove('nav-open'); }

  function loadingCard() {
    $('panelRoot').innerHTML = '<div class="card"><div class="loading"><span class="spinner"></span>加载中…</div></div>';
  }

  function errorCard(err) {
    $('panelRoot').innerHTML = '<div class="card"><p class="msg error">' + escapeHtml(err.message) + '</p></div>';
  }

  function pageHead(title, desc, actionsHtml) {
    return '<div class="page-head"><div><h2>' + escapeHtml(title) + '</h2>' +
      (desc ? '<p class="page-desc">' + escapeHtml(desc) + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="page-actions">' + actionsHtml + '</div>' : '') + '</div>';
  }

  function chips(options, current, attr) {
    return options.map(function (o) {
      return '<button class="filter-chip' + (current === o[0] ? ' on' : '') + '" data-' + attr + '="' + o[0] + '">' +
        escapeHtml(o[1]) + '</button>';
    }).join('');
  }

  /** 服务端分页控件；kind 用于回调时区分是哪个列表 */
  function pagerHtml(kind, page, size, total) {
    var from = total ? page * size + 1 : 0;
    var to = Math.min((page + 1) * size, total);
    return '<div class="pager">' +
      '<span>第 ' + (page + 1) + ' 页 · 显示 ' + from + '–' + to + ' / ' + fmtNum(total) + ' 条</span>' +
      '<button class="btn small" data-pager="' + kind + ':prev"' + (page <= 0 ? ' disabled' : '') + '>上一页</button>' +
      '<button class="btn small" data-pager="' + kind + ':next"' + (to >= total ? ' disabled' : '') + '>下一页</button>' +
      '</div>';
  }

  /** 分页跳转：spec = "orders:next" / "audit:prev" … */
  function changePage(spec) {
    var parts = String(spec).split(':');
    var kind = parts[0];
    var delta = parts[1] === 'next' ? 1 : -1;
    var jump = function (cur) { return Math.max(0, cur + delta); };
    if (kind === 'orders') { state.orderPage = jump(state.orderPage); loadOrders(); }
    else if (kind === 'comments') { state.commentPage = jump(state.commentPage); loadComments(); }
    else if (kind === 'feedback') { state.feedbackPage = jump(state.feedbackPage); loadFeedback(); }
    else if (kind === 'audit') { state.auditPage = jump(state.auditPage); loadAudit(); }
    else if (kind === 'users') { state.users.page = jump(state.users.page); loadUsers(); }
  }

  /** 可排序表头：kind 决定读写哪一组排序状态 */
  function thSort(label, key, kind, cls) {
    var cur = state[kind + 'Sort'];
    var dir = state[kind + 'Order'];
    var active = cur === key;
    var arrow = active ? (dir === 'asc' ? '↑' : '↓') : '↕';
    return '<th class="' + (cls || '') + ' sortable' + (active ? ' sorted' : '') +
      '" data-sort="' + kind + ':' + key + '" title="点击按此列排序">' +
      escapeHtml(label) + '<span class="sort-ind">' + arrow + '</span></th>';
  }

  /** 日期区间控件（下单/操作时间） */
  function dateRangeHtml(kind, from, to) {
    return '<span class="date-range">' +
      '<input type="date" id="' + kind + 'From" value="' + escapeHtml(from || '') + '" aria-label="开始日期" />' +
      '<span class="dash">至</span>' +
      '<input type="date" id="' + kind + 'To" value="' + escapeHtml(to || '') + '" aria-label="结束日期" />' +
      '<button class="btn small" id="' + kind + 'DateBtn">应用</button>' +
      ((from || to) ? '<button class="btn small" id="' + kind + 'DateClear">清除</button>' : '') +
      '</span>';
  }

  // ---- 批量勾选 ----
  function pickedIds(kind) {
    return Object.keys(state.picked[kind] || {}).filter(function (k) { return state.picked[kind][k]; });
  }

  function setPick(spec, on) {
    var parts = String(spec).split(':');
    var kind = parts[0], id = parts.slice(1).join(':');
    state.picked[kind] = state.picked[kind] || {};
    if (on) state.picked[kind][id] = true;
    else delete state.picked[kind][id];
    updateBulkBar(kind);
  }

  function setPickAll(kind, on) {
    var rows = kind === 'comments' ? state.comments
      : kind === 'posts' ? state.posts
        : kind === 'reports' ? state.reports : [];
    state.picked[kind] = {};
    if (on) {
      rows.forEach(function (r) {
        var id = kind === 'comments' ? r.commentId : kind === 'posts' ? r.id : r.reportId;
        state.picked[kind][String(id)] = true;
      });
    }
    renderCurrentList();
  }

  function renderCurrentList() {
    if (state.tab === 'comments') renderComments();
    else if (state.tab === 'posts') renderPosts();
    else if (state.tab === 'reports') renderReports();
  }

  function updateBulkBar(kind) {
    var bar = document.querySelector('[data-bulkbar="' + kind + '"]');
    if (!bar) return;
    var ids = pickedIds(kind);
    bar.innerHTML = bulkBarHtml(kind, ids.length);
    bar.hidden = ids.length === 0;
  }

  function bulkBarHtml(kind, count) {
    if (!count) return '';
    var actions = kind === 'comments'
      ? '<button class="btn small primary-sm" data-bulk="comments:APPROVED">批量通过</button>' +
        '<button class="btn small danger" data-bulk="comments:REMOVED">批量驳回</button>'
      : kind === 'posts'
        ? '<button class="btn small primary-sm" data-bulk="posts:APPROVED">批量恢复/通过</button>' +
          '<button class="btn small danger" data-bulk="posts:REMOVED">批量下架</button>'
        : '<button class="btn small danger" data-bulk="reports:REMOVED">批量下架帖子</button>' +
          '<button class="btn small" data-bulk="reports:IGNORED">批量忽略</button>';
    return '<span class="bulk-count">已选 ' + count + ' 条</span>' + actions +
      '<button class="btn small" data-bulk="' + kind + ':clear">取消选择</button>';
  }

  /** 把某个列表的全部页拉下来（导出用；cap 防止把浏览器拖死） */
  // ==================== 看板 ====================

  function loadDashboard() {
    loadingCard();
    // 趋势与最近操作是"锦上添花"：任何一个挂了都不该让整个看板白屏
    return Promise.all([
      request('/api/admin/dashboard'),
      request('/api/admin/metrics?days=14').catch(function () { return null; }),
      request('/api/admin/audit?page=0&size=8').catch(function () { return null; })
    ]).then(function (res) {
      state.dashboard = res[0];
      state.metrics = res[1] || { days: 14, series: [], hotPosts: [], recentUsers: [] };
      state.recentAudit = (res[2] && res[2].items) || [];
      renderNav();
      renderDashboard();
    }).catch(errorCard);
  }

  function renderDashboard() {
    var d = state.dashboard || {};
    var m = state.metrics || {};
    var series = m.series || [];
    var labels = series.map(function (p) { return p.date; });

    function sum(arr, key) {
      return arr.reduce(function (a, p) { return a + Number(p[key] || 0); }, 0);
    }
    var last7 = series.slice(-7);
    var prev7 = series.slice(-14, -7);

    function delta(key, money) {
      var cur = sum(last7, key);
      var prev = sum(prev7, key);
      var diff = cur - prev;
      var cls = diff < 0 ? ' down' : '';
      var val = money
        ? (diff < 0 ? '-' : '+') + fmtMoney(Math.abs(diff)).slice(1)
        : (diff > 0 ? '+' : '') + diff;
      return '<div class="kpi-delta' + cls + '">近 7 天 <b>' + val + '</b> · 上期 ' +
        (money ? fmtMoney(prev) : prev) + '</div>';
    }

    function kpi(label, value, sparkKey, deltaKey, money) {
      var spark = sparkKey ? sparkline(series.map(function (p) { return Number(p[sparkKey] || 0); }), '#2f4a3a') : '';
      return '<div class="kpi"><div class="kpi-top"><span class="kpi-label">' + escapeHtml(label) + '</span></div>' +
        '<div class="kpi-num">' + escapeHtml(value) + '</div>' +
        '<div class="kpi-foot">' + (deltaKey ? delta(deltaKey, money) : '<span></span>') + spark + '</div></div>';
    }

    var kpis = '<div class="kpi-grid">' +
      kpi('用户总数', fmtNum(d.userCount), 'newUsers', 'newUsers') +
      kpi('已发布帖子', fmtNum(d.postCount), 'newPosts', 'newPosts') +
      kpi('已支付订单', fmtNum(d.paidOrderCount), 'paidOrders', 'paidOrders') +
      kpi('累计收入', fmtMoney(d.paidRevenueFen), 'revenueFen', 'revenueFen', true) +
      '</div>';

    function todo(label, value, tab, filter) {
      var n = Number(value || 0);
      return '<div class="todo' + (n > 0 ? ' hot' : ' zero') + '" data-goto="' + tab + '" data-gotofilter="' +
        (filter || '') + '" role="button" tabindex="0">' +
        '<div class="todo-num">' + fmtNum(n) + '</div>' +
        '<div class="todo-label">' + escapeHtml(label) + ' ›</div></div>';
    }

    var todos = '<div class="todo-grid">' +
      todo('待审帖子', d.pendingPostCount, 'posts', 'PENDING') +
      todo('待审评论', d.pendingCommentCount, 'comments', 'PENDING') +
      todo('待处理举报', d.pendingReportCount, 'reports', 'PENDING') +
      todo('待处理反馈', d.openFeedbackCount, 'feedback', 'OPEN') +
      todo('待审导入', d.pendingImportCount, 'imports', 'PENDING') +
      '</div>';

    var trendCard = '<div class="card"><h2>内容趋势</h2>' +
      '<p class="card-sub">近 ' + escapeHtml(String(m.days || 14)) + ' 天每日新增</p>' +
      (series.length ? '<div class="chart-wrap">' + lineChart({
        labels: labels,
        series: [
          { name: '新增用户', color: '#2f4a3a', values: series.map(function (p) { return Number(p.newUsers || 0); }) },
          { name: '新增帖子', color: '#c2402a', values: series.map(function (p) { return Number(p.newPosts || 0); }) },
          { name: '新增评论', color: '#a8792c', values: series.map(function (p) { return Number(p.newComments || 0); }) }
        ]
      }) + '</div>' : '<div class="empty">趋势数据暂时不可用</div>') +
      '<div class="chart-legend">' +
      '<span><i class="legend-dot" style="background:#2f4a3a"></i>新增用户</span>' +
      '<span><i class="legend-dot" style="background:#c2402a"></i>新增帖子</span>' +
      '<span><i class="legend-dot" style="background:#a8792c"></i>新增评论</span>' +
      '</div></div>';

    var revenueCard = '<div class="card"><h2>收入趋势</h2>' +
      '<p class="card-sub">近 ' + escapeHtml(String(m.days || 14)) + ' 天已支付金额</p>' +
      (series.length ? '<div class="chart-wrap">' + barChart({
        labels: labels,
        values: series.map(function (p) { return Number(p.revenueFen || 0) / 100; }),
        color: '#c2402a',
        format: function (v) {
          if (v >= 10000) return Math.round(v / 1000) + 'k';
          if (v >= 1000) return (v / 1000).toFixed(1).replace(/\.0$/, '') + 'k';
          return v;
        }
      }) + '</div>' : '<div class="empty">收入数据暂时不可用</div>') + '</div>';

    var hot = (m.hotPosts || []);
    var hotCard = '<div class="card"><h2>热门内容</h2><p class="card-sub">按点赞与评论排序的已发布帖子</p>' +
      '<div class="row-list">' + (hot.length ? hot.map(function (p, i) {
        return '<div class="row-item">' +
          '<span class="rank' + (i < 3 ? ' top' : '') + '">' + (i + 1) + '</span>' +
          '<div class="grow"><div class="title">' + escapeHtml(p.title || '') + '</div>' +
          '<div class="sub">' + escapeHtml(p.author || '匿名') + ' · ' + fmtTime(p.createdAt) + '</div></div>' +
          '<div class="side">赞 ' + fmtNum(p.likeCount) + '<br>评 ' + fmtNum(p.commentCount) + '</div></div>';
      }).join('') : '<div class="empty">暂无内容</div>') + '</div></div>';

    var recent = (m.recentUsers || []);
    var recentCard = '<div class="card"><h2>最近注册</h2><p class="card-sub">最新注册的 6 个账号</p>' +
      '<div class="row-list">' + (recent.length ? recent.map(function (u) {
        return '<div class="row-item">' + avatarHtml(u.nickname, u.avatarUrl) +
          '<div class="grow"><div class="title">' + escapeHtml(u.nickname || ('用户' + u.userId)) + '</div>' +
          '<div class="sub">' + escapeHtml(u.phone || u.openid || '—') + '</div></div>' +
          '<div class="side">' + fmtTime(u.createdAt) + '</div></div>';
      }).join('') : '<div class="empty">暂无用户</div>') + '</div></div>';

    var acts = state.recentAudit || [];
    var auditCard = '<div class="card"><h2>最近管理操作</h2><p class="card-sub">谁在什么时候改了什么</p>' +
      '<div class="row-list">' + (acts.length ? acts.map(function (a) {
        return '<div class="row-item">' +
          '<span class="pill ' + (a.result === 'OK' ? 'ok' : 'bad') + '">' + escapeHtml(a.action) + '</span>' +
          '<div class="grow"><div class="title">' + escapeHtml(a.detail || (a.targetType + (a.targetId ? '#' + a.targetId : ''))) + '</div>' +
          '<div class="sub">' + escapeHtml(a.actorNickname || ('用户' + a.actorUserId)) + '</div></div>' +
          '<div class="side">' + fmtTime(a.createdAt) + '</div></div>';
      }).join('') : '<div class="empty">暂无操作记录</div>') + '</div></div>';

    setPageHeader('数据更新于 ' + fmtTime(d.generatedAt));
    $('panelRoot').innerHTML = kpis + todos +
      '<div class="split-2" style="margin-bottom:16px">' + trendCard + revenueCard + '</div>' +
      '<div class="split-2">' + hotCard + recentCard + '</div>' +
      '<div style="margin-top:16px">' + auditCard + '</div>';
  }

  // ==================== 举报审核 ====================

  function loadReports() {
    loadingCard();
    return request('/api/community/reports?status=' + encodeURIComponent(state.reportFilter || ''))
      .then(function (list) { state.reports = Array.isArray(list) ? list : []; renderReports(); })
      .catch(errorCard);
  }

  function renderReports() {
    var rows = state.reports;
    var head = pageHead('举报审核', '用户举报的帖子在这里处置：下架或忽略',
      chips([['PENDING', '待处理'], ['REMOVED', '已下架'], ['IGNORED', '已忽略'], ['', '全部']], state.reportFilter, 'rptfilter') +
      '<button class="btn small" id="exportReports">导出 CSV</button>');
    var body = rows.length ? rows.map(function (r) {
      var pending = r.status === 'PENDING';
      var pill = pending ? '<span class="pill pending">待处理</span>'
        : (r.status === 'REMOVED' ? '<span class="pill bad">已下架</span>' : '<span class="pill">已忽略</span>');
      return '<tr><td class="pick"><input type="checkbox" data-pick="reports:' + escapeHtml(String(r.reportId)) +
          '"' + (state.picked.reports[r.reportId] ? ' checked' : '') + ' /></td>' +
        '<td class="num">' + escapeHtml(String(r.reportId)) + '</td>' +
        '<td>#' + escapeHtml(String(r.postId)) + ' ' + escapeHtml(r.postTitle || '') + '</td>' +
        '<td>' + escapeHtml(r.reason || '') + '</td>' +
        '<td class="clamp" title="' + escapeHtml(r.description || '') + '">' + escapeHtml(r.description || '—') + '</td>' +
        '<td>' + escapeHtml(r.reporter || '—') + '</td>' +
        '<td>' + pill + '</td><td title="' + escapeHtml(r.createdAt || '') + '">' + fmtTime(r.createdAt) + '</td><td class="actions">' +
        (pending
          ? '<button class="btn small danger" data-review="' + escapeHtml(String(r.reportId)) + '" data-status="REMOVED">下架帖子</button>' +
            '<button class="btn small" data-review="' + escapeHtml(String(r.reportId)) + '" data-status="IGNORED">忽略</button>'
          : escapeHtml(r.reviewNote || '—')) +
        '</td></tr>';
    }).join('') : '<tr><td colspan="9"><div class="empty">没有举报记录</div></td></tr>';
    var pickedCount = pickedIds('reports').length;
    setPageHeader(rows.length + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<div class="bulk-bar" data-bulkbar="reports"' + (pickedCount ? '' : ' hidden') + '>' +
      bulkBarHtml('reports', pickedCount) + '</div>' +
      '<table><thead><tr><th class="pick"><input type="checkbox" data-checkall="reports" aria-label="全选本页" /></th>' +
      '<th class="num">ID</th><th>帖子</th><th>原因</th><th>说明</th><th>举报人</th>' +
      '<th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function reviewReport(reportId, status) {
    var r = findReport(reportId);
    var removing = status === 'REMOVED';
    confirmDialog({
      title: removing ? '下架该帖子？' : '忽略这条举报？',
      desc: removing
        ? '帖子 #' + (r.postId || '') + '「' + (r.postTitle || '') + '」将立即从公开列表消失。举报原因：' + (r.reason || '—')
        : '举报 #' + reportId + ' 会被标记为已忽略，帖子保持可见。',
      danger: removing,
      confirmText: removing ? '确认下架' : '确认忽略'
    }).then(function (ok) {
      if (!ok) return;
      return request('/api/community/reports/' + encodeURIComponent(reportId) + '/review', {
        method: 'POST', body: { status: status, note: '' }
      }).then(function () {
        toast(removing ? '已下架' : '已忽略');
        loadReports();
      }).catch(function (err) { toast(err.message, 2600, 'error'); });
    });
  }

  // ==================== 内容治理 ====================

  function loadPosts() {
    loadingCard();
    return request('/api/admin/posts?auditStatus=' + encodeURIComponent(state.postFilter))
      .then(function (list) { state.posts = Array.isArray(list) ? list : []; renderPosts(); })
      .catch(errorCard);
  }

  function renderPosts() {
    var rows = state.posts;
    var head = pageHead('内容治理', '先审后发：待审核的帖子只有作者本人可见',
      chips([['PENDING', '待审核'], ['', '全部'], ['APPROVED', '已发布'], ['REMOVED', '已下架']], state.postFilter, 'postfilter') +
      '<button class="btn small" id="exportPosts">导出 CSV</button>');
    var body = rows.length ? rows.map(function (p) {
      var removed = p.auditStatus === 'REMOVED';
      var pending = p.auditStatus === 'PENDING';
      var pill = removed ? '<span class="pill bad">已下架</span>'
        : (pending ? '<span class="pill pending">待审核</span>' : '<span class="pill ok">已发布</span>');
      var actions = '';
      if (pending) {
        actions = '<button class="btn small primary-sm" data-poststatus="' + escapeHtml(String(p.id)) +
            '" data-on="APPROVED">通过</button>' +
          '<button class="btn small danger" data-poststatus="' + escapeHtml(String(p.id)) +
            '" data-on="REMOVED">下架</button>';
      } else if (removed) {
        actions = '<button class="btn small" data-poststatus="' + escapeHtml(String(p.id)) +
          '" data-on="APPROVED">恢复</button>';
      } else {
        actions = '<button class="btn small danger" data-poststatus="' + escapeHtml(String(p.id)) +
          '" data-on="REMOVED">下架</button>';
      }
      return '<tr><td class="pick"><input type="checkbox" data-pick="posts:' + escapeHtml(String(p.id)) +
          '"' + (state.picked.posts[p.id] ? ' checked' : '') + ' /></td>' +
        '<td class="num">' + escapeHtml(String(p.id)) + '</td>' +
        '<td>' + escapeHtml(p.title || '') + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(p.author) + '<span class="name">' + escapeHtml(p.author || '—') + '</span></div></td>' +
        '<td>' + pill + '</td>' +
        '<td class="num">' + fmtNum(p.likeCount) + '</td><td class="num">' + fmtNum(p.commentCount) + '</td>' +
        '<td title="' + escapeHtml(p.createdAt || '') + '">' + fmtTime(p.createdAt) + '</td>' +
        '<td class="actions">' + actions + '</td></tr>';
    }).join('') : '<tr><td colspan="9"><div class="empty">没有内容</div></td></tr>';
    var pickedCount = pickedIds('posts').length;
    setPageHeader(rows.length + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<div class="bulk-bar" data-bulkbar="posts"' + (pickedCount ? '' : ' hidden') + '>' +
      bulkBarHtml('posts', pickedCount) + '</div>' +
      '<table><thead><tr><th class="pick"><input type="checkbox" data-checkall="posts" aria-label="全选本页" /></th>' +
      '<th class="num">ID</th><th>标题</th><th>作者</th><th>状态</th><th class="num">赞</th>' +
      '<th class="num">评论</th><th>时间</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function setPostStatus(postId, status) {
    var p = findPost(postId);
    var run = function () {
      return request('/api/admin/posts/' + encodeURIComponent(postId) + '/status', {
        method: 'POST', body: { status: status }
      }).then(function () {
        toast(status === 'REMOVED' ? '已下架' : (status === 'APPROVED' ? '已通过' : '已更新'));
        loadPosts();
      }).catch(function (err) { toast(err.message, 2600, 'error'); });
    };
    if (status !== 'REMOVED') { run(); return; }
    confirmDialog({
      title: '下架该帖子？',
      desc: '「' + (p.title || ('帖子 #' + postId)) + '」将立即从公开列表消失，作者自己也看不到。',
      danger: true,
      confirmText: '确认下架'
    }).then(function (ok) { if (ok) run(); });
  }

  // ==================== 评论管理 ====================

  function loadComments() {
    loadingCard();
    var q = '/api/admin/comments?page=' + state.commentPage + '&size=' + state.commentSize +
      '&auditStatus=' + encodeURIComponent(state.commentFilter || '') +
      (state.commentPostId ? '&postId=' + encodeURIComponent(state.commentPostId) : '');
    return request(q)
      .then(function (page) {
        state.comments = (page && page.items) || [];
        state.commentTotal = (page && page.total) || 0;
        state.commentPage = (page && page.page) || 0;
        renderComments();
      })
      .catch(errorCard);
  }

  function renderComments() {
    var rows = state.comments;
    var head = pageHead('评论管理', '「待审核」是机审无法判定的评论：作者本人可见，其他人看不到，需要你通过或驳回',
      chips([['PENDING', '待审核'], ['APPROVED', '已通过'], ['REMOVED', '已驳回'], ['', '全部']], state.commentFilter, 'cmtfilter') +
      '<input id="commentPostFilter" type="search" placeholder="按帖子 ID 过滤" value="' + escapeHtml(state.commentPostId) + '" style="height:30px;padding:0 10px;border:1px solid var(--line-2);border-radius:9px;font-size:12.5px;width:130px" />' +
      '<button class="btn small" id="commentFilterBtn">过滤</button>' +
      '<button class="btn small" id="exportComments">导出 CSV</button>');
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
        actions += '<button class="btn small primary-sm" data-cmtstatus="' + cid + '" data-on="APPROVED">通过</button>' +
          '<button class="btn small danger" data-cmtstatus="' + cid + '" data-on="REMOVED">驳回</button>';
      } else if (c.auditStatus === 'REMOVED') {
        actions += '<button class="btn small" data-cmtstatus="' + cid + '" data-on="APPROVED">恢复可见</button>';
      }
      actions += c.deleted
        ? '<button class="btn small" data-cmtrestore="' + cid + '">恢复</button>'
        : '<button class="btn small danger" data-cmtdel="' + cid + '">删除</button>';
      var picked = state.picked.comments[c.commentId] ? ' checked' : '';
      return '<tr><td class="pick"><input type="checkbox" data-pick="comments:' + cid + '"' + picked + ' /></td>' +
        '<td class="num">' + cid + '</td>' +
        '<td>#' + escapeHtml(String(c.postId)) + ' ' + escapeHtml(c.postTitle || '') + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(c.authorNickname) +
          '<span class="name">' + escapeHtml(c.authorNickname || ('用户' + c.authorUserId)) + '</span></div></td>' +
        '<td class="clamp" title="' + escapeHtml(c.content || '') + '">' + escapeHtml(c.content || '') + '</td>' +
        '<td>' + pill + '</td><td title="' + escapeHtml(c.createdAt || '') + '">' + fmtTime(c.createdAt) + '</td>' +
        '<td class="actions">' + actions + '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">没有评论</div></td></tr>';
    var pickedCount = pickedIds('comments').length;
    setPageHeader('共 ' + fmtNum(state.commentTotal) + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<div class="bulk-bar" data-bulkbar="comments"' + (pickedCount ? '' : ' hidden') + '>' +
      bulkBarHtml('comments', pickedCount) + '</div>' +
      '<table><thead><tr><th class="pick"><input type="checkbox" data-checkall="comments" aria-label="全选本页" /></th>' +
      '<th class="num">ID</th><th>帖子</th><th>作者</th><th>内容</th><th>状态</th>' +
      '<th>时间</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('comments', state.commentPage, state.commentSize, state.commentTotal) + '</div>';
  }

  function setCommentStatus(commentId, status) {
    request('/api/admin/comments/' + encodeURIComponent(commentId) + '/status', {
      method: 'POST', body: { status: status }
    }).then(function () { toast(status === 'APPROVED' ? '已通过' : '已驳回'); loadComments(); })
      .catch(function (err) { toast(err.message, 2600, 'error'); });
  }

  function deleteComment(commentId) {
    var c = findComment(commentId);
    confirmDialog({
      title: '删除该评论？',
      desc: '「' + (c.content || '评论 #' + commentId) + '」将被软删除，公开列表立即不可见，之后可在「已删除」里恢复。',
      danger: true,
      confirmText: '确认删除'
    }).then(function (ok) {
      if (!ok) return;
      request('/api/admin/comments/' + encodeURIComponent(commentId), { method: 'DELETE' })
        .then(function () { toast('已删除'); loadComments(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    });
  }

  function restoreComment(commentId) {
    request('/api/admin/comments/' + encodeURIComponent(commentId) + '/restore', { method: 'POST' })
      .then(function () { toast('已恢复'); loadComments(); })
      .catch(function (err) { toast(err.message, 2600, 'error'); });
  }

  // ==================== 菜谱治理 ====================

  function loadRecipes() {
    loadingCard();
    return request('/api/admin/recipes?keyword=' + encodeURIComponent(state.recipeKeyword || '') +
      '&status=' + encodeURIComponent(state.recipeFilter))
      .then(function (list) { state.recipes = Array.isArray(list) ? list : []; renderRecipes(); })
      .catch(errorCard);
  }

  function renderRecipes() {
    var rows = state.recipes;
    var head = pageHead('菜谱治理', '下架后用户端不再展示该菜谱',
      chips([['ACTIVE', '在线'], ['REMOVED', '已下架'], ['', '全部']], state.recipeFilter, 'recipefilter') +
      '<input id="recipeSearch" type="search" placeholder="按标题搜索" value="' + escapeHtml(state.recipeKeyword) +
      '" style="height:30px;padding:0 10px;border:1px solid var(--line-2);border-radius:9px;font-size:12.5px;width:150px" />' +
      '<button class="btn small" id="recipeSearchBtn">搜索</button>');
    var body = rows.length ? rows.map(function (r) {
      var removed = r.status === 'REMOVED';
      return '<tr><td class="num">' + escapeHtml(String(r.recipeId)) + '</td><td>' + escapeHtml(r.title || '') + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(r.ownerNickname) + '<span class="name">' +
          escapeHtml(r.ownerNickname || '—') + '</span></div></td>' +
        '<td>' + escapeHtml(r.cuisine || '—') + '</td>' +
        '<td class="num">' + escapeHtml(r.timeCost != null ? r.timeCost + ' 分钟' : '—') + '</td>' +
        '<td>' + (removed ? '<span class="pill bad">已下架</span>' : '<span class="pill ok">在线</span>') + '</td>' +
        '<td>' + fmtTime(r.createdAt) + '</td><td class="actions">' +
        (removed
          ? '<button class="btn small" data-recipestatus="' + escapeHtml(String(r.recipeId)) + '" data-on="ACTIVE">恢复</button>'
          : '<button class="btn small danger" data-recipestatus="' + escapeHtml(String(r.recipeId)) + '" data-on="REMOVED">下架</button>') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">没有菜谱</div></td></tr>';
    setPageHeader(rows.length + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>标题</th><th>作者</th><th>菜系</th><th class="num">耗时</th>' +
      '<th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function setRecipeStatus(recipeId, status) {
    var r = findRecipe(recipeId);
    var run = function () {
      return request('/api/admin/recipes/' + encodeURIComponent(recipeId) + '/status', {
        method: 'POST', body: { status: status }
      }).then(function () { toast(status === 'REMOVED' ? '已下架' : '已恢复'); loadRecipes(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    };
    if (status !== 'REMOVED') { run(); return; }
    confirmDialog({
      title: '下架该菜谱？',
      desc: '「' + (r.title || ('菜谱 #' + recipeId)) + '」下架后用户端不再展示，已收藏/已加购的用户也会看不到。',
      danger: true,
      confirmText: '确认下架'
    }).then(function (ok) { if (ok) run(); });
  }

  // ==================== 反馈工单 ====================

  var FB_STATUS = { OPEN: '待处理', PROCESSING: '处理中', CLOSED: '已关闭' };

  function loadFeedback() {
    loadingCard();
    return request('/api/admin/feedback?status=' + encodeURIComponent(state.feedbackFilter) +
      '&page=' + state.feedbackPage + '&size=' + state.feedbackSize)
      .then(function (page) {
        state.feedback = (page && page.items) || [];
        state.feedbackTotal = (page && page.total) || 0;
        state.feedbackPage = (page && page.page) || 0;
        renderFeedback();
      })
      .catch(errorCard);
  }

  function renderFeedback() {
    var rows = state.feedback;
    var head = pageHead('反馈工单', '用户提交的 bug / 建议 / 投诉',
      chips([['OPEN', '待处理'], ['PROCESSING', '处理中'], ['CLOSED', '已关闭'], ['', '全部']], state.feedbackFilter, 'fbfilter') +
      '<button class="btn small" id="exportFeedback">导出 CSV</button>');
    var body = rows.length ? rows.map(function (f) {
      var pill = f.status === 'CLOSED' ? 'ok' : (f.status === 'PROCESSING' ? 'pending' : 'bad');
      return '<tr><td class="num">' + escapeHtml(String(f.id)) + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(f.nickname) + '<span class="name">' +
          escapeHtml(f.nickname || ('用户' + f.userId)) + '</span></div></td>' +
        '<td>' + escapeHtml((f.types || []).join('、')) + '</td>' +
        '<td class="clamp" title="' + escapeHtml(f.content || '') + '">' + escapeHtml(f.content || '') + '</td>' +
        '<td>' + escapeHtml(f.contact || '—') + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(FB_STATUS[f.status] || f.status) + '</span></td>' +
        '<td>' + fmtTime(f.createdAt) + '</td><td class="actions">' +
        (f.status === 'OPEN' ? '<button class="btn small" data-fb="' + escapeHtml(String(f.id)) + '" data-on="PROCESSING">受理</button>' : '') +
        (f.status !== 'CLOSED' ? '<button class="btn small primary-sm" data-fb="' + escapeHtml(String(f.id)) + '" data-on="CLOSED">关闭</button>' : '') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="8"><div class="empty">没有工单</div></td></tr>';
    setPageHeader('共 ' + fmtNum(state.feedbackTotal) + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>用户</th><th>类型</th><th>内容</th><th>联系方式</th>' +
      '<th>状态</th><th>时间</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('feedback', state.feedbackPage, state.feedbackSize, state.feedbackTotal) + '</div>';
  }

  function handleFeedback(id, status) {
    if (status === 'CLOSED') {
      promptDialog({
        title: '关闭工单 #' + id,
        desc: '可选：填一段回复，用户会在小程序「我的反馈」里看到。',
        label: '回复内容（可留空）',
        multiline: true,
        placeholder: '例如：问题已修复，请更新到最新版本后重试。',
        confirmText: '确认关闭'
      }).then(function (reply) {
        if (reply === null) return;
        request('/api/admin/feedback/' + encodeURIComponent(id) + '/handle', {
          method: 'POST', body: { status: 'CLOSED', reply: reply }
        }).then(function () { toast('已关闭'); loadFeedback(); })
          .catch(function (err) { toast(err.message, 2600, 'error'); });
      });
      return;
    }
    request('/api/admin/feedback/' + encodeURIComponent(id) + '/handle', {
      method: 'POST', body: { status: status, reply: '' }
    }).then(function () { toast('已受理'); loadFeedback(); })
      .catch(function (err) { toast(err.message, 2600, 'error'); });
  }

  // ==================== 导入源审核 ====================

  var IMPORT_STATUS = { PENDING: '待审核', APPROVED: '已通过', REJECTED: '已驳回' };

  function loadImports() {
    loadingCard();
    return request('/api/admin/imports?auditStatus=' + encodeURIComponent(state.importFilter))
      .then(function (list) { state.imports = Array.isArray(list) ? list : []; renderImports(); })
      .catch(errorCard);
  }

  function renderImports() {
    var rows = state.imports;
    var head = pageHead('导入审核', '外部来源（链接 / 图片 OCR）解析出的菜谱，通过后才入库',
      chips([['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已驳回'], ['', '全部']], state.importFilter, 'importfilter'));
    var body = rows.length ? rows.map(function (im) {
      var pill = im.auditStatus === 'APPROVED' ? 'ok' : (im.auditStatus === 'REJECTED' ? 'bad' : 'pending');
      return '<tr><td class="num">' + escapeHtml(String(im.id)) + '</td>' +
        '<td>' + escapeHtml(im.sourceType || '—') + '</td>' +
        '<td class="clamp" title="' + escapeHtml(im.sourceUrl || '') + '">' + escapeHtml(im.sourceUrl || '—') + '</td>' +
        '<td class="clamp" title="' + escapeHtml(im.sourceText || '') + '">' + escapeHtml(im.sourceText || '—') + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(IMPORT_STATUS[im.auditStatus] || im.auditStatus) + '</span></td>' +
        '<td>' + fmtTime(im.createdAt) + '</td><td class="actions">' +
        (im.auditStatus === 'PENDING'
          ? '<button class="btn small primary-sm" data-import="' + escapeHtml(String(im.id)) + '" data-on="APPROVED">通过</button>' +
            '<button class="btn small danger" data-import="' + escapeHtml(String(im.id)) + '" data-on="REJECTED">驳回</button>'
          : escapeHtml(im.reviewNote || '—')) +
        '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty">没有导入记录</div></td></tr>';
    setPageHeader(rows.length + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>类型</th><th>来源链接</th><th>内容摘要</th><th>状态</th>' +
      '<th>时间</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  function reviewImport(id, status) {
    if (status !== 'REJECTED') {
      request('/api/admin/imports/' + encodeURIComponent(id) + '/status', {
        method: 'POST', body: { status: 'APPROVED', note: '' }
      }).then(function () { toast('已通过'); loadImports(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
      return;
    }
    promptDialog({
      title: '驳回导入源 #' + id,
      desc: '驳回原因会记录在审核留痕里，方便后续追溯为什么没入库。',
      label: '驳回原因（可留空）',
      multiline: true,
      placeholder: '例如：来源不可靠 / 内容不完整 / 与已有菜谱重复',
      confirmText: '确认驳回',
      danger: true
    }).then(function (note) {
      if (note === null) return;
      request('/api/admin/imports/' + encodeURIComponent(id) + '/status', {
        method: 'POST', body: { status: 'REJECTED', note: note }
      }).then(function () { toast('已驳回'); loadImports(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    });
  }

  // ==================== 用户管理 ====================

  function loadUsers() {
    loadingCard();
    return request('/api/admin/users?keyword=' + encodeURIComponent(state.userKeyword || '') +
      '&sort=' + encodeURIComponent(state.userSort) + '&order=' + encodeURIComponent(state.userOrder) +
      '&page=' + state.users.page + '&size=' + state.users.size)
      .then(function (page) { state.users = page || { items: [], total: 0, page: 0, size: 20 }; renderUsers(); })
      .catch(errorCard);
  }

  function renderUsers() {
    var p = state.users;
    var rows = p.items || [];
    var head = pageHead('用户管理', '检索账号、授予权限、封禁、人工开通会员',
      '<input id="userSearch" type="search" placeholder="搜昵称 / 手机号 / openid" value="' + escapeHtml(state.userKeyword) +
      '" style="height:30px;padding:0 10px;border:1px solid var(--line-2);border-radius:9px;font-size:12.5px;width:200px" />' +
      '<button class="btn small" id="userSearchBtn">搜索</button>' +
      '<button class="btn small" id="exportUsers">导出 CSV</button>');
    var body = rows.length ? rows.map(function (u) {
      var banned = u.status === 'BANNED';
      return '<tr><td class="num">' + escapeHtml(String(u.userId)) + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(u.nickname, u.avatarUrl) +
          '<div><div class="name">' + escapeHtml(u.nickname || '') + '</div>' +
          '<div class="sub">' + escapeHtml(u.openid || '—') + '</div></div></div></td>' +
        '<td>' + escapeHtml(u.phone || '—') + '</td>' +
        '<td>' + (u.admin ? '<span class="pill info">' + escapeHtml(roleLabel(u.adminRole)) + '</span>' : '<span class="pill">普通用户</span>') + '</td>' +
        '<td>' + (banned ? '<span class="pill bad">已封禁</span>' : '<span class="pill ok">正常</span>') + '</td>' +
        '<td title="' + escapeHtml(u.createdAt || '') + '">' + fmtTime(u.createdAt) + '</td><td class="actions">' +
        (can('USER_MANAGE')
          ? '<button class="btn small' + (u.admin ? ' danger' : '') + '" data-role="' + escapeHtml(String(u.userId)) + '">' +
              (u.admin ? '调整角色' : '设为管理员') + '</button>' +
            '<button class="btn small" data-vip="' + escapeHtml(String(u.userId)) + '">开通会员</button>' +
            (u.admin ? '' : (banned
              ? '<button class="btn small" data-userstatus="' + escapeHtml(String(u.userId)) + '" data-on="ACTIVE">解封</button>'
              : '<button class="btn small danger" data-userstatus="' + escapeHtml(String(u.userId)) + '" data-on="BANNED">封禁</button>'))
          : '<span class="muted">只读</span>') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty">没有匹配的用户</div></td></tr>';
    setPageHeader('共 ' + fmtNum(p.total) + ' 个账号');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr>' + thSort('ID', 'id', 'user', 'num') + '<th>用户</th><th>手机号</th><th>角色</th><th>状态</th>' +
      thSort('注册时间', 'createdAt', 'user') + '<th>操作</th></tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('users', p.page, p.size, p.total) + '</div>';
  }

  function setUserStatus(userId, status) {
    var u = findUser(userId);
    var banned = status === 'BANNED';
    var run = function () {
      return request('/api/admin/users/' + encodeURIComponent(userId) + '/status', {
        method: 'POST', body: { status: status }
      }).then(function () { toast(banned ? '已封禁' : '已解封'); loadUsers(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    };
    if (!banned) { run(); return; }
    confirmDialog({
      title: '封禁该账号？',
      desc: '「' + (u.nickname || ('用户 ' + userId)) + '」的所有登录会话会立即失效，且无法再登录小程序。',
      danger: true,
      confirmText: '确认封禁'
    }).then(function (ok) { if (ok) run(); });
  }

  function grantVip(userId) {
    var u = findUser(userId);
    var plans = [
      { code: 'annual', name: '家庭年卡', price: '¥99.00', days: '365 天' },
      { code: 'monthly', name: '家庭月卡', price: '¥19.90', days: '30 天' }
    ];
    openModal({
      title: '人工开通会员',
      desc: '给「' + (u.nickname || ('用户 ' + userId)) + '」开通或顺延会员。此操作不产生订单流水，但会写入审计日志。',
      body: '<div class="plan-grid">' + plans.map(function (p, i) {
        return '<label class="plan-option">' +
          '<input type="radio" name="vipPlan" value="' + p.code + '"' + (i === 0 ? ' checked' : '') + ' />' +
          '<span class="plan-name">' + p.name + '</span>' +
          '<span class="plan-price">' + p.price + '</span>' +
          '<span class="plan-days">' + p.days + '</span></label>';
      }).join('') + '</div>',
      confirmText: '确认开通',
      read: function (root) {
        var el = root.querySelector('input[name="vipPlan"]:checked');
        return { planCode: el ? el.value : 'annual' };
      },
      onConfirm: function (v) {
        return request('/api/admin/users/' + encodeURIComponent(userId) + '/vip', {
          method: 'POST', body: { planCode: v.planCode }
        }).then(function () { toast('已开通会员'); loadUsers(); });
      }
    });
  }

  // ==================== 订单 ====================

  var ORDER_STATUS = { PENDING: '待支付', PAID: '已支付', CLOSED: '已关闭', REFUNDED: '已退款' };

  function loadOrders() {
    loadingCard();
    return request('/api/admin/orders?status=' + encodeURIComponent(state.orderFilter) +
      '&from=' + encodeURIComponent(state.orderFrom || '') + '&to=' + encodeURIComponent(state.orderTo || '') +
      '&sort=' + encodeURIComponent(state.orderSort) + '&order=' + encodeURIComponent(state.orderOrder) +
      '&page=' + state.orderPage + '&size=' + state.orderSize)
      .then(function (page) {
        state.orders = (page && page.items) || [];
        state.orderTotal = (page && page.total) || 0;
        state.orderPage = (page && page.page) || 0;
        renderOrders();
      })
      .catch(errorCard);
  }

  function renderOrders() {
    var rows = state.orders;
    var paid = rows.filter(function (o) { return o.status === 'PAID'; });
    var revenue = paid.reduce(function (a, o) { return a + Number(o.amountFen || 0); }, 0);
    var head = pageHead('订单管理',
      '共 ' + fmtNum(state.orderTotal) + ' 笔 · 本页已支付 ' + paid.length + ' 笔 ' + fmtMoney(revenue),
      chips([['', '全部'], ['PENDING', '待支付'], ['PAID', '已支付'], ['CLOSED', '已关闭'], ['REFUNDED', '已退款']], state.orderFilter, 'orderfilter') +
      dateRangeHtml('order', state.orderFrom, state.orderTo) +
      '<button class="btn small" id="exportOrders">导出 CSV</button>');
    var body = rows.length ? rows.map(function (o) {
      var pill = o.status === 'PAID' ? 'ok' : (o.status === 'PENDING' ? 'pending' : 'bad');
      return '<tr><td class="num">' + escapeHtml(String(o.orderId)) + '</td>' +
        '<td>' + escapeHtml(o.outTradeNo) + '</td>' +
        '<td class="num">' + escapeHtml(String(o.payerUserId)) + '</td>' +
        '<td>' + escapeHtml(o.planName || o.planCode) + '</td>' +
        '<td class="num">' + fmtMoney(o.amountFen) + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(ORDER_STATUS[o.status] || o.status) + '</span></td>' +
        '<td>' + escapeHtml(o.paymentMethod || '—') + '</td>' +
        '<td title="下单 ' + escapeHtml(o.createdAt || '') + (o.paidAt ? ' / 支付 ' + escapeHtml(o.paidAt) : '') + '">' +
        fmtTime(o.paidAt || o.createdAt) + '</td>' +
        '<td class="actions">' +
        (can('ORDER_MANAGE')
          ? (o.status === 'PENDING'
              ? '<button class="btn small danger" data-orderclose="' + escapeHtml(o.outTradeNo) + '">关单</button>' : '') +
            (o.status === 'PAID'
              ? '<button class="btn small danger" data-orderrefund="' + escapeHtml(o.outTradeNo) + '">退款</button>' : '')
          : '<span class="muted">只读</span>') +
        '</td></tr>';
    }).join('') : '<tr><td colspan="9"><div class="empty">没有订单</div></td></tr>';
    setPageHeader('共 ' + fmtNum(state.orderTotal) + ' 笔');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr>' + thSort('ID', 'id', 'order', 'num') + '<th>商户单号</th><th class="num">用户</th><th>套餐</th>' +
      thSort('金额', 'amount', 'order', 'num') + '<th>状态</th><th>方式</th>' +
      thSort('时间', 'createdAt', 'order') + '<th>操作</th></tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('orders', state.orderPage, state.orderSize, state.orderTotal) + '</div>';
  }

  function closeOrder(outTradeNo) {
    var o = findOrder(outTradeNo);
    confirmDialog({
      title: '关闭该订单？',
      desc: '单号 ' + outTradeNo + '（' + (o.planName || o.planCode || '—') + ' ' + fmtMoney(o.amountFen) +
        '）将被标记为已关闭，用户无法再继续支付。',
      danger: true,
      confirmText: '确认关单'
    }).then(function (ok) {
      if (!ok) return;
      request('/api/admin/orders/' + encodeURIComponent(outTradeNo) + '/close', { method: 'POST' })
        .then(function () { toast('已关单'); loadOrders(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    });
  }

  function refundOrder(outTradeNo) {
    var o = findOrder(outTradeNo);
    confirmDialog({
      title: '退款并回收会员权益？',
      desc: '订单 ' + outTradeNo + '（' + fmtMoney(o.amountFen) + '）对应的会员时长会被扣回，' +
        '这里只做账务与权益处理，真实资金退款仍需到微信商户平台操作。',
      danger: true,
      confirmText: '确认退款'
    }).then(function (ok) {
      if (!ok) return;
      request('/api/admin/orders/' + encodeURIComponent(outTradeNo) + '/refund', { method: 'POST' })
        .then(function () { toast('已退款'); loadOrders(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    });
  }

  // ==================== 审计 ====================

  function loadAudit() {
    loadingCard();
    return request('/api/admin/audit?keyword=' + encodeURIComponent(state.auditKeyword || '') +
      '&from=' + encodeURIComponent(state.auditFrom || '') + '&to=' + encodeURIComponent(state.auditTo || '') +
      '&sort=' + encodeURIComponent(state.auditSort) + '&order=' + encodeURIComponent(state.auditOrder) +
      '&page=' + state.auditPage + '&size=' + state.auditSize)
      .then(function (page) {
        state.audit = (page && page.items) || [];
        state.auditTotal = (page && page.total) || 0;
        state.auditPage = (page && page.page) || 0;
        renderAudit();
      })
      .catch(errorCard);
  }

  function renderAudit() {
    var rows = state.audit;
    var kw = (state.auditKeyword || '').trim();
    var head = pageHead('审计日志', '所有管理写操作都会留痕' + (kw ? '（已按「' + kw + '」过滤）' : ''),
      '<input id="auditSearch" type="search" placeholder="搜操作人 / 动作 / 对象 / 详情" value="' +
      escapeHtml(state.auditKeyword) + '" style="height:30px;padding:0 10px;border:1px solid var(--line-2);border-radius:9px;font-size:12.5px;width:240px" />' +
      '<button class="btn small" id="auditSearchBtn">搜索</button>' +
      (kw ? '<button class="btn small" id="auditClearBtn">清除</button>' : '') +
      dateRangeHtml('audit', state.auditFrom, state.auditTo) +
      '<button class="btn small" id="exportAudit">导出 CSV</button>');
    var body = rows.length ? rows.map(function (a) {
      return '<tr><td class="num">' + escapeHtml(String(a.id)) + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(a.actorNickname) + '<span class="name">' +
          escapeHtml(a.actorNickname || String(a.actorUserId)) + '</span></div></td>' +
        '<td><span class="pill">' + escapeHtml(a.action) + '</span></td>' +
        '<td>' + escapeHtml(a.targetType + (a.targetId ? '#' + a.targetId : '')) + '</td>' +
        '<td class="clamp" title="' + escapeHtml(a.detail || '') + '">' + escapeHtml(a.detail || '—') + '</td>' +
        '<td><span class="pill ' + (a.result === 'OK' ? 'ok' : 'bad') + '">' + escapeHtml(a.result) + '</span></td>' +
        '<td title="' + escapeHtml(a.createdAt || '') + '">' + fmtTime(a.createdAt) + '</td></tr>';
    }).join('') : '<tr><td colspan="7"><div class="empty">没有匹配的操作记录</div></td></tr>';
    setPageHeader('共 ' + fmtNum(state.auditTotal) + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr>' + thSort('ID', 'id', 'audit', 'num') + '<th>操作人</th><th>动作</th><th>对象</th><th>详情</th>' +
      '<th>结果</th>' + thSort('时间', 'createdAt', 'audit') + '</tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('audit', state.auditPage, state.auditSize, state.auditTotal) + '</div>';
  }

  // ==================== 导出 ====================
  // 导出真正的 .xlsx（服务端生成，零依赖）；导出的是当前筛选条件下的全量数据。

  function exportQuery() {
    var t = state.tab;
    if (t === 'users') {
      return 'users?keyword=' + encodeURIComponent(state.userKeyword || '') +
        '&sort=' + encodeURIComponent(state.userSort) + '&order=' + encodeURIComponent(state.userOrder);
    }
    if (t === 'orders') {
      return 'orders?status=' + encodeURIComponent(state.orderFilter || '') +
        '&from=' + encodeURIComponent(state.orderFrom || '') + '&to=' + encodeURIComponent(state.orderTo || '');
    }
    if (t === 'audit') {
      return 'audit?keyword=' + encodeURIComponent(state.auditKeyword || '') +
        '&from=' + encodeURIComponent(state.auditFrom || '') + '&to=' + encodeURIComponent(state.auditTo || '');
    }
    if (t === 'comments') {
      return 'comments?auditStatus=' + encodeURIComponent(state.commentFilter || '') +
        (state.commentPostId ? '&postId=' + encodeURIComponent(state.commentPostId) : '');
    }
    if (t === 'feedback') return 'feedback?status=' + encodeURIComponent(state.feedbackFilter || '');
    if (t === 'posts') return 'posts?auditStatus=' + encodeURIComponent(state.postFilter || '');
    if (t === 'reports') return 'reports?status=' + encodeURIComponent(state.reportFilter || '');
    return null;
  }

  function exportCurrent() {
    if (!can('EXPORT')) { toast('当前角色没有导出权限', 2600, 'error'); return; }
    var qs = exportQuery();
    if (!qs) { toast('当前页面没有可导出的数据'); return; }
    toast('正在生成 Excel…', 1600);
    fetch('/api/admin/export/' + qs, { headers: { 'X-Auth-Token': state.token } })
      .then(function (res) {
        if (res.status === 401) { logout(true); throw new Error('登录已失效'); }
        if (!res.ok) throw new Error('导出失败（' + res.status + '）');
        var name = (res.headers.get('Content-Disposition') || '').match(/filename\*=UTF-8''([^;]+)/);
        return res.blob().then(function (blob) {
          return { blob: blob, name: name ? decodeURIComponent(name[1]) : 'export.xlsx' };
        });
      })
      .then(function (out) {
        var a = document.createElement('a');
        a.href = URL.createObjectURL(out.blob);
        a.download = out.name;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        setTimeout(function () { URL.revokeObjectURL(a.href); }, 1500);
        toast('已导出 ' + out.name, 2600);
      })
      .catch(function (err) { toast(err.message, 2600, 'error'); });
  }

  // ==================== 站内弹窗 ====================
  // 全部管理操作都用站内弹窗确认/收集输入，不用原生 confirm/prompt
  // （原生弹窗样式不可控、无法展示上下文、还会被浏览器拦截）。

  var modalResolve = null;

  function setModalError(root, msg) {
    var el = root.querySelector('.modal-error');
    if (!el) {
      el = document.createElement('p');
      el.className = 'modal-error';
      var body = root.querySelector('.modal-body') || root.querySelector('.modal-foot');
      body.insertBefore(el, body.firstChild);
    }
    el.textContent = msg;
  }

  function closeModal(value) {
    var root = $('modalRoot');
    if (!root) return;
    root.hidden = true;
    root.innerHTML = '';
    var resolve = modalResolve;
    modalResolve = null;
    if (resolve) resolve(value);
  }

  /**
   * 打开弹窗。cfg = { title, desc, body, danger, confirmText, cancelText,
   *                  read(root) → values, validate(values) → 错误文案|null,
   *                  onConfirm(values, btn) → false 保持打开 / Promise 成功后关闭 }
   * 返回 Promise：确认时 resolve(values)，取消时 resolve(null)。
   */
  function openModal(cfg) {
    return new Promise(function (resolve) {
      var root = $('modalRoot');
      root.innerHTML =
        '<div class="modal-backdrop">' +
          '<div class="modal' + (cfg.danger ? ' danger' : '') + '" role="dialog" aria-modal="true">' +
            '<div class="modal-head"><h3>' + escapeHtml(cfg.title) + '</h3>' +
              (cfg.desc ? '<p>' + escapeHtml(cfg.desc) + '</p>' : '') + '</div>' +
            '<div class="modal-body">' + (cfg.body || '') + '</div>' +
            '<div class="modal-foot">' +
              '<button type="button" class="btn" data-modal-cancel>' + escapeHtml(cfg.cancelText || '取消') + '</button>' +
              '<button type="button" class="btn ' + (cfg.danger ? 'danger-solid' : 'primary') + '" data-modal-confirm>' +
                escapeHtml(cfg.confirmText || '确定') + '</button>' +
            '</div>' +
          '</div>' +
        '</div>';
      root.hidden = false;
      modalResolve = resolve;

      var backdrop = root.querySelector('.modal-backdrop');
      var confirmBtn = root.querySelector('[data-modal-confirm]');
      var cancelBtn = root.querySelector('[data-modal-cancel]');
      var first = root.querySelector('input, textarea, select');
      if (first) setTimeout(function () { first.focus(); if (first.select && first.type !== 'radio') first.select(); }, 40);

      confirmBtn.addEventListener('click', function () {
        var values = cfg.read ? cfg.read(root) : {};
        if (cfg.validate) {
          var err = cfg.validate(values);
          if (err) { setModalError(root, err); return; }
        }
        if (cfg.onConfirm) {
          var ret;
          try { ret = cfg.onConfirm(values, confirmBtn); }
          catch (e) { setModalError(root, e.message); return; }
          if (ret === false) return;
          if (ret && typeof ret.then === 'function') {
            var label = confirmBtn.textContent;
            confirmBtn.disabled = true;
            confirmBtn.textContent = '处理中…';
            ret.then(function () { closeModal(values); })
              .catch(function (e) {
                confirmBtn.disabled = false;
                confirmBtn.textContent = label;
                setModalError(root, e.message || '操作失败');
              });
            return;
          }
        }
        closeModal(values);
      });
      cancelBtn.addEventListener('click', function () { closeModal(null); });
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(null); });
    });
  }

  /** 确认框：resolve(true) / resolve(false) */
  function confirmDialog(opts) {
    return openModal({
      title: opts.title,
      desc: opts.desc,
      body: opts.body,
      danger: opts.danger,
      confirmText: opts.confirmText,
      cancelText: opts.cancelText
    }).then(function (v) { return v !== null; });
  }

  /** 输入框：resolve(值) / resolve(null) */
  function promptDialog(opts) {
    var inputId = 'modalInput';
    var body = '<label for="' + inputId + '">' + escapeHtml(opts.label) + '</label>' +
      (opts.multiline
        ? '<textarea id="' + inputId + '" placeholder="' + escapeHtml(opts.placeholder || '') + '">' + escapeHtml(opts.value || '') + '</textarea>'
        : '<input id="' + inputId + '" type="text" placeholder="' + escapeHtml(opts.placeholder || '') + '" value="' + escapeHtml(opts.value || '') + '" />');
    return openModal({
      title: opts.title,
      desc: opts.desc,
      body: body,
      confirmText: opts.confirmText,
      read: function (root) { return { value: (root.querySelector('#' + inputId) || {}).value || '' }; },
      validate: function (v) {
        if (opts.required && !v.value.trim()) return opts.requiredMessage || '此项必填';
        return null;
      },
      onConfirm: function () { return true; }
    }).then(function (v) { return v === null ? null : v.value; });
  }

  // 从当前列表里找上下文，让弹窗能显示"正在操作谁"
  function findUser(userId) {
    return (state.users.items || []).filter(function (u) { return String(u.userId) === String(userId); })[0] || {};
  }
  function findComment(commentId) {
    return state.comments.filter(function (c) { return String(c.commentId) === String(commentId); })[0] || {};
  }
  function findPost(postId) {
    return state.posts.filter(function (p) { return String(p.id) === String(postId); })[0] || {};
  }
  function findRecipe(recipeId) {
    return state.recipes.filter(function (r) { return String(r.recipeId) === String(recipeId); })[0] || {};
  }
  function findOrder(outTradeNo) {
    return state.orders.filter(function (o) { return o.outTradeNo === outTradeNo; })[0] || {};
  }
  function findReport(reportId) {
    return state.reports.filter(function (r) { return String(r.reportId) === String(reportId); })[0] || {};
  }

  /** 批量审核：评论 / 帖子 / 举报 */
  function runBulk(spec) {
    var parts = String(spec).split(':');
    var kind = parts[0], action = parts[1];
    if (action === 'clear') { state.picked[kind] = {}; renderCurrentList(); return; }
    var ids = pickedIds(kind).map(Number).filter(function (n) { return !isNaN(n); });
    if (!ids.length) { toast('请先勾选要处理的记录'); return; }
    var label = action === 'APPROVED' ? '通过'
      : action === 'REMOVED' ? (kind === 'reports' ? '下架帖子' : '驳回/下架') : '忽略';
    confirmDialog({
      title: '批量' + label + '？',
      desc: '将处理已勾选的 ' + ids.length + ' 条记录，操作会写入审计日志。',
      danger: action === 'REMOVED',
      confirmText: '确认处理'
    }).then(function (ok) {
      if (!ok) return;
      var url = kind === 'comments' ? '/api/admin/comments/batch-status'
        : kind === 'posts' ? '/api/admin/posts/batch-status'
          : '/api/community/reports/batch-review';
      request(url, { method: 'POST', body: { ids: ids, status: action, note: '' } })
        .then(function (res) {
          toast('已处理 ' + (res && res.changed != null ? res.changed : ids.length) + ' 条');
          state.picked[kind] = {};
          if (kind === 'comments') loadComments();
          else if (kind === 'posts') loadPosts();
          else loadReports();
        })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    });
  }

  var ROLE_OPTIONS = [
    { value: 'SUPER', name: '超级管理员', desc: '全部权限：用户管理、退款、审计日志' },
    { value: 'MODERATOR', name: '内容审核员', desc: '只能处理内容：帖子 / 评论 / 举报 / 导入 / 菜谱' },
    { value: 'SUPPORT', name: '客服', desc: '只读用户与订单 + 处理反馈工单，不能封禁或退款' },
    { value: '', name: '取消管理员', desc: '收回后台访问权限，其登录会话立即失效' }
  ];

  /** 角色选择弹窗（仅超管可见） */
  function openRoleDialog(userId) {
    var u = findUser(userId);
    var current = u.admin ? (u.adminRole || 'SUPER') : '';
    openModal({
      title: '设置管理端角色',
      desc: '「' + (u.nickname || ('用户 ' + userId)) + '」当前：' +
        (u.admin ? roleLabel(u.adminRole) : '非管理员'),
      body: '<div class="plan-grid">' + ROLE_OPTIONS.map(function (o) {
        return '<label class="plan-option role-option">' +
          '<input type="radio" name="rolePick" value="' + o.value + '"' + (o.value === current ? ' checked' : '') + ' />' +
          '<span class="role-name">' + escapeHtml(o.name) + '<small>' + escapeHtml(o.desc) + '</small></span></label>';
      }).join('') + '</div>',
      confirmText: '保存角色',
      read: function (root) {
        var el = root.querySelector('input[name="rolePick"]:checked');
        return { role: el ? el.value : '' };
      },
      onConfirm: function (v) {
        return request('/api/admin/users/' + encodeURIComponent(userId) + '/role', {
          method: 'POST', body: { role: v.role }
        }).then(function () {
          toast(v.role ? '已设为' + roleLabel(v.role) : '已取消管理员');
          loadUsers();
        });
      }
    });
  }

  function roleLabel(role) {
    var found = ROLE_OPTIONS.filter(function (o) { return o.value === role; })[0];
    if (found) return found.name;
    return role ? String(role) : '管理员';
  }

  // ==================== 事件绑定 ====================
  // 可点击元素内部常有子节点（卡片数字/文字），点击时 e.target 是子节点，
  // 直接读它的 data-* 会拿到 null，所以先向上找到真正带属性的宿主元素。
  var CLICKABLE = [
    '[data-tab]', '[data-goto]', '[data-review]', '[data-rptfilter]', '[data-role]', '[data-vip]',
    '[data-postfilter]', '[data-poststatus]', '[data-recipefilter]', '[data-recipestatus]',
    '[data-cmtfilter]', '[data-cmtstatus]', '[data-cmtdel]', '[data-cmtrestore]', '[data-fbfilter]',
    '[data-fb]', '[data-orderfilter]', '[data-orderclose]', '[data-orderrefund]', '[data-userstatus]',
    '[data-importfilter]', '[data-import]', '[data-pager]', '[data-sort]', '[data-bulk]'
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
    if (id === 'menuBtn') { $('appView').classList.toggle('nav-open'); return; }
    if (id === 'navBackdrop') { closeNav(); return; }
    if (id === 'refreshBtn') { refreshCurrent(); return; }

    if (id === 'userSearchBtn') {
      state.userKeyword = ($('userSearch') || {}).value || '';
      state.users.page = 0; loadUsers(); return;
    }

    if (id === 'exportUsers' || id === 'exportOrders' || id === 'exportAudit' ||
        id === 'exportPosts' || id === 'exportComments' || id === 'exportFeedback' ||
        id === 'exportReports') { exportCurrent(); return; }

    var tab = t.getAttribute('data-tab');
    if (tab) { state.tab = tab; closeNav(); renderNav(); loadTab(); return; }

    var goto = t.getAttribute('data-goto');
    if (goto) { goTab(goto, t.getAttribute('data-gotofilter')); return; }

    var review = t.getAttribute('data-review');
    if (review) { reviewReport(review, t.getAttribute('data-status')); return; }

    var rptf = t.getAttribute('data-rptfilter');
    if (rptf !== null) { state.reportFilter = rptf; loadReports(); return; }

    var roleBtn = t.getAttribute('data-role');
    if (roleBtn) { openRoleDialog(roleBtn); return; }

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
      state.commentPage = 0;
      loadComments(); return;
    }
    var cd = t.getAttribute('data-cmtdel');
    if (cd) { deleteComment(cd); return; }
    var cr = t.getAttribute('data-cmtrestore');
    if (cr) { restoreComment(cr); return; }
    var ctf = t.getAttribute('data-cmtfilter');
    if (ctf !== null) { state.commentFilter = ctf; state.commentPage = 0; loadComments(); return; }
    var cts = t.getAttribute('data-cmtstatus');
    if (cts) { setCommentStatus(cts, t.getAttribute('data-on')); return; }

    if (id === 'auditSearchBtn') {
      state.auditKeyword = ($('auditSearch') || {}).value || '';
      state.auditPage = 0;
      loadAudit(); return;
    }

    var pager = t.getAttribute('data-pager');
    if (pager) { changePage(pager); return; }

    var bulk = t.getAttribute('data-bulk');
    if (bulk) { runBulk(bulk); return; }

    var sortSpec = t.getAttribute('data-sort');
    if (sortSpec) {
      var sp = String(sortSpec).split(':');
      var kind = sp[0], key = sp[1];
      if (state[kind + 'Sort'] === key) {
        state[kind + 'Order'] = state[kind + 'Order'] === 'asc' ? 'desc' : 'asc';
      } else {
        state[kind + 'Sort'] = key;
        state[kind + 'Order'] = 'desc';
      }
      if (kind === 'order') { state.orderPage = 0; loadOrders(); }
      else if (kind === 'user') { state.users.page = 0; loadUsers(); }
      else if (kind === 'audit') { state.auditPage = 0; loadAudit(); }
      return;
    }

    if (id === 'orderDateBtn') {
      state.orderFrom = ($('orderFrom') || {}).value || '';
      state.orderTo = ($('orderTo') || {}).value || '';
      state.orderPage = 0; loadOrders(); return;
    }
    if (id === 'orderDateClear') {
      state.orderFrom = ''; state.orderTo = ''; state.orderPage = 0; loadOrders(); return;
    }
    if (id === 'auditDateBtn') {
      state.auditFrom = ($('auditFrom') || {}).value || '';
      state.auditTo = ($('auditTo') || {}).value || '';
      state.auditPage = 0; loadAudit(); return;
    }
    if (id === 'auditDateClear') {
      state.auditFrom = ''; state.auditTo = ''; state.auditPage = 0; loadAudit(); return;
    }

    if (id === 'auditClearBtn') {
      state.auditKeyword = ''; state.auditPage = 0; loadAudit(); return;
    }

    var fbf = t.getAttribute('data-fbfilter');
    if (fbf !== null) { state.feedbackFilter = fbf; state.feedbackPage = 0; loadFeedback(); return; }

    var fb = t.getAttribute('data-fb');
    if (fb) { handleFeedback(fb, t.getAttribute('data-on')); return; }

    var of = t.getAttribute('data-orderfilter');
    if (of !== null) { state.orderFilter = of; state.orderPage = 0; loadOrders(); return; }

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

  // 复选框用 change 事件（键盘空格也能触发）
  document.addEventListener('change', function (e) {
    var t = e.target;
    if (!t || !t.getAttribute) return;
    var pick = t.getAttribute('data-pick');
    if (pick) { setPick(pick, t.checked); return; }
    var all = t.getAttribute('data-checkall');
    if (all) { setPickAll(all, t.checked); }
  });

  document.addEventListener('keydown', function (e) {
    // 弹窗优先：ESC 关闭，单行输入回车直接确认
    if (modalResolve) {
      if (e.key === 'Escape') { e.preventDefault(); closeModal(null); return; }
      if (e.key === 'Enter' && e.target && e.target.id === 'modalInput' && e.target.tagName === 'INPUT') {
        e.preventDefault();
        var btn = document.querySelector('[data-modal-confirm]');
        if (btn && !btn.disabled) btn.click();
        return;
      }
      // 焦点锁在弹窗内，Tab 不跑到背后的页面上
      if (e.key === 'Tab') {
        var root = $('modalRoot');
        var focusables = Array.prototype.slice.call(
          root.querySelectorAll('button, input, textarea, select, [tabindex]:not([tabindex="-1"])'))
          .filter(function (el) { return !el.disabled; });
        if (focusables.length) {
          var first = focusables[0], last = focusables[focusables.length - 1];
          if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
        }
      }
      return;
    }
    // 侧边导航键盘可达：Enter / 空格切换
    if ((e.key === 'Enter' || e.key === ' ') && e.target && e.target.classList &&
        e.target.classList.contains('nav-item')) {
      e.preventDefault();
      e.target.click();
      return;
    }
    if (e.key === 'Enter' && e.target) {
      if (e.target.id === 'userSearch') {
        state.userKeyword = e.target.value || ''; state.users.page = 0; loadUsers();
      } else if (e.target.id === 'recipeSearch') {
        state.recipeKeyword = e.target.value || ''; loadRecipes();
      } else if (e.target.id === 'commentPostFilter') {
        state.commentPostId = e.target.value || ''; state.commentPage = 0; loadComments();
      } else if (e.target.id === 'auditSearch') {
        state.auditKeyword = e.target.value || ''; state.auditPage = 0; loadAudit();
      }
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
