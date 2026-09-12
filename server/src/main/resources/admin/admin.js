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
    /** 快速跳转的键盘高亮下标 */
    jumpIndex: 0,
    imports: [],
    importFilter: 'PENDING',
    /** 家庭与成员（只读） */
    families: { items: [], total: 0, page: 0, size: 20 },
    familyKeyword: '',
    /** 今日菜单（只读）：menuDate 为空表示不限日期 */
    menus: { items: [], total: 0, page: 0, size: 50 },
    menuDate: '',
    menuKeyword: '',
    /** 购物清单（只读） */
    shopping: { items: [], total: 0, page: 0, size: 50 },
    shoppingDate: '',
    shoppingFilter: '',
    /** 家庭库存（只读） */
    pantry: { items: [], total: 0, page: 0, size: 50 },
    pantryKeyword: ''
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
    shield: '<path d="M12 3l7 3v5.6c0 4.2-2.9 7.9-7 9.4-4.1-1.5-7-5.2-7-9.4V6l7-3z"/><path d="M9.2 12.1l2 2 3.6-3.8"/>',
    home: '<path d="M4 10.4L12 4l8 6.4V20H4z"/><path d="M9.6 20v-5.4h4.8V20"/>',
    cart: '<circle cx="9.6" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M3 4h2.3l2.2 10.3h10.3L20.5 7H6.1"/>',
    box: '<path d="M3.6 8.4L12 5l8.4 3.4v7.2L12 19l-8.4-3.4z"/><path d="M3.6 8.4L12 11.8l8.4-3.4M12 11.8V19"/>'
  };

  function icon(name) {
    return '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      (ICONS[name] || ICONS.grid) + '</svg>';
  }

  /**
   * 空状态/错误态的插画图标（线性、单色，跟表格里的图标区分开）
   * 空列表配一张图 + 一句"下一步该干什么"，比一行灰字专业得多。
   */
  var EMPTY_ICONS = {
    inbox: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.5 13.5h4l1.4 2.4h6.2l1.4-2.4h4"/><path d="M5.6 5.2h12.8l2.1 8.3v3.9a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6v-3.9z"/></svg>',
    comment: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M20.5 11.5a7.5 7.5 0 0 1-7.5 7.5H8l-4.5 3v-5.6A7.5 7.5 0 0 1 13 4a7.5 7.5 0 0 1 7.5 7.5z"/><path d="M9.5 11.5h.01M13 11.5h.01M16.5 11.5h.01"/></svg>',
    flag: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M6 21V4h12l-2.2 4.5L18 13H6"/></svg>',
    users: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9" cy="8.5" r="3.4"/><path d="M2.8 20c0-3.4 2.8-5.6 6.2-5.6s6.2 2.2 6.2 5.6"/><path d="M16.5 5.6a3.4 3.4 0 0 1 0 6.6M18 14.6c2 .6 3.2 2.2 3.2 4.4"/></svg>',
    card: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><rect x="2.6" y="5.2" width="18.8" height="13.6" rx="2.2"/><path d="M2.6 9.8h18.8"/><path d="M6.4 14.6h3.4"/></svg>',
    file: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5"/><path d="M9 13h6M9 16.5h4"/></svg>',
    book: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.2A2.2 2.2 0 0 1 6.2 3H19v15.5H6.2A2.2 2.2 0 0 0 4 20.7z"/><path d="M4 20.7A2.2 2.2 0 0 1 6.2 18.5H19"/></svg>',
    shield: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5.6c0 4.2-2.9 7.9-7 9.4-4.1-1.5-7-5.2-7-9.4V6z"/><path d="M9.2 12.1l2 2 3.6-3.8"/></svg>',
    search: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="6.5"/><path d="M16 16l4.5 4.5"/><path d="M8.5 11h5"/></svg>',
    alert: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.6l9 15.6H3z"/><path d="M12 9.6v4.2M12 16.6h.01"/></svg>',
    download: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3.5v11"/><path d="M7.5 10.5L12 15l4.5-4.5"/><path d="M4.5 20.5h15"/></svg>',
    check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="8.6"/><path d="M8.4 12.2l2.5 2.5 4.7-5"/></svg>',
    home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10.4L12 4l8 6.4V20H4z"/><path d="M9.6 20v-5.4h4.8V20"/></svg>',
    cart: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><circle cx="9.6" cy="19" r="1.5"/><circle cx="17" cy="19" r="1.5"/><path d="M3 4h2.3l2.2 10.3h10.3L20.5 7H6.1"/></svg>',
    box: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round"><path d="M3.6 8.4L12 5l8.4 3.4v7.2L12 19l-8.4-3.4z"/><path d="M3.6 8.4L12 11.8l8.4-3.4M12 11.8V19"/></svg>'
  };

  function request(path, options) {
    var opts = options || {};
    var headers = { 'Content-Type': 'application/json' };
    if (state.token) headers['X-Auth-Token'] = state.token;
    return fetch(path, {
      method: opts.method || 'GET',
      headers: headers,
      body: opts.body ? JSON.stringify(opts.body) : undefined
    }).then(function (res) {
      if (res.status === 401 && !opts.allow401) {
        logout(true);
        throw new Error('登录已失效，请重新登录');
      }
      return res.text().then(function (text) {
        var data = null;
        try { data = text ? JSON.parse(text) : null; } catch (e) { data = null; }
        if (!res.ok) {
          var err = new Error((data && data.error) || ('请求失败 ' + res.status));
          // 调用方需要按状态码分流时用（如引导登录把 404 解释成「服务端未开启」）
          err.status = res.status;
          throw err;
        }
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
    var bootBtn = $('bootstrapBtn');
    if (bootBtn) bootBtn.disabled = false;
    if (!silent) setLoginMsg('已退出', 'ok');
  }

  /**
   * 引导登录：短信网关未接入（验证码发不出去）时进后台的唯一入口。
   * 令牌与登录目标都在服务端（ADMIN_BOOTSTRAP_TOKEN / ADMIN_BOOTSTRAP_PHONE），
   * 前端只负责把令牌提交上去，页面里不含任何账号信息。
   */
  function bootstrapLogin() {
    var input = $('bootstrapToken');
    var msgEl = $('bootstrapMsg');
    var token = (input.value || '').trim();
    var setMsg = function (text, kind) { msgEl.textContent = text || ''; msgEl.className = 'msg' + (kind ? ' ' + kind : ''); };
    if (!token) { setMsg('请输入引导令牌', 'error'); return; }
    var btn = $('bootstrapBtn');
    btn.disabled = true;
    setMsg('');
    // allow401：令牌错误时不该触发「登录已失效」的全局登出逻辑
    request('/api/admin/auth/bootstrap', { method: 'POST', body: { token: token }, allow401: true })
      .then(function (res) {
        input.value = '';
        setMsg('');
        state.token = res.token;
        state.nickname = res.nickname || '管理员';
        try { sessionStorage.setItem(TOKEN_KEY, res.token); } catch (e) {}
        showApp();
        toast('引导登录成功。请尽快从服务端移除 ADMIN_BOOTSTRAP_TOKEN 并重启应用', 6000, 'error');
      })
      .catch(function (err) {
        // 404 = 服务端没配令牌（端点视同不存在），翻译成可执行的提示，而不是「请求失败 404」
        setMsg(err.status === 404
          ? '服务端未开启引导登录：请设置环境变量 ADMIN_BOOTSTRAP_TOKEN 与 ADMIN_BOOTSTRAP_PHONE 后重启'
          : err.message, 'error');
        btn.disabled = false;
      });
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
      group: '家庭数据',
      items: [
        { key: 'families', label: '家庭与成员', icon: 'home', perm: 'USER_VIEW', desc: '家庭、成员、菜单与库存总览（只读）' },
        { key: 'menus', label: '今日菜单', icon: 'book', perm: 'USER_VIEW', desc: '各家庭每天点了什么菜（只读）' },
        { key: 'shopping', label: '购物清单', icon: 'cart', perm: 'USER_VIEW', desc: '各家庭买菜进度（只读）' },
        { key: 'pantry', label: '家庭库存', icon: 'box', perm: 'USER_VIEW', desc: '各家庭现有食材（只读）' }
      ]
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

  // ==================== 顶栏：账号菜单 / 快速跳转 ====================

  function renderAccountMenu() {
    $('accountMenu').innerHTML =
      '<div class="am-head"><div class="am-name">' + escapeHtml(state.nickname || '管理员') + '</div>' +
      '<div class="am-role">' + escapeHtml(state.roleName) + ' · ' + state.permissions.length + ' 项权限</div></div>' +
      '<button class="am-item" type="button" data-account="refresh" role="menuitem">' +
      icon('grid').replace('viewBox', 'viewBox') + '刷新当前页</button>' +
      '<button class="am-item danger" type="button" data-account="logout" role="menuitem">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M15 17l5-5-5-5"/><path d="M20 12H9"/><path d="M12 4H6.5A1.5 1.5 0 0 0 5 5.5v13A1.5 1.5 0 0 0 6.5 20H12"/></svg>' +
      '退出登录</button>';
  }

  function toggleAccountMenu(show) {
    var menu = $('accountMenu');
    var btn = $('accountBtn');
    var open = show === undefined ? menu.hidden : show;
    if (open) renderAccountMenu();
    menu.hidden = !open;
    btn.setAttribute('aria-expanded', String(open));
  }

  /** 快速跳转候选项：当前角色有权限的页面 */
  function jumpTargets(keyword) {
    var kw = (keyword || '').trim().toLowerCase();
    var out = [];
    NAV.forEach(function (group) {
      group.items.forEach(function (item) {
        if (!can(item.perm)) return;
        var hay = (item.label + ' ' + group.group + ' ' + (item.desc || '')).toLowerCase();
        if (kw && hay.indexOf(kw) < 0) return;
        out.push({ key: item.key, label: item.label, icon: item.icon, group: group.group });
      });
    });
    return out;
  }

  function renderQuickMenu(keyword, hiIndex) {
    var list = jumpTargets(keyword);
    var menu = $('quickMenu');
    if (!list.length) {
      menu.innerHTML = '<div class="qm-empty">没有匹配的页面</div>';
    } else {
      menu.innerHTML = '<div class="qm-hint"><span>↑↓ 选择 · Enter 跳转</span><span>Esc 关闭</span></div>' +
        list.map(function (t, i) {
          return '<div class="qm-item' + (i === hiIndex ? ' hi' : '') + '" data-jump="' + t.key + '" role="option">' +
            icon(t.icon) + '<span>' + escapeHtml(t.label) + '</span>' +
            '<span class="qm-group">' + escapeHtml(t.group) + '</span></div>';
        }).join('');
    }
    menu.hidden = false;
    $('quickJump').setAttribute('aria-expanded', 'true');
    return list;
  }

  function closeQuickMenu() {
    var menu = $('quickMenu');
    if (!menu || menu.hidden) return;
    menu.hidden = true;
    var input = $('quickJump');
    if (input) input.setAttribute('aria-expanded', 'false');
    state.jumpIndex = 0;
  }

  /** 面包屑：运营后台 / 分组 / 当前页 */
  function renderCrumb() {
    var item = navItem(state.tab);
    var group = '';
    for (var i = 0; i < NAV.length; i++) {
      if (NAV[i].items.indexOf(item) >= 0) { group = NAV[i].group; break; }
    }
    var sep = '<span class="crumb-sep">/</span>';
    $('crumb').innerHTML = '<span>运营后台</span>' + sep +
      (group ? '<span>' + escapeHtml(group) + '</span>' + sep : '') +
      '<span aria-current="page">' + escapeHtml(item.label) + '</span>';
  }

  function setPageHeader(meta) {
    var item = navItem(state.tab);
    $('pageTitle').textContent = item.label;
    $('pageMeta').textContent = meta || '';
    renderCrumb();
  }

  function loadTab() {
    var item = navItem(state.tab);
    $('pageTitle').textContent = item.label;
    $('pageMeta').textContent = '';
    renderCrumb();
    var loaders = {
      dashboard: loadDashboard, reports: loadReports, posts: loadPosts,
      comments: loadComments, recipes: loadRecipes, feedback: loadFeedback,
      imports: loadImports, users: loadUsers, orders: loadOrders, audit: loadAudit,
      families: loadFamilies, menus: loadMenus, shopping: loadShopping, pantry: loadPantry
    };
    return (loaders[state.tab] || loadDashboard)();
  }

  /** 刷新按钮：图标按钮，刷新时旋转并禁止重复点击 */
  function refreshCurrent() {
    var btn = $('refreshBtn');
    if (btn.disabled) return;
    btn.disabled = true;
    btn.classList.add('spinning');
    var done = function () { btn.disabled = false; btn.classList.remove('spinning'); };
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
    closeQuickMenu();
    renderNav();
    loadTab();
  }

  function closeNav() { $('appView').classList.remove('nav-open'); }

  /** 加载态：骨架行，比一行「加载中…」更像正式系统 */
  function loadingCard() {
    $('panelRoot').innerHTML = '<div class="card"><div class="skeleton">' +
      [92, 78, 85, 70, 88, 64, 80].map(function (w) {
        return '<div class="sk-row"><div class="sk-bar" style="width:' + w + '%"></div>' +
          '<div class="sk-bar" style="width:' + Math.round(w / 4) + '%"></div></div>';
      }).join('') + '</div></div>';
  }

  function errorCard(err) {
    $('panelRoot').innerHTML = '<div class="card">' + emptyState({
      icon: 'alert',
      title: '加载失败',
      desc: (err && err.message) || '请求没有成功，请检查网络或后端服务后重试。',
      actions: '<button class="btn small" data-retry="1">重新加载</button>'
    }) + '</div>';
  }

  /**
   * 空状态：图标 + 标题 + 说明 +（可选）操作
   * 列表页用它替代原来一行灰字，空数据时页面才不像没做完。
   */
  function emptyState(opts) {
    var o = opts || {};
    return '<div class="empty-state">' +
      '<div class="empty-ico" aria-hidden="true">' + EMPTY_ICONS[o.icon || 'inbox'] + '</div>' +
      '<h3>' + escapeHtml(o.title || '暂无数据') + '</h3>' +
      (o.desc ? '<p>' + escapeHtml(o.desc) + '</p>' : '') +
      (o.actions ? '<div class="empty-actions">' + o.actions + '</div>' : '') +
      '</div>';
  }

  /** 表格里的空状态（放进 td，带 colspan） */
  function tableEmpty(colspan, opts) {
    return '<tr class="empty-row"><td colspan="' + colspan + '">' + emptyState(opts) + '</td></tr>';
  }

  /**
   * 页头：标题 + 说明 + 右侧操作；筛选类控件放第二行（toolbar）
   * 这样"这是什么页面"和"能做什么操作"层次分明，不会挤成一坨。
   */
  function pageHead(title, desc, actionsHtml) {
    return '<div class="page-head"><div><h2>' + escapeHtml(title) + '</h2>' +
      (desc ? '<p class="page-desc">' + escapeHtml(desc) + '</p>' : '') + '</div>' +
      (actionsHtml ? '<div class="page-actions">' + actionsHtml + '</div>' : '') + '</div>';
  }

  /** 工具行：筛选 chips / 搜索框 / 日期区间 / 导出按钮 */
  function toolbar(html) {
    return html ? '<div class="toolbar">' + html + '</div>' : '';
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
    else if (kind === 'families') { state.families.page = jump(state.families.page); loadFamilies(); }
    else if (kind === 'menus') { state.menus.page = jump(state.menus.page); loadMenus(); }
    else if (kind === 'shopping') { state.shopping.page = jump(state.shopping.page); loadShopping(); }
    else if (kind === 'pantry') { state.pantry.page = jump(state.pantry.page); loadPantry(); }
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

    // 每张 KPI 都能点进对应列表（filter 为空即该列表的全部），
    // 否则看板上"用户总数 128"是个死数字，运营想知道是谁还得自己去搜。
    function kpi(label, value, sparkKey, deltaKey, money, goto, gotoFilter) {
      var spark = sparkKey ? sparkline(series.map(function (p) { return Number(p[sparkKey] || 0); }), '#2f4a3a') : '';
      var jump = goto
        ? ' data-goto="' + goto + '" data-gotofilter="' + (gotoFilter || '') + '"' +
          ' role="button" tabindex="0" title="点击查看明细"'
        : '';
      return '<div class="kpi' + (goto ? ' link' : '') + '"' + jump + '>' +
        '<div class="kpi-top"><span class="kpi-label">' + escapeHtml(label) + '</span>' +
        (goto ? '<span class="kpi-go">明细 ›</span>' : '') + '</div>' +
        '<div class="kpi-num">' + escapeHtml(value) + '</div>' +
        '<div class="kpi-foot">' + (deltaKey ? delta(deltaKey, money) : '<span></span>') + spark + '</div></div>';
    }

    var kpis = '<div class="kpi-grid">' +
      kpi('用户总数', fmtNum(d.userCount), 'newUsers', 'newUsers', false, 'users') +
      kpi('家庭总数', fmtNum(d.familyCount), '', '', false, 'families') +
      kpi('已发布帖子', fmtNum(d.postCount), 'newPosts', 'newPosts', false, 'posts', 'APPROVED') +
      kpi('已支付订单', fmtNum(d.paidOrderCount), 'paidOrders', 'paidOrders', false, 'orders', 'PAID') +
      kpi('累计收入', fmtMoney(d.paidRevenueFen), 'revenueFen', 'revenueFen', true, 'orders', 'PAID') +
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
          '<span class="pill ' + (a.result === 'OK' ? 'ok' : 'bad') + '">' + escapeHtml(AUDIT_ACTION[a.action] || a.action) + '</span>' +
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
    return request('/api/admin/reports?status=' + encodeURIComponent(state.reportFilter || ''))
      .then(function (list) { state.reports = Array.isArray(list) ? list : []; renderReports(); })
      .catch(errorCard);
  }

  function renderReports() {
    var rows = state.reports;
    var head = pageHead('举报审核', '用户举报的帖子在这里处置：下架或忽略',
      '<button class="btn small" id="exportReports">导出 Excel</button>') +
      toolbar(chips([['PENDING', '待处理'], ['REMOVED', '已下架'], ['IGNORED', '已忽略'], ['', '全部']], state.reportFilter, 'rptfilter'));
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
    }).join('') : tableEmpty(9, { icon: 'flag', title: '暂无举报', desc: '用户在小程序里举报帖子后会进入这里。当前筛选条件下没有记录。' });
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
      return request('/api/admin/reports/' + encodeURIComponent(reportId) + '/review', {
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
      '<button class="btn small" id="exportPosts">导出 Excel</button>') +
      toolbar(chips([['PENDING', '待审核'], ['', '全部'], ['APPROVED', '已发布'], ['REMOVED', '已下架']], state.postFilter, 'postfilter'));
    var body = rows.length ? rows.map(function (p) {
      var removed = p.auditStatus === 'REMOVED';
      var pending = p.auditStatus === 'PENDING';
      var pill = removed ? '<span class="pill bad">已下架</span>'
        : (pending ? '<span class="pill pending">待审核</span>' : '<span class="pill ok">已发布</span>');
      var actions = '';
      if (pending) {
        actions = '<button class="btn small" data-postdetail="' + escapeHtml(String(p.id)) + '">详情</button>' +
          '<button class="btn small primary-sm" data-poststatus="' + escapeHtml(String(p.id)) +
            '" data-on="APPROVED">通过</button>' +
          '<button class="btn small danger" data-poststatus="' + escapeHtml(String(p.id)) +
            '" data-on="REMOVED">下架</button>';
      } else if (removed) {
        actions = '<button class="btn small" data-postdetail="' + escapeHtml(String(p.id)) + '">详情</button>' +
          '<button class="btn small" data-poststatus="' + escapeHtml(String(p.id)) +
          '" data-on="APPROVED">恢复</button>';
      } else {
        actions = '<button class="btn small" data-postdetail="' + escapeHtml(String(p.id)) + '">详情</button>' +
          '<button class="btn small danger" data-poststatus="' + escapeHtml(String(p.id)) +
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
    }).join('') : tableEmpty(9, { icon: 'file', title: '暂无帖子', desc: '用户发布的帖子会先进入待审核队列，在这里通过或下架。当前筛选条件下没有记录。' });
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
      '') +
      toolbar(chips([['PENDING', '待审核'], ['APPROVED', '已通过'], ['REMOVED', '已驳回'], ['', '全部']], state.commentFilter, 'cmtfilter') +
        '<input id="commentPostFilter" type="search" placeholder="按帖子 ID 过滤" value="' + escapeHtml(state.commentPostId) + '" class="text-input" style="width:130px" />' +
        '<button class="btn small" id="commentFilterBtn">过滤</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" id="exportComments">导出 Excel</button>');
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
    }).join('') : tableEmpty(8, { icon: 'comment', title: '暂无评论', desc: '机审无法判定的评论会进入待审核队列，作者本人可见、其他人看不到。' });
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
      '') +
      toolbar(chips([['ACTIVE', '在线'], ['REMOVED', '已下架'], ['', '全部']], state.recipeFilter, 'recipefilter') +
        '<input id="recipeSearch" type="search" placeholder="按标题搜索" value="' + escapeHtml(state.recipeKeyword) + '" class="text-input" style="width:180px" />' +
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
        '<button class="btn small" data-recipedetail="' + escapeHtml(String(r.recipeId)) + '">查看详情</button>' +
        (removed
          ? '<button class="btn small" data-recipestatus="' + escapeHtml(String(r.recipeId)) + '" data-on="ACTIVE">恢复</button>'
          : '<button class="btn small danger" data-recipestatus="' + escapeHtml(String(r.recipeId)) + '" data-on="REMOVED">下架</button>') +
        '</td></tr>';
    }).join('') : tableEmpty(8, { icon: 'book', title: '暂无菜谱', desc: '公共菜谱库为空，或当前搜索词没有匹配到菜谱。' });
    setPageHeader(rows.length + ' 条');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>标题</th><th>作者</th><th>菜系</th><th class="num">耗时</th>' +
      '<th>状态</th><th>创建时间</th><th>操作</th></tr></thead><tbody>' + body + '</tbody></table></div>';
  }

  /** 菜谱详情弹窗：运营下架前核对完整食材与步骤（之前只能看到列表摘要） */
  function showRecipeDetail(recipeId) {
    infoDialog({
      title: '菜谱详情 #' + recipeId,
      desc: '加载中…',
      body: '<div class="muted">正在读取菜谱内容…</div>'
    });
    request('/api/admin/recipes/' + encodeURIComponent(recipeId))
      .then(function (r) {
        var meta = [
          r.cuisine ? escapeHtml(r.cuisine) : null,
          r.timeCost != null ? r.timeCost + ' 分钟' : null,
          r.servings != null ? r.servings + ' 人份' : null,
          r.difficulty ? escapeHtml(difficultyLabel(r.difficulty)) : null
        ].filter(Boolean).join(' · ');
        var ings = (r.ingredients || []).map(function (i) {
          return '<li><span>' + escapeHtml(i.name || '') + '</span><em>' +
            escapeHtml(((i.amount || '') + (i.unit || '')) || '适量') + '</em></li>';
        }).join('') || '<li class="muted">未填写食材</li>';
        var steps = (r.steps || []).map(function (s, i) {
          var step = typeof s === 'string' ? { text: s } : (s || {});
          var img = step.image
            ? '<img class="rd-step-img" src="' + escapeHtml(step.image) + '" alt="">'
            : '';
          return '<li><b>' + (i + 1) + '</b><span>' + escapeHtml(step.text || '') + img + '</span></li>';
        }).join('') || '<li class="muted">未填写步骤</li>';
        var tags = (r.tasteTags || []).map(function (t) {
          return '<span class="pill">' + escapeHtml(t) + '</span>';
        }).join(' ');
        var imgs = (r.images || []).map(function (u) {
          return '<img class="pd-img" src="' + escapeHtml(u) + '" alt="">';
        }).join('');
        var body =
          '<div class="rd-meta">' + meta + '</div>' +
          (tags ? '<div class="rd-tags">' + tags + '</div>' : '') +
          (imgs ? '<div class="rd-sec"><h4>配图</h4><div class="pd-imgs">' + imgs + '</div></div>' : '') +
          '<div class="rd-sec"><h4>食材</h4><ul class="rd-ings">' + ings + '</ul></div>' +
          '<div class="rd-sec"><h4>步骤</h4><ol class="rd-steps">' + steps + '</ol></div>' +
          (r.summary ? '<div class="rd-sec"><h4>简介</h4><p class="rd-sum">' + escapeHtml(r.summary) + '</p></div>' : '');
        infoDialog({
          title: '菜谱详情 · ' + (r.title || ('#' + recipeId)),
          desc: (r.ownerNickname ? '作者 ' + r.ownerNickname + ' · ' : '') +
            (r.status === 'REMOVED' ? '已下架' : '在线') + ' · ' + fmtTime(r.createdAt),
          body: body
        });
      })
      .catch(function (err) {
        infoDialog({ title: '菜谱详情', desc: '加载失败', body: '<div class="muted">' + escapeHtml(err.message) + '</div>' });
      });
  }

  /** 帖子详情弹窗：审核/下架前核对完整正文与标签（之前只能看到列表标题） */
  function showPostDetail(postId) {
    infoDialog({
      title: '帖子详情 #' + postId,
      desc: '加载中…',
      body: '<div class="muted">正在读取帖子内容…</div>'
    });
    request('/api/admin/posts/' + encodeURIComponent(postId))
      .then(function (p) {
        var statusLabel = p.auditStatus === 'REMOVED' ? '已下架'
          : (p.auditStatus === 'PENDING' ? '待审核' : '已发布');
        var tags = (p.tags || []).map(function (t) {
          return '<span class="pill">' + escapeHtml(t) + '</span>';
        }).join(' ');
        var paras = String(p.content || '').split(/\n+/).map(function (s) {
          return s.trim() ? '<p style="margin:0 0 8px">' + escapeHtml(s.trim()) + '</p>' : '';
        }).join('') || '<div class="muted">无正文</div>';
        var body =
          (tags ? '<div class="rd-tags">' + tags + '</div>' : '') +
          '<div class="rd-sec"><h4>正文</h4>' + paras + '</div>' +
          '<div class="rd-meta">赞 ' + fmtNum(p.likeCount) + ' · 评 ' + fmtNum(p.commentCount) +
          (p.recipeId ? ' · 关联菜谱 #' + escapeHtml(String(p.recipeId)) : '') +
          ' · ' + escapeHtml(statusLabel) + '</div>';
        infoDialog({
          title: '帖子详情 · ' + (p.title || ('#' + postId)),
          desc: (p.author ? '作者 ' + p.author + ' · ' : '') + statusLabel + ' · ' + fmtTime(p.createdAt),
          body: body
        });
      })
      .catch(function (err) {
        infoDialog({ title: '帖子详情', desc: '加载失败', body: '<div class="muted">' + escapeHtml(err.message) + '</div>' });
      });
  }

  function difficultyLabel(key) {
    return ({ easy: '简单', medium: '中等', hard: '困难' })[key] || key || '—';
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
  // 反馈类型枚举 → 中文（后端存的是原始枚举值，直接展示会露出英文）
  var FB_TYPE = { bug: 'Bug 反馈', feature: '功能建议', complaint: '投诉', other: '其它' };

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
      '<button class="btn small" id="exportFeedback">导出 Excel</button>') +
      toolbar(chips([['OPEN', '待处理'], ['PROCESSING', '处理中'], ['CLOSED', '已关闭'], ['', '全部']], state.feedbackFilter, 'fbfilter'));
    var body = rows.length ? rows.map(function (f) {
      var pill = f.status === 'CLOSED' ? 'ok' : (f.status === 'PROCESSING' ? 'pending' : 'bad');
      return '<tr><td class="num">' + escapeHtml(String(f.id)) + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(f.nickname) + '<span class="name">' +
          escapeHtml(f.nickname || ('用户' + f.userId)) + '</span></div></td>' +
        '<td>' + escapeHtml((f.types || []).map(function (t) { return FB_TYPE[t] || t; }).join('、') || '—') + '</td>' +
        '<td class="clamp" title="' + escapeHtml(f.content || '') + '">' + escapeHtml(f.content || '') + '</td>' +
        '<td>' + escapeHtml(f.contact || '—') + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(FB_STATUS[f.status] || f.status) + '</span></td>' +
        '<td>' + fmtTime(f.createdAt) + '</td><td class="actions">' +
        (f.status === 'OPEN' ? '<button class="btn small" data-fb="' + escapeHtml(String(f.id)) + '" data-on="PROCESSING">受理</button>' : '') +
        (f.status !== 'CLOSED' ? '<button class="btn small primary-sm" data-fb="' + escapeHtml(String(f.id)) + '" data-on="CLOSED">关闭</button>' : '') +
        '</td></tr>';
    }).join('') : tableEmpty(8, { icon: 'inbox', title: '暂无反馈工单', desc: '用户在小程序「我的 → 意见反馈」提交后会出现在这里。' });
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
      '') +
      toolbar(chips([['PENDING', '待审核'], ['APPROVED', '已通过'], ['REJECTED', '已驳回'], ['', '全部']], state.importFilter, 'importfilter'));
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
    }).join('') : tableEmpty(7, { icon: 'download', title: '暂无导入记录', desc: '用户在小程序「导入菜谱」粘贴链接或上传图片，解析结果会先到这里等待审核，通过后才入库。' });
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

  // ==================== 家庭数据：家庭与成员 / 今日菜单 / 购物清单 / 库存 ====================
  // 这四页对应小程序里的家庭侧数据，此前后台完全看不到：用户来问"我家菜单怎么没了"
  // 只能靠猜。全部**只读** —— 运营要干预就引导用户在小程序里操作，
  // 后台不提供改写用户菜单/清单/库存的入口（那属于替用户改数据，风险远大于便利）。

  /** 本地时区的今天（yyyy-MM-dd），用 toISOString 会因 UTC 偏移差一天 */
  function todayIso() {
    var d = new Date();
    var m = d.getMonth() + 1;
    var day = d.getDate();
    return d.getFullYear() + '-' + (m < 10 ? '0' + m : m) + '-' + (day < 10 ? '0' + day : day);
  }

  /** 单日筛选控件：应用 / 今天 / 清除 */
  function dayFilterHtml(kind, value) {
    return '<span class="date-range">' +
      '<input type="date" id="' + kind + 'Day" value="' + escapeHtml(value || '') + '" aria-label="按日期筛选" />' +
      '<button class="btn small" id="' + kind + 'DayBtn">应用</button>' +
      '<button class="btn small" id="' + kind + 'DayToday">今天</button>' +
      (value ? '<button class="btn small" id="' + kind + 'DayClear">清除</button>' : '') +
      '</span>';
  }

  function searchBoxHtml(id, placeholder, value, btnId) {
    return '<input id="' + id + '" type="search" placeholder="' + escapeHtml(placeholder) + '" value="' +
      escapeHtml(value || '') + '" class="text-input" style="width:240px" />' +
      '<button class="btn small" id="' + btnId + '">搜索</button>';
  }

  // ---- 家庭与成员 ----

  function loadFamilies() {
    loadingCard();
    return request('/api/admin/families?keyword=' + encodeURIComponent(state.familyKeyword || '') +
      '&page=' + state.families.page + '&size=' + state.families.size)
      .then(function (page) {
        state.families = page || { items: [], total: 0, page: 0, size: 20 };
        renderFamilies();
      })
      .catch(errorCard);
  }

  function renderFamilies() {
    var p = state.families;
    var rows = p.items || [];
    var head = pageHead('家庭与成员', '每个家庭有多少人、多少菜谱与菜单；点「查看」看成员、菜单与库存',
      '<button class="btn small" id="exportFamilies">导出 Excel</button>') +
      toolbar(searchBoxHtml('familySearch', '搜家庭名 / 创建者昵称', state.familyKeyword, 'familySearchBtn'));
    var body = rows.length ? rows.map(function (f) {
      return '<tr><td class="num">' + escapeHtml(String(f.familyId)) + '</td>' +
        '<td><div class="name">' + escapeHtml(f.name || '—') + '</div></td>' +
        '<td><div class="cell-user">' + avatarHtml(f.ownerNickname) +
          '<div><div class="name">' + escapeHtml(f.ownerNickname || '—') + '</div>' +
          '<div class="sub">#' + escapeHtml(String(f.ownerUserId == null ? '' : f.ownerUserId)) + '</div></div></div></td>' +
        '<td class="num">' + fmtNum(f.memberCount) + '</td>' +
        '<td class="num">' + fmtNum(f.recipeCount) + '</td>' +
        '<td class="num">' + fmtNum(f.menuCount) + '</td>' +
        '<td title="' + escapeHtml(f.createdAt || '') + '">' + fmtTime(f.createdAt) + '</td>' +
        '<td class="actions"><button class="btn small" data-famdetail="' + escapeHtml(String(f.familyId)) +
          '">查看</button></td></tr>';
    }).join('') : tableEmpty(8, {
      icon: 'home',
      title: '没有匹配的家庭',
      desc: '用户在小程序里创建或加入家庭后会出现在这里；也可以换个关键词再试。'
    });
    setPageHeader('共 ' + fmtNum(p.total) + ' 个家庭');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>家庭</th><th>创建者</th><th class="num">成员</th>' +
      '<th class="num">菜谱</th><th class="num">菜单</th><th>创建时间</th><th>操作</th></tr></thead><tbody>' + body +
      '</tbody></table>' + pagerHtml('families', p.page, p.size, p.total) + '</div>';
  }

  var MEMBER_ROLE = { owner: '创建者', admin: '管理员', member: '成员' };
  var MEMBER_STATUS = { ACTIVE: '在家庭中', REMOVED: '已退出' };
  var LIST_STATUS = { OPEN: '进行中', CLOSED: '已结束' };

  /** 家庭详情弹窗：成员 + 最近菜单 + 购物清单 + 库存（只读，一次看全） */
  function showFamilyDetail(familyId) {
    infoDialog({
      title: '家庭详情 #' + familyId,
      desc: '加载中…',
      body: '<div class="muted">正在读取家庭数据…</div>'
    });
    request('/api/admin/families/' + encodeURIComponent(familyId))
      .then(function (d) {
        var f = d.family || {};
        var groups = f.memberCount || 0;
        var members = (d.members || []).map(function (m) {
          return '<div class="row-item">' + avatarHtml(m.nickname) +
            '<div class="grow"><div class="title">' + escapeHtml(m.nickname || ('用户 #' + m.userId)) + '</div>' +
            '<div class="sub">' + escapeHtml(m.phone || '未绑定手机号') + ' · #' + escapeHtml(String(m.userId)) + '</div></div>' +
            '<div class="side">' + escapeHtml(MEMBER_ROLE[m.role] || m.role || '成员') + ' · ' +
            escapeHtml(MEMBER_STATUS[m.status] || m.status || '') + '<br>' + fmtTime(m.joinedAt) + '</div></div>';
        }).join('') || '<div class="empty">没有成员记录</div>';

        var menus = (d.recentMenus || []).map(function (m) {
          return '<div class="row-item">' +
            '<div class="grow"><div class="title">' + escapeHtml(m.dishes || '（空菜单）') + '</div>' +
            '<div class="sub">' + escapeHtml(String(m.menuDate || '')) + ' · ' + fmtNum(m.itemCount) + ' 道菜</div></div>' +
            '<div class="side">' + escapeHtml(m.status || '') + '<br>' + fmtTime(m.updatedAt) + '</div></div>';
        }).join('') || '<div class="empty">还没有菜单</div>';

        var shopping = (d.shoppingLists || []).map(function (s) {
          return '<div class="row-item">' +
            '<div class="grow"><div class="title">' + escapeHtml(String(s.menuDate || '未关联菜单')) + ' 的清单</div>' +
            '<div class="sub">已购 ' + fmtNum(s.purchasedCount) + ' / ' + fmtNum(s.totalCount) + ' 项</div></div>' +
            '<div class="side">' + escapeHtml(LIST_STATUS[s.status] || s.status || '') + '<br>' + fmtTime(s.createdAt) + '</div></div>';
        }).join('') || '<div class="empty">还没有购物清单</div>';

        var pantry = (d.pantry || []).map(function (i) {
          var exp = pantryExpiry(i.expiresAt);
          return '<div class="row-item">' +
            '<span class="pill' + exp.cls + '">' + escapeHtml(exp.text) + '</span>' +
            '<div class="grow"><div class="title">' + escapeHtml(i.ingredientName || '') + '</div>' +
            '<div class="sub">' + escapeHtml(((i.amount || '') + (i.unit || '')) || '适量') + '</div></div>' +
            '<div class="side">' + fmtDate(i.addedAt) + '</div></div>';
        }).join('') || '<div class="empty">库存是空的</div>';

        infoDialog({
          title: '家庭 · ' + (f.name || ('#' + familyId)),
          desc: '创建者 ' + (f.ownerNickname || '—') + ' · 创建于 ' + fmtTime(f.createdAt) +
            ' · ' + fmtNum(f.memberCount) + ' 位成员 · ' + fmtNum(f.recipeCount) + ' 条家庭菜谱 · ' +
            fmtNum(f.menuCount) + ' 张菜单',
          body:
            '<div class="rd-sec"><h4>成员（' + fmtNum(groups) + '）</h4><div class="row-list">' + members + '</div></div>' +
            '<div class="rd-sec"><h4>最近菜单</h4><div class="row-list">' + menus + '</div></div>' +
            '<div class="rd-sec"><h4>购物清单</h4><div class="row-list">' + shopping + '</div></div>' +
            '<div class="rd-sec"><h4>库存</h4><div class="row-list">' + pantry + '</div></div>' +
            '<p class="muted" style="margin-top:16px">本页只读：需要改动请让用户在小程序里操作。</p>'
        });
      })
      .catch(function (err) {
        infoDialog({ title: '家庭详情', desc: '加载失败', body: '<div class="muted">' + escapeHtml(err.message) + '</div>' });
      });
  }

  /** 库存过期状态：已过期 / 3 天内到期 / 正常 / 未记录保质期 */
  function pantryExpiry(expiresAt) {
    if (!expiresAt) return { text: '无保质期', cls: '' };
    var days = daysUntil(expiresAt);
    if (days == null) return { text: '无保质期', cls: '' };
    if (days < 0) return { text: '已过期 ' + (-days) + ' 天', cls: ' bad' };
    if (days <= 3) return { text: days + ' 天内到期', cls: ' pending' };
    return { text: '剩 ' + days + ' 天', cls: ' ok' };
  }

  /** 距离某日还有几天（本地日期差，避免时区把结果挪一天） */
  function daysUntil(dateStr) {
    var m = String(dateStr || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (!m) return null;
    var target = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    var now = new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    return Math.round((target - today) / 86400000);
  }

  // ---- 今日菜单 ----

  function loadMenus() {
    loadingCard();
    return request('/api/admin/menus?date=' + encodeURIComponent(state.menuDate || '') +
      '&keyword=' + encodeURIComponent(state.menuKeyword || '') +
      '&page=' + state.menus.page + '&size=' + state.menus.size)
      .then(function (page) {
        state.menus = page || { items: [], total: 0, page: 0, size: 50 };
        renderMenus();
      })
      .catch(errorCard);
  }

  function renderMenus() {
    var p = state.menus;
    var rows = p.items || [];
    var head = pageHead('今日菜单', '各家庭每天点了哪些菜。默认按日期倒序，可用日期筛选某一天',
      '<button class="btn small" id="exportMenus">导出 Excel</button>') +
      toolbar(dayFilterHtml('menu', state.menuDate) +
        searchBoxHtml('menuSearch', '搜家庭名', state.menuKeyword, 'menuSearchBtn'));
    var body = rows.length ? rows.map(function (m) {
      return '<tr><td class="num">' + escapeHtml(String(m.menuId)) + '</td>' +
        '<td><button class="btn small" data-famdetail="' + escapeHtml(String(m.familyId)) + '">' +
          escapeHtml(m.familyName || ('家庭 #' + m.familyId)) + '</button></td>' +
        '<td class="num">' + escapeHtml(String(m.menuDate || '')) + '</td>' +
        '<td><span class="pill ' + (m.status === 'READY' ? 'ok' : '') + '">' + escapeHtml(m.status || '') + '</span></td>' +
        '<td class="num">' + fmtNum(m.itemCount) + '</td>' +
        '<td class="clamp" title="' + escapeHtml(m.dishes || '') + '">' + escapeHtml(m.dishes || '—') + '</td>' +
        '<td title="' + escapeHtml(m.updatedAt || '') + '">' + fmtTime(m.updatedAt) + '</td></tr>';
    }).join('') : tableEmpty(7, {
      icon: 'book',
      title: '这几天没有菜单',
      desc: '家庭在小程序「今天吃什么」里加菜后会出现在这里。可以清除日期筛选看全部，或换个家庭名再搜。'
    });
    setPageHeader('共 ' + fmtNum(p.total) + ' 张菜单');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>家庭</th><th class="num">日期</th><th>状态</th>' +
      '<th class="num">菜品数</th><th>菜品</th><th>更新时间</th></tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('menus', p.page, p.size, p.total) + '</div>';
  }

  // ---- 购物清单 ----

  function loadShopping() {
    loadingCard();
    return request('/api/admin/shopping?date=' + encodeURIComponent(state.shoppingDate || '') +
      '&status=' + encodeURIComponent(state.shoppingFilter || '') +
      '&page=' + state.shopping.page + '&size=' + state.shopping.size)
      .then(function (page) {
        state.shopping = page || { items: [], total: 0, page: 0, size: 50 };
        renderShopping();
      })
      .catch(errorCard);
  }

  function renderShopping() {
    var p = state.shopping;
    var rows = p.items || [];
    var head = pageHead('购物清单', '清单由当天菜单的食材自动汇总，家庭在买菜时逐项勾选',
      '<button class="btn small" id="exportShopping">导出 Excel</button>') +
      toolbar(dayFilterHtml('shop', state.shoppingDate) +
        chips([['', '全部'], ['OPEN', '进行中'], ['CLOSED', '已结束']], state.shoppingFilter, 'shopfilter'));
    var body = rows.length ? rows.map(function (s) {
      var total = Number(s.totalCount || 0);
      var bought = Number(s.purchasedCount || 0);
      var done = total > 0 && bought >= total;
      return '<tr><td class="num">' + escapeHtml(String(s.listId)) + '</td>' +
        '<td><button class="btn small" data-famdetail="' + escapeHtml(String(s.familyId)) + '">' +
          escapeHtml(s.familyName || ('家庭 #' + s.familyId)) + '</button></td>' +
        '<td class="num">' + escapeHtml(String(s.menuDate || '—')) + '</td>' +
        '<td><span class="pill ' + (done ? 'ok' : 'pending') + '">' + (done ? '已买齐' : '待购买') + '</span></td>' +
        '<td class="num">' + fmtNum(bought) + ' / ' + fmtNum(total) + '</td>' +
        '<td><span class="pill ' + (s.status === 'OPEN' ? 'info' : '') + '">' +
          escapeHtml(LIST_STATUS[s.status] || s.status || '') + '</span></td>' +
        '<td title="' + escapeHtml(s.createdAt || '') + '">' + fmtTime(s.createdAt) + '</td></tr>';
    }).join('') : tableEmpty(7, {
      icon: 'cart',
      title: '没有购物清单',
      desc: '家庭在小程序「买菜清单」页里生成清单后会出现在这里。清除日期筛选可以看全部。'
    });
    setPageHeader('共 ' + fmtNum(p.total) + ' 张清单');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>家庭</th><th class="num">菜单日期</th><th>购买进度</th>' +
      '<th class="num">已购 / 总数</th><th>清单状态</th><th>创建时间</th></tr></thead><tbody>' + body +
      '</tbody></table>' + pagerHtml('shopping', p.page, p.size, p.total) + '</div>';
  }

  // ---- 家庭库存 ----

  function loadPantry() {
    loadingCard();
    return request('/api/admin/pantry?keyword=' + encodeURIComponent(state.pantryKeyword || '') +
      '&page=' + state.pantry.page + '&size=' + state.pantry.size)
      .then(function (page) {
        state.pantry = page || { items: [], total: 0, page: 0, size: 50 };
        renderPantry();
      })
      .catch(errorCard);
  }

  function renderPantry() {
    var p = state.pantry;
    var rows = p.items || [];
    var head = pageHead('家庭库存', '家庭现有食材与保质期；过期的会标红，方便解释"为什么推荐里没有这道菜"',
      '<button class="btn small" id="exportPantry">导出 Excel</button>') +
      toolbar(searchBoxHtml('pantrySearch', '搜食材 / 家庭名', state.pantryKeyword, 'pantrySearchBtn'));
    var body = rows.length ? rows.map(function (i) {
      var exp = pantryExpiry(i.expiresAt);
      return '<tr><td class="num">' + escapeHtml(String(i.id)) + '</td>' +
        '<td><button class="btn small" data-famdetail="' + escapeHtml(String(i.familyId)) + '">' +
          escapeHtml(i.familyName || ('家庭 #' + i.familyId)) + '</button></td>' +
        '<td>' + escapeHtml(i.ingredientName || '') + '</td>' +
        '<td class="num">' + escapeHtml(((i.amount || '') + (i.unit || '')) || '适量') + '</td>' +
        '<td class="num">' + (i.expiresAt ? escapeHtml(String(i.expiresAt)) : '—') + '</td>' +
        '<td><span class="pill' + exp.cls + '">' + escapeHtml(exp.text) + '</span></td>' +
        '<td title="' + escapeHtml(i.addedAt || '') + '">' + fmtTime(i.addedAt) + '</td></tr>';
    }).join('') : tableEmpty(7, {
      icon: 'box',
      title: '没有库存记录',
      desc: '家庭在小程序「库存」页里登记食材后会出现在这里；也可以换个关键词再搜。'
    });
    setPageHeader('共 ' + fmtNum(p.total) + ' 项食材');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr><th class="num">ID</th><th>家庭</th><th>食材</th><th class="num">数量</th>' +
      '<th class="num">保质期至</th><th>状态</th><th>登记时间</th></tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('pantry', p.page, p.size, p.total) + '</div>';
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
      '') +
      toolbar('<input id="userSearch" type="search" placeholder="搜昵称 / 手机号 / openid" value="' + escapeHtml(state.userKeyword) + '" class="text-input" style="width:240px" />' +
        '<button class="btn small" id="userSearchBtn">搜索</button>' +
        '<span class="spacer"></span>' +
        '<button class="btn small" id="exportUsers">导出 Excel</button>');
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
    }).join('') : tableEmpty(7, { icon: 'search', title: '没有匹配的账号', desc: '换个昵称、手机号或 openid 关键词再试。' });
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
  // 支付方式枚举 → 中文
  var PAY_METHOD = { MOCK: '模拟支付', WECHAT: '微信支付', JSAPI: '微信支付', NATIVE: '微信支付', H5: '微信支付' };

  // 审计动作 / 结果 / 对象类型 → 中文（审计日志目前直接吐英文枚举，运营看不懂）
  var AUDIT_ACTION = {
    SET_POST_STATUS: '帖子状态变更',
    SET_RECIPE_STATUS: '菜谱上下架',
    REVIEW_COMMENT: '审核评论',
    BATCH_REVIEW_COMMENT: '批量审核评论',
    DELETE_COMMENT: '删除评论',
    RESTORE_COMMENT: '恢复评论',
    REVIEW_IMPORT: '导入审核',
    HANDLE_FEEDBACK: '处理反馈工单',
    GRANT_ADMIN: '授予管理员',
    REVOKE_ADMIN: '撤销管理员',
    SET_ADMIN_ROLE: '调整管理员角色',
    BAN_USER: '封禁用户',
    UNBAN_USER: '解封用户',
    GRANT_VIP: '人工开通会员',
    CLOSE_ORDER: '关闭订单',
    REFUND_ORDER: '订单退款',
    EXPORT_XLSX: '导出 Excel'
  };
  var AUDIT_RESULT = { OK: '成功', FAIL: '失败' };
  var AUDIT_TARGET = {
    post: '帖子', recipe: '菜谱', comment: '评论', user: '用户',
    order: '订单', orders: '订单', feedback: '反馈', import_source: '导入来源'
  };

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
      '<button class="btn small" id="exportOrders">导出 Excel</button>') +
      toolbar(chips([['', '全部'], ['PENDING', '待支付'], ['PAID', '已支付'], ['CLOSED', '已关闭'], ['REFUNDED', '已退款']], state.orderFilter, 'orderfilter') +
        dateRangeHtml('order', state.orderFrom, state.orderTo));
    var body = rows.length ? rows.map(function (o) {
      var pill = o.status === 'PAID' ? 'ok' : (o.status === 'PENDING' ? 'pending' : 'bad');
      return '<tr><td class="num">' + escapeHtml(String(o.orderId)) + '</td>' +
        '<td>' + escapeHtml(o.outTradeNo) + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(o.payerNickname) +
          '<div><div class="name">' + escapeHtml(o.payerNickname || ('用户 #' + o.payerUserId)) + '</div>' +
          '<div class="sub">#' + escapeHtml(String(o.payerUserId)) + '</div></div></div></td>' +
        '<td>' + escapeHtml(o.planName || o.planCode) + '</td>' +
        '<td class="num">' + fmtMoney(o.amountFen) + '</td>' +
        '<td><span class="pill ' + pill + '">' + escapeHtml(ORDER_STATUS[o.status] || o.status) + '</span></td>' +
        '<td>' + escapeHtml(o.paymentMethod ? (PAY_METHOD[o.paymentMethod] || o.paymentMethod) : '—') + '</td>' +
        '<td title="下单 ' + escapeHtml(o.createdAt || '') + (o.paidAt ? ' / 支付 ' + escapeHtml(o.paidAt) : '') + '">' +
        fmtTime(o.paidAt || o.createdAt) + '</td>' +
        '<td class="actions">' +
        (can('ORDER_MANAGE')
          ? (o.status === 'PENDING'
              ? '<button class="btn small danger" data-orderclose="' + escapeHtml(o.outTradeNo) + '" title="仅标记本地状态，不会同步关闭微信侧订单">标记关单</button>' : '') +
            (o.status === 'PAID'
              ? '<button class="btn small danger" data-orderrefund="' + escapeHtml(o.outTradeNo) + '" title="仅标记本地状态与回收权益，真实资金退款需在微信商户平台操作">标记退款</button>' : '')
          : '<span class="muted">只读</span>') +
        '</td></tr>';
    }).join('') : tableEmpty(9, { icon: 'card', title: '暂无订单', desc: '用户下单支付后会出现在这里。可切换状态标签或调整日期区间。' });
    setPageHeader('共 ' + fmtNum(state.orderTotal) + ' 笔');
    $('panelRoot').innerHTML = '<div class="card">' + head +
      '<table><thead><tr>' + thSort('ID', 'id', 'order', 'num') + '<th>商户单号</th><th>用户</th><th>套餐</th>' +
      thSort('金额', 'amount', 'order', 'num') + '<th>状态</th><th>方式</th>' +
      thSort('时间', 'createdAt', 'order') + '<th>操作</th></tr></thead><tbody>' + body + '</tbody></table>' +
      pagerHtml('orders', state.orderPage, state.orderSize, state.orderTotal) + '</div>';
  }

  function closeOrder(outTradeNo) {
    var o = findOrder(outTradeNo);
    confirmDialog({
      title: '标记该订单为已关闭？',
      desc: '单号 ' + outTradeNo + '（' + (o.planName || o.planCode || '—') + ' ' + fmtMoney(o.amountFen) +
        '）在站内会被标记为已关闭，用户无法再从这里继续支付。' +
        '注意：这不会同步关闭微信侧的支付单，若该单已有真实预下单，用户在微信侧仍可能付款成功。',
      danger: true,
      confirmText: '确认关单'
    }).then(function (ok) {
      if (!ok) return;
      request('/api/admin/orders/' + encodeURIComponent(outTradeNo) + '/close', { method: 'POST' })
        .then(function () { toast('已标记关单（未同步微信侧）', 3000); loadOrders(); })
        .catch(function (err) { toast(err.message, 2600, 'error'); });
    });
  }

  function refundOrder(outTradeNo) {
    var o = findOrder(outTradeNo);
    confirmDialog({
      title: '标记为已退款并回收会员权益？',
      desc: '订单 ' + outTradeNo + '（' + fmtMoney(o.amountFen) + '）对应的会员时长会被扣回，' +
        '订单状态在站内标记为已退款。注意：这里不会真的退钱 —— ' +
        '真实资金退款必须到微信商户平台手动操作。',
      danger: true,
      confirmText: '确认标记退款'
    }).then(function (ok) {
      if (!ok) return;
      request('/api/admin/orders/' + encodeURIComponent(outTradeNo) + '/refund', { method: 'POST' })
        .then(function () {
          toast('已标记退款并回收权益 · 真实资金请到微信商户平台退回', 4200, 'error');
          loadOrders();
        })
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
      '<button class="btn small" id="exportAudit">导出 Excel</button>') +
      toolbar('<input id="auditSearch" type="search" placeholder="搜操作人 / 动作 / 对象 / 详情" value="' +
        escapeHtml(state.auditKeyword) + '" class="text-input" style="width:260px" />' +
        '<button class="btn small" id="auditSearchBtn">搜索</button>' +
        (kw ? '<button class="btn small" id="auditClearBtn">清除</button>' : '') +
        dateRangeHtml('audit', state.auditFrom, state.auditTo));
    var body = rows.length ? rows.map(function (a) {
      return '<tr><td class="num">' + escapeHtml(String(a.id)) + '</td>' +
        '<td><div class="cell-user">' + avatarHtml(a.actorNickname) + '<span class="name">' +
          escapeHtml(a.actorNickname || String(a.actorUserId)) + '</span></div></td>' +
        '<td><span class="pill">' + escapeHtml(AUDIT_ACTION[a.action] || a.action) + '</span></td>' +
        '<td>' + escapeHtml((AUDIT_TARGET[a.targetType] || a.targetType) + (a.targetId ? ' #' + a.targetId : '')) + '</td>' +
        '<td class="clamp" title="' + escapeHtml(a.detail || '') + '">' + escapeHtml(a.detail || '—') + '</td>' +
        '<td><span class="pill ' + (a.result === 'OK' ? 'ok' : 'bad') + '">' + escapeHtml(AUDIT_RESULT[a.result] || a.result) + '</span></td>' +
        '<td title="' + escapeHtml(a.createdAt || '') + '">' + fmtTime(a.createdAt) + '</td></tr>';
    }).join('') : tableEmpty(7, { icon: 'shield', title: '没有匹配的操作记录', desc: '所有管理写操作都会自动留痕。换个关键词或调整日期区间再试。' });
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
    if (t === 'families') return 'families?keyword=' + encodeURIComponent(state.familyKeyword || '');
    if (t === 'menus') {
      return 'menus?date=' + encodeURIComponent(state.menuDate || '') +
        '&keyword=' + encodeURIComponent(state.menuKeyword || '');
    }
    if (t === 'shopping') {
      return 'shopping?date=' + encodeURIComponent(state.shoppingDate || '') +
        '&status=' + encodeURIComponent(state.shoppingFilter || '');
    }
    if (t === 'pantry') return 'pantry?keyword=' + encodeURIComponent(state.pantryKeyword || '');
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
          '<div class="modal' + (cfg.danger ? ' danger' : '') + (cfg.wide ? ' wide' : '') + '" role="dialog" aria-modal="true">' +
            '<div class="modal-head"><h3>' + escapeHtml(cfg.title) + '</h3>' +
              (cfg.desc ? '<p>' + escapeHtml(cfg.desc) + '</p>' : '') + '</div>' +
            '<div class="modal-body">' + (cfg.body || '') + '</div>' +
            '<div class="modal-foot">' +
              (cfg.singleAction ? '' : '<button type="button" class="btn" data-modal-cancel>' + escapeHtml(cfg.cancelText || '取消') + '</button>') +
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
      if (cancelBtn) cancelBtn.addEventListener('click', function () { closeModal(null); });
      backdrop.addEventListener('click', function (e) { if (e.target === backdrop) closeModal(null); });
    });
  }

  /** 只读详情弹窗（单个「关闭」按钮，无取消）：用于菜谱详情等纯展示场景 */
  function infoDialog(opts) {
    return openModal({
      title: opts.title,
      desc: opts.desc,
      body: opts.body,
      wide: true,
      singleAction: true,
      confirmText: opts.confirmText || '关闭',
      onConfirm: function () { return true; }
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
          : '/api/admin/reports/batch-review';
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
  // 可点击元素内部常有子节点（卡片数字/文字/图标），点击时 e.target 是子节点，
  // 直接读它的 id / data-* 会拿到空值，所以先向上找到真正带属性的宿主元素。
  //
  // 末尾三个顶栏按钮是靠 id 识别（见下方 if (id === ...) 分支）且内部只有 <svg> 的图标按钮，
  // 必须一并列进来：否则点到图标上时 closest 找不到宿主，id 检查落空，
  // 表现为「点图标完全没反应、点按钮边缘却有反应」—— 这种只坏一半的按钮极难复现。
  // 以后新增靠 id 识别的图标按钮，同样要加到这里。
  var CLICKABLE = [
    '[data-tab]', '[data-goto]', '[data-review]', '[data-rptfilter]', '[data-role]', '[data-vip]',
    '[data-postfilter]', '[data-postdetail]', '[data-poststatus]', '[data-recipefilter]', '[data-recipestatus]', '[data-recipedetail]',
    '[data-cmtfilter]', '[data-cmtstatus]', '[data-cmtdel]', '[data-cmtrestore]', '[data-fbfilter]',
    '[data-fb]', '[data-orderfilter]', '[data-orderclose]', '[data-orderrefund]', '[data-userstatus]',
    '[data-importfilter]', '[data-import]', '[data-pager]', '[data-sort]', '[data-bulk]',
    '[data-jump]', '[data-account]', '[data-retry]', '[data-clearfilter]', '[data-famdetail]',
    '[data-shopfilter]',
    '#menuBtn', '#refreshBtn', '#accountBtn'
  ].join(',');

  document.addEventListener('click', function (e) {
    var t = e.target;
    // 这里必须判断 Element 而不是 HTMLElement：图标按钮内部点到的往往是 <svg>/<path>，
    // 而 SVG 元素不属于 HTMLElement，用 HTMLElement 判断会把这类点击整个吞掉。
    // 后果是「图标几乎占满整颗按钮」的那类按钮等于点不动 —— 顶栏刷新、窄屏汉堡菜单、
    // 弹窗关闭 × 都是这样，且点按钮边缘（没压到图标）时又是好的，所以极难发现。
    if (!(t instanceof Element)) return;
    if (t.closest) {
      var host = t.closest(CLICKABLE);
      if (host) t = host;
    }
    var id = t.id;

    // 点空白处收起浮层
    if (!t.closest('.quick-jump')) closeQuickMenu();
    if (!t.closest('.account')) toggleAccountMenu(false);

    if (id === 'sendOtpBtn') { sendOtp(); return; }
    if (id === 'menuBtn') { $('appView').classList.toggle('nav-open'); return; }
    if (id === 'navBackdrop') { closeNav(); return; }
    if (id === 'refreshBtn') { refreshCurrent(); return; }
    if (id === 'accountBtn') { toggleAccountMenu(); return; }

    var jump = t.getAttribute('data-jump');
    if (jump) { goTab(jump); return; }

    var acct = t.getAttribute('data-account');
    if (acct) {
      toggleAccountMenu(false);
      if (acct === 'logout') logout();
      if (acct === 'refresh') refreshCurrent();
      return;
    }

    if (t.getAttribute('data-retry')) { loadTab(); return; }

    if (id === 'userSearchBtn') {
      state.userKeyword = ($('userSearch') || {}).value || '';
      state.users.page = 0; loadUsers(); return;
    }

    // ---- 家庭数据四页的筛选与下钻（全部只读） ----
    if (id === 'familySearchBtn') {
      state.familyKeyword = ($('familySearch') || {}).value || '';
      state.families.page = 0; loadFamilies(); return;
    }
    if (id === 'menuSearchBtn') {
      state.menuKeyword = ($('menuSearch') || {}).value || '';
      state.menus.page = 0; loadMenus(); return;
    }
    if (id === 'menuDayBtn' || id === 'menuDayToday') {
      state.menuDate = id === 'menuDayToday' ? todayIso() : (($('menuDay') || {}).value || '');
      state.menus.page = 0; loadMenus(); return;
    }
    if (id === 'menuDayClear') { state.menuDate = ''; state.menus.page = 0; loadMenus(); return; }
    if (id === 'shopDayBtn' || id === 'shopDayToday') {
      state.shoppingDate = id === 'shopDayToday' ? todayIso() : (($('shopDay') || {}).value || '');
      state.shopping.page = 0; loadShopping(); return;
    }
    if (id === 'shopDayClear') { state.shoppingDate = ''; state.shopping.page = 0; loadShopping(); return; }
    if (id === 'pantrySearchBtn') {
      state.pantryKeyword = ($('pantrySearch') || {}).value || '';
      state.pantry.page = 0; loadPantry(); return;
    }
    var shf = t.getAttribute('data-shopfilter');
    if (shf !== null) { state.shoppingFilter = shf; state.shopping.page = 0; loadShopping(); return; }
    var famd = t.getAttribute('data-famdetail');
    if (famd) { showFamilyDetail(famd); return; }

    if (id === 'exportUsers' || id === 'exportOrders' || id === 'exportAudit' ||
        id === 'exportPosts' || id === 'exportComments' || id === 'exportFeedback' ||
        id === 'exportReports' || id === 'exportFamilies' || id === 'exportMenus' ||
        id === 'exportShopping' || id === 'exportPantry') { exportCurrent(); return; }

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

    var pd = t.getAttribute('data-postdetail');
    if (pd) { showPostDetail(pd); return; }

    if (id === 'recipeSearchBtn') {
      state.recipeKeyword = ($('recipeSearch') || {}).value || '';
      loadRecipes(); return;
    }
    var rf = t.getAttribute('data-recipefilter');
    if (rf !== null) { state.recipeFilter = rf; loadRecipes(); return; }
    var rs = t.getAttribute('data-recipestatus');
    if (rs) { setRecipeStatus(rs, t.getAttribute('data-on')); return; }
    var rd = t.getAttribute('data-recipedetail');
    if (rd) { showRecipeDetail(rd); return; }

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

  // ---- 快速跳转：输入过滤，↑↓ 选择，Enter 跳转，Esc 关闭 ----
  var quickInput = $('quickJump');
  if (quickInput) {
    quickInput.addEventListener('input', function () {
      state.jumpIndex = 0;
      renderQuickMenu(this.value, 0);
    });
    quickInput.addEventListener('focus', function () {
      state.jumpIndex = 0;
      renderQuickMenu(this.value, 0);
    });
    quickInput.addEventListener('keydown', function (e) {
      var list = jumpTargets(this.value);
      if (e.key === 'Escape') { this.blur(); closeQuickMenu(); return; }
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
        e.preventDefault();
        if (!list.length) return;
        var next = state.jumpIndex + (e.key === 'ArrowDown' ? 1 : -1);
        state.jumpIndex = (next + list.length) % list.length;
        renderQuickMenu(this.value, state.jumpIndex);
        return;
      }
      if (e.key === 'Enter') {
        e.preventDefault();
        var target = list[state.jumpIndex] || list[0];
        if (target) { this.value = ''; this.blur(); goTab(target.key); }
      }
    });
  }

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
    // 「/」快速聚焦跳转框（输入框里打字时不抢）
    if (e.key === '/' && e.target && !/^(INPUT|TEXTAREA|SELECT)$/.test(e.target.tagName)) {
      e.preventDefault();
      $('quickJump').focus();
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
      } else if (e.target.id === 'familySearch') {
        state.familyKeyword = e.target.value || ''; state.families.page = 0; loadFamilies();
      } else if (e.target.id === 'menuSearch') {
        state.menuKeyword = e.target.value || ''; state.menus.page = 0; loadMenus();
      } else if (e.target.id === 'pantrySearch') {
        state.pantryKeyword = e.target.value || ''; state.pantry.page = 0; loadPantry();
      }
    }
  });

  $('loginForm').addEventListener('submit', login);
  // 引导登录：短信网关未接入时的后台入口（服务端未配令牌时点击会提示未开启）
  $('bootstrapBtn').addEventListener('click', bootstrapLogin);
  $('bootstrapToken').addEventListener('keydown', function (e) {
    if (e.key === 'Enter') { e.preventDefault(); bootstrapLogin(); }
  });

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
