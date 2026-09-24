const DEVICE_ID_KEY = 'device_id';
// 全站 baseURL 唯一来源（见 utils/env.js），此处不再保留第二套兜底地址
const { resolveBaseUrl } = require('./env');

function getAuthToken() {
  return wx.getStorageSync('auth_token') || '';
}

function setAuthToken(token, kind) {
  if (token) {
    loginExpiredHandled = false;   // 拿到新会话（重新登录/游客）即解除屏障
    wx.setStorageSync('auth_token', token);
    // 记下这份会话是游客还是登录用户换的：401 续期时二者处理方式完全不同
    if (kind) wx.setStorageSync('session_kind', kind);
  } else {
    wx.removeStorageSync('auth_token');
    wx.removeStorageSync('session_kind');
  }
}

function getSessionKind() {
  return wx.getStorageSync('session_kind') || '';
}

let sessionExpiredNotified = false;
// 一次 401 清掉登录态后，同一屏其余在途请求也会陆续收到 401；
// 没有这个屏障它们会落到下面的游客兜底，等于又静默降级了一次。
let loginExpiredHandled = false;
function notifySessionExpired() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  wx.showToast({ title: '登录已过期，请重新登录', icon: 'none', duration: 2500 });
  setTimeout(() => { sessionExpiredNotified = false; }, 8000);
}

// 微信续期失败、兜底成游客时用这条（不能沿用上面那句：用户没做错任何事，
// 而且他现在的身份是游客，得说清"数据还在、重新登录能找回"）
function notifyWechatDowngraded() {
  if (sessionExpiredNotified) return;
  sessionExpiredNotified = true;
  wx.showToast({ title: '微信登录已过期，已切到游客身份，重新登录可找回', icon: 'none', duration: 3000 });
  setTimeout(() => { sessionExpiredNotified = false; }, 8000);
}

function getDeviceId() {
  let deviceId = wx.getStorageSync(DEVICE_ID_KEY);
  if (deviceId) return deviceId;
  deviceId = `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  wx.setStorageSync(DEVICE_ID_KEY, deviceId);
  return deviceId;
}

function showServerError(statusCode, message) {
  const text = message || (statusCode === 401 ? '登录已过期' : statusCode === 403 ? '没有权限' : statusCode === 503 ? '服务暂未配置' : '网络异常');
  wx.showToast({ title: text, icon: 'none' });
}

function extractErrorMessage(data) {
  if (!data) return '';
  if (typeof data === 'string') return data;
  return data.message || data.error || '';
}

let reauthPromise = null;
// expectedToken = 触发 401 时用的 token。期间若用户登录写了新 token（或 token 已被清），
// 就丢弃游客 token，避免游客身份覆盖刚拿到的登录态。
//
// 续期一律**保持会话种类不变**：游客续游客、微信续微信。
// 种类一变，用户就会看到"家庭、菜单、收藏凭空消失"（那是另一个账号的数据）。
function renewSession(baseline) {
  const at = baseline === undefined ? getAuthToken() : baseline;
  const login = getSessionKind() === 'login';
  return (login ? wechatLoginSilently() : postGuestSession(at)).then((token) => token);
}

// 微信静默登录：wx.login 拿 code → 后端 jscode2session 换 openid。
// 不需要用户授权（无弹窗），所以可以放在启动路径上。
function wechatLoginSilently() {
  return new Promise((resolve) => {
    wx.login({
      success(res) {
        const code = res && res.code;
        if (!code) { resolve(''); return; }
        wechatLogin({ code })
          .then((r) => resolve((r && r.token) || ''))
          .catch(() => resolve(''));
      },
      fail() { resolve(''); }
    });
  });
}

// 首次身份建立：优先微信、失败降级游客。
//
// 为什么不是"游客优先"（2026-09-20 改）：
//  1) 游客 openid 是 `guest-` 自造标识，微信 msgSecCheck 只认真实 openid →
//     游客发的帖子/评论**只能**落 PENDING 人工队列（community_post.audit_status），
//     而人工队列要 /admin、登录后台要短信验证码——社区是核心功能，上线首日却发不出任何公开内容。
//  2) 游客账号按设备隔离且只存在本地 device_id 里，清一次小程序缓存＝换一个账号，
//     家庭/菜谱/做菜记录全找不回来（而"绑定手机号换设备不丢数据"那张卡在个人主体下是关掉的）。
//  微信登录成功后 openid 稳定，换设备/重装都还是同一个账号，上面两条一起解决。
let bootstrapPromise = null;
function bootstrapSession() {
  if (bootstrapPromise) return bootstrapPromise;
  const at = getAuthToken();
  bootstrapPromise = (async () => {
    let token = await wechatLoginSilently();
    // 用户在这期间自己登录成功（token 变了）→ 不覆盖他的登录态，也不降级成游客
    if (at && getAuthToken() !== at) return getAuthToken();
    if (!token) token = await postGuestSession(at);
    return token;
  })().then((token) => {
    bootstrapPromise = null;
    return token;
  });
  return bootstrapPromise;
}

// 游客会话：POST /api/auth/guest（也可由 401 兜底触发）
function postGuestSession(at) {
  return new Promise((resolve) => {
    wx.request({
      url: `${resolveBaseUrl()}/api/auth/guest`,
      method: 'POST',
      header: { 'X-Device-Id': getDeviceId() },
      timeout: 10000,
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
          if (at && getAuthToken() !== at) {
            // token 已被其他流程改写（如刚登录成功），不覆盖
            resolve('');
            return;
          }
          setAuthToken(res.data.token, 'guest');
          resolve(res.data.token);
        } else {
          resolve('');
        }
      },
      fail() { resolve(''); }
    });
  });
}

// 旧的续期入口（保持名字，401 分支与页面首屏都会走到这里）
function ensureGuestSession(expectedToken) {
  if (reauthPromise) return reauthPromise;
  const baseline = expectedToken !== undefined ? expectedToken : getAuthToken();
  const kind = getSessionKind();
  // 还没有任何身份（页面首屏请求先于 app.js 建会话）→ 走"优先微信"的首次建立，
  // 与 app.js 共用同一个 promise：否则页面会抢先建出一个游客会话，把微信登录挤掉。
  const run = (!baseline && !kind) ? bootstrapSession() : renewSession(baseline);
  reauthPromise = run.then((token) => {
    reauthPromise = null;
    // 续期策略是"保持会话种类"，不会把登录态降级成游客，所以这里不必再防覆盖
    return token || null;
  });
  return reauthPromise;
}

function performRequest(path, config) {
  return new Promise((resolve) => {
    wx.request({
      url: `${resolveBaseUrl()}${path}`,
      method: config.method || 'GET',
      data: config.data || {},
      header: {
        ...(config.header || {}),
        'X-Auth-Token': getAuthToken(),
        'X-Device-Id': getDeviceId()
      },
      // 读请求给 15s、写请求保持 10s：读慢了用户宁可多等一会（页面本来就有加载态），
      // 而写请求等太久会让人以为没戳上再来一次——那才是重复提交的来源。
      timeout: (config.method || 'GET').toUpperCase() === 'GET' ? 15000 : 10000,
      success(res) { resolve({ res }); },
      fail(err) { resolve({ err }); }
    });
  });
}

async function rawRequest(path, options) {
  const config = options || {};
  const first = await performRequest(path, config);
  if (first.res) {
    const res = first.res;
    if (res.statusCode >= 200 && res.statusCode < 300) {
      return { ok: true, data: res.data };
    }
    if (res.statusCode === 401 && config.skipReauth !== true) {
      // 先静默续期（保持会话种类：游客续游客、微信续微信）。
      // 微信续期走 wx.login + jscode2session，同 openid → 同一个账号，用户无感、数据不丢。
      // 原来这里对登录用户直接清 token + 提示，等于 30 天一到整个应用不可用
      // （每个接口都 401，而"我的"页拿不到用户信息、连登录入口都不显示）。
      let refreshed = await ensureGuestSession(getAuthToken());
      let downgraded = false;
      if (!refreshed && getSessionKind() === 'login') {
        // 微信静默续期失败（微信接口不可用 / 凭据被改）：兜底成游客会话并**明说**。
        // 游客身份至少能用，重新登录即可回到原账号——比整站 401 强。
        refreshed = await postGuestSession(getAuthToken());
        downgraded = !!refreshed;
      }
      if (refreshed) {
        if (downgraded) notifyWechatDowngraded();
        const retry = await performRequest(path, config);
        if (retry.res && retry.res.statusCode >= 200 && retry.res.statusCode < 300) {
          return { ok: true, data: retry.res.data };
        }
        if (retry.res && config.silent !== true) {
          showServerError(retry.res.statusCode, extractErrorMessage(retry.res.data));
        }
        if (config.silent !== true) {
          console.warn('[api] retry failed', path, retry.res && retry.res.statusCode);
        }
        return { ok: false, status: retry.res ? retry.res.statusCode : 0, data: retry.res ? retry.res.data : null };
      }
      if (getSessionKind() === 'login' || loginExpiredHandled) {
        // 连兜底都建不出会话（服务端不可用）：清掉失效 token 并明确告知
        loginExpiredHandled = true;
        setAuthToken('');
        if (config.silent !== true) notifySessionExpired();
        return { ok: false, status: 401, data: res.data, sessionExpired: true };
      }
    }
    if (config.silent !== true) {
      showServerError(res.statusCode, extractErrorMessage(res.data));
      console.warn('[api] request failed', path, res.statusCode, res.data);
    }
    return { ok: false, status: res.statusCode, data: res.data };
  }
  if (config.silent !== true) {
    wx.showToast({ title: '网络无法连接', icon: 'none' });
    console.warn('[api] request error', path, first.err);
  }
  return { ok: false, status: 0, data: null };
}

// 2xx 却没有 payload（空字符串 / null）时的统一文案；写接口返回 204 是常态，所以只看读接口。
// 不把它转成失败，页面就只能自己猜：帖子详情曾把「200 + 空 body」渲染成「帖子不存在或已删除」，
// 用户什么都没做错却被告知内容没了（后端 2026-09-23 把那条路的 200 空 body 改成了 404，
// 这里补上客户端这一半：任何读接口再出现空 body，页面都会拿到一句可展示的失败文案）。
const EMPTY_READ_MSG = '数据异常，请重试';
function emptyReadMessage(result, config) {
  if (!result.ok) return '';
  if (String(config.method || 'GET').toUpperCase() !== 'GET') return '';
  const data = result.data;
  return (data === null || data === undefined || data === '') ? EMPTY_READ_MSG : '';
}

function request(path, options) {
  const config = options || {};
  return rawRequest(path, config).then((result) => {
    const emptyMsg = emptyReadMessage(result, config);
    if (result.ok && !emptyMsg) return result.data;
    // 静默降级为显式 opt-in：仅声明了 fallback 的调用（如 getCurrentUser）保留"失败=默认值"；
    // 其余失败一律 reject，由页面 catch/loadError 分支处理，禁止伪装成空数据。
    if (typeof config.fallback === 'function') return config.fallback();
    // 用户可见文案必须中文（经页面 loadError/toast 直出）；status 挂在 error.status 供调试
    const error = new Error(emptyMsg || extractErrorMessage(result.data) || '网络请求失败，请稍后重试');
    error.status = result.status;
    error.data = result.data;
    throw error;
  });
}

function requestStrict(path, options) {
  const config = options || {};
  return rawRequest(path, config).then((result) => {
    const emptyMsg = emptyReadMessage(result, config);
    if (result.ok && !emptyMsg) return result.data;
    const error = new Error(emptyMsg || extractErrorMessage(result.data) || '网络请求失败，请稍后重试');
    error.status = result.status;
    error.data = result.data;
    throw error;
  });
}

function getDashboard() {
  return request('/api/home/dashboard', { silent: true });
}

function getRecipes(source) {
  return request(`/api/recipes?source=${encodeURIComponent(source || 'all')}`, { silent: true });
}

function getCommunityPosts(tag, page, size, recipeId) {
  const params = [];
  if (tag) params.push(`tag=${encodeURIComponent(tag)}`);
  // 按菜谱取帖（菜谱详情页「大家晒的」）：与 tag 互斥用法，同一条信息流接口
  if (recipeId) params.push(`recipeId=${encodeURIComponent(recipeId)}`);
  if (page) params.push(`page=${encodeURIComponent(page)}`);
  if (size) params.push(`size=${encodeURIComponent(size)}`);
  const q = params.length ? `?${params.join('&')}` : '';
  return request(`/api/community/posts${q}`, { silent: true });
}

// 热门话题（服务端聚合近帖标签频次）；失败/为空时页面回退到写死话题
function getCommunityTopics() {
  return request('/api/community/topics', { silent: true, fallback: () => [] });
}

// 帖子详情：分享/直达单帖用，不再拉全量信息流再 find
function getCommunityPost(postId) {
  return request(`/api/community/posts/${encodeURIComponent(postId)}`, { silent: true });
}

// 作者删自己的帖子（服务端软删为 REMOVED，与运营下架同语义）
function deleteCommunityPost(postId) {
  return requestStrict(`/api/community/posts/${encodeURIComponent(postId)}`, {
    method: 'DELETE'
  });
}

// 评论者删自己的评论（服务端软删）
function deleteCommunityComment(postId, commentId) {
  return requestStrict(
    `/api/community/posts/${encodeURIComponent(postId)}/comments/${encodeURIComponent(commentId)}`,
    { method: 'DELETE' }
  );
}

function createCommunityPost(payload) {
  return requestStrict('/api/community/posts', {
    method: 'POST',
    data: payload
  });
}

function getCommunityComments(postId) {
  return request(`/api/community/posts/${encodeURIComponent(postId)}/comments`, { silent: true });
}

function toggleCommunityFavorite(postId) {
  return requestStrict(`/api/community/posts/${encodeURIComponent(postId)}/favorite`, {
    method: 'POST'
  });
}

function toggleCommunityLike(postId) {
  return requestStrict(`/api/community/posts/${encodeURIComponent(postId)}/like`, {
    method: 'POST'
  });
}

function addCommunityComment(postId, payload) {
  return requestStrict(`/api/community/posts/${encodeURIComponent(postId)}/comments`, {
    method: 'POST',
    data: payload
  });
}

function reportCommunityPost(postId, payload) {
  return requestStrict(`/api/community/posts/${encodeURIComponent(postId)}/report`, {
    method: 'POST',
    data: payload
  });
}

function getMyFavorites() {
  return request('/api/me/favorites', { silent: true });
}

// 我的反馈历史（含运营回复）——反馈闭环的另一半
function getMyFeedbacks() {
  return request('/api/me/feedbacks', { silent: true, fallback: () => [] });
}

// 登出：吊销服务端会话（失败不阻塞本地清理）
function logout() {
  return requestStrict('/api/auth/logout', { method: 'POST' }).catch(() => null);
}

function getVipStatus() {
  return request('/api/vip/status', { silent: true });
}

function getFamilyProfile() {
  return request('/api/family/profile', { silent: true });
}

function createFamily(payload) {
  return requestStrict('/api/family', {
    method: 'POST',
    data: payload
  });
}

function previewJoinFamily(inviteCode) {
  return requestStrict(`/api/family/join-preview?inviteCode=${encodeURIComponent(inviteCode)}`);
}

function joinFamily(inviteCode) {
  return requestStrict('/api/family/join', {
    method: 'POST',
    data: { inviteCode }
  });
}

function getFamilyInviteCode() {
  return requestStrict('/api/family/invite-code');
}

function removeFamilyMember(userId) {
  return requestStrict(`/api/family/members/${encodeURIComponent(userId)}`, {
    method: 'DELETE'
  });
}

function updateMemberAvoidTags(userId, avoidTags) {
  return requestStrict(`/api/family/members/${encodeURIComponent(userId)}/avoid`, {
    method: 'PUT',
    data: { avoidTags: avoidTags || [] }
  });
}

function previewImport(rawText) {
  return requestStrict('/api/import/preview', {
    method: 'POST',
    data: { rawText }
  });
}

function saveRecipe(payload) {
  return requestStrict('/api/recipes', {
    method: 'POST',
    data: payload
  });
}

function getRecipeDetail(recipeId) {
  return request(`/api/recipes/${encodeURIComponent(recipeId)}`, { silent: true });
}

function updateRecipe(recipeId, payload) {
  return requestStrict(`/api/recipes/${encodeURIComponent(recipeId)}`, {
    method: 'PUT',
    data: payload
  });
}

function addCookHistory(payload, options) {
  return requestStrict('/api/cook-history', {
    method: 'POST',
    data: payload,
    silent: !!(options && options.silent)
  });
}

function getCookHistory() {
  return request('/api/cook-history', { silent: true });
}

function addShoppingItem(payload) {
  return requestStrict('/api/shopping-list/today/items', {
    method: 'POST',
    data: payload
  });
}

function deleteShoppingItem(itemId) {
  return requestStrict(`/api/shopping-list/today/items/${encodeURIComponent(itemId)}`, {
    method: 'DELETE'
  });
}

function getTodayMenu() {
  return request('/api/daily-menu/today', { silent: true });
}

function addTodayMenuRecipe(recipeId, mealType) {
  return requestStrict('/api/daily-menu/today/items', {
    method: 'POST',
    data: { recipeId, mealType }
  });
}

function removeTodayMenuRecipe(recipeId) {
  return requestStrict(`/api/daily-menu/today/items/${encodeURIComponent(recipeId)}`, {
    method: 'DELETE'
  });
}

// 菜单项状态流转：todo（待做）/ cooking（烧着）/ done（上桌）
function updateMenuItemStatus(itemId, status) {
  return requestStrict(`/api/daily-menu/today/items/${itemId}/status`, {
    method: 'PATCH',
    data: { status }
  });
}

// 开饭广播：给家里其他成员发"开饭啦"站内通知
function announceMeal() {
  return requestStrict('/api/daily-menu/today/announce', { method: 'POST' });
}

// ---- 许愿池（家庭共享，按日期+餐次分槽） ----
function getWishes(date, slot) {
  return request('/api/wishes', {
    data: { date, slot },
    silent: true
  });
}

function addWish(payload) {
  // payload: { date, slot, text, recipeId? }
  return requestStrict('/api/wishes', { method: 'POST', data: payload });
}

function removeWish(wishId) {
  return requestStrict(`/api/wishes/${wishId}`, { method: 'DELETE' });
}

function getShoppingList() {
  return request('/api/shopping-list/today', { silent: true });
}

function rebuildShoppingList() {
  return requestStrict('/api/shopping-list/today/rebuild', {
    method: 'POST'
  });
}

function toggleShoppingPurchased(itemId, purchased) {
  return requestStrict(`/api/shopping-list/today/items/${itemId}`, {
    method: 'PATCH',
    data: { purchased }
  });
}

function addFamilyMember(payload) {
  return requestStrict('/api/family/members', {
    method: 'POST',
    data: payload
  });
}

function updateProfile(payload) {
  return requestStrict('/api/auth/me', {
    method: 'PATCH',
    data: payload || {}
  });
}

function guestLogin() {
  return requestStrict('/api/auth/guest', {
    method: 'POST',
    skipReauth: true
  }).then((response) => {
    if (response && response.token) {
      setAuthToken(response.token, 'guest');
    }
    return response;
  });
}

function wechatLogin(payload) {
  return requestStrict('/api/auth/login', {
    method: 'POST',
    data: payload || {},
    skipReauth: true
  }).then((response) => {
    if (response && response.token) {
      setAuthToken(response.token, 'login');
    }
    return response;
  });
}

function requestPhoneOtp(phone) {
  return requestStrict('/api/auth/otp/request', {
    method: 'POST',
    data: { phone },
    skipReauth: true
  });
}

function loginWithOtp(payload) {
  return requestStrict('/api/auth/otp/login', {
    method: 'POST',
    data: payload,
    skipReauth: true
  }).then((response) => {
    if (response && response.token) {
      setAuthToken(response.token, 'login');
    }
    return response;
  });
}

function getCurrentUser() {
  // 已有 token（手机/微信/游客）直接读 /me；无 token 才补游客。
  // 若先 ensureGuestSession，会用设备游客盖掉刚写上的登录态。
  const token = getAuthToken();
  const loadMe = () => request('/api/auth/me', {
    silent: true,
    fallback: () => null
  });
  if (token) return loadMe();
  return ensureGuestSession().then(loadMe);
}

// ===== Phase 4: Enhanced =====

function generateWeeklyMenu() {
  return requestStrict('/api/weekly-menu/generate', {
    method: 'POST'
  });
}

function getWeeklyMenu() {
  return request('/api/weekly-menu/current', { silent: true });
}

function getPreferenceProfile() {
  return request('/api/preference/profile', { silent: true });
}

function getPantryItems() {
  return request('/api/pantry', { silent: true });
}

function addPantryItem(payload) {
  return requestStrict('/api/pantry', {
    method: 'POST',
    data: payload
  });
}

function deletePantryItem(itemId) {
  // 后端语义（2026-09-23 起）：DELETE 影响 0 行返回 404——目标已被删、重复删、
  // 或不属于本家庭。对调用方来说"要删的东西已经不在了"就是成功，所以 404 一律
  // 按成功返回：否则连点两次/两端同时删，第二次会闪一句"删除失败"。
  // silent：rawRequest 会在返回前先弹一次服务端文案（如"库存条目不存在"），
  // 既然要吞掉 404，就不能让它先弹；真实失败的提示由调用方 catch 负责。
  return requestStrict(`/api/pantry/${encodeURIComponent(itemId)}`, {
    method: 'DELETE',
    silent: true
  }).catch((err) => {
    if (err && err.status === 404) return null;
    throw err;
  });
}

function getPantryMatch() {
  return request('/api/pantry/match', { silent: true });
}

// ===== Payment =====

/** 套餐目录（后端权威，见 utils/plans.js）。失败静默返回 null，由调用方兜底。 */
function getPaymentPlans() {
  return request('/api/payment/plans', { silent: true, fallback: () => null });
}

function createPaymentOrder(planId) {
  // 后端 CreateOrderRequest 需要 planCode 字段；响应用 outTradeNo 作为订单号
  return requestStrict('/api/payment/orders', {
    method: 'POST',
    data: { planCode: planId }
  }).then((resp) => {
    if (resp && resp.outTradeNo && resp.orderId == null) {
      // 兼容前端页面读取 orderId 的写法
      return { ...resp, orderId: resp.outTradeNo };
    }
    return resp;
  });
}

function prepayOrder(orderId) {
  return requestStrict(`/api/payment/orders/${encodeURIComponent(orderId)}/prepay`, {
    method: 'POST',
    data: {}
  }).then((resp) => {
    // 后端 PrepayResponse.packageValue → 映射到 wx.requestPayment 的 package 字段
    if (resp && resp.packageValue && !resp.package) {
      return { ...resp, package: resp.packageValue };
    }
    return resp;
  });
}

function mockPayOrder(orderId) {
  // 后端 MockPayRequest 需要 outTradeNo 字段
  return requestStrict('/api/payment/mock-pay', {
    method: 'POST',
    data: { outTradeNo: orderId }
  });
}

function getPaymentOrders() {
  // 后端 OrderView 用 outTradeNo；规范化补 orderId/amountFen 便于页面读取。
  // 失败 reject（后处理天然跳过，直达页面 catch）；成功但非数组 = 后端契约破坏，响亮抛错不伪装空列表。
  return request('/api/payment/orders', { silent: true }).then((list) => {
    if (!Array.isArray(list)) {
      throw new Error('订单列表格式异常');
    }
    return list.map((o) => ({
      ...o,
      orderId: o.orderId != null ? o.orderId : o.outTradeNo,
      amountFen: o.amountFen != null ? o.amountFen : o.amount_fen
    }));
  });
}

function submitFeedback(payload) {
  return requestStrict('/api/feedback', {
    method: 'POST',
    data: payload
  });
}

function getNotifications() {
  return request('/api/notifications', { silent: true });
}

// 订阅消息设置：后端同时把模板 ID 下发过来（见 utils/subscribe.js）
// 始终 silent：这是页面预加载，失败时由调用方回退成"功能未开启"，不该弹错误提示打扰用户
function getSubscribeSetting(options) {
  return request('/api/notifications/subscribe', {
    ...(options || {}),
    silent: true
  });
}

function updateSubscribe(enabled) {
  return requestStrict('/api/notifications/subscribe', {
    method: 'PATCH',
    data: { enabled: !!enabled }
  });
}

function markNotificationsRead(ids) {
  return requestStrict('/api/notifications/read', {
    method: 'PATCH',
    data: { ids: ids || [] }
  });
}

module.exports = {
  getAuthToken,
  getDeviceId,
  bootstrapSession,
  createPaymentOrder,
  prepayOrder,
  mockPayOrder,
  getPaymentOrders,
  addCommunityComment,
  addCookHistory,
  addPantryItem,
  addShoppingItem,
  createCommunityPost,
  deleteCommunityPost,
  deleteCommunityComment,
  deletePantryItem,
  deleteShoppingItem,
  generateWeeklyMenu,
  getCommunityPosts,
  getCommunityPost,
  getCommunityTopics,
  getMyFeedbacks,
  getCommunityComments,
  getMyFavorites,
  createFamily,
  getCookHistory,
  getFamilyProfile,
  getFamilyInviteCode,
  getDashboard,
  getCurrentUser,
  getNotifications,
  getPantryItems,
  getPantryMatch,
  getPreferenceProfile,
  getRecipeDetail,
  getRecipes,
  getVipStatus,
  getPaymentPlans,
  logout,
  getWeeklyMenu,
  getTodayMenu,
  addTodayMenuRecipe,
  removeTodayMenuRecipe,
  updateMenuItemStatus,
  announceMeal,
  getWishes,
  addWish,
  removeWish,
  getShoppingList,
  rebuildShoppingList,
  toggleShoppingPurchased,
  reportCommunityPost,
  toggleCommunityFavorite,
  toggleCommunityLike,
  previewJoinFamily,
  joinFamily,
  addFamilyMember,
  removeFamilyMember,
  updateMemberAvoidTags,
  updateProfile,
  guestLogin,
  requestPhoneOtp,
  loginWithOtp,
  previewImport,
  markNotificationsRead,
  getSubscribeSetting,
  updateSubscribe,
  saveRecipe,
  setAuthToken,
  submitFeedback,
  updateRecipe,
  wechatLogin
};
