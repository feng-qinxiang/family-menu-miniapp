const BASE_URL_FALLBACK = 'http://localhost:9088';
const DEVICE_ID_KEY = 'device_id';

function resolveBaseUrl() {
  try {
    const app = typeof getApp === 'function' ? getApp() : null;
    if (app && app.globalData && app.globalData.apiBaseUrl) {
      return app.globalData.apiBaseUrl;
    }
  } catch (err) {
    // getApp may throw before App() runs; fall through to fallback.
  }
  return BASE_URL_FALLBACK;
}

function getAuthToken() {
  return wx.getStorageSync('auth_token') || '';
}

function setAuthToken(token) {
  if (token) {
    wx.setStorageSync('auth_token', token);
  } else {
    wx.removeStorageSync('auth_token');
  }
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
function ensureGuestSession() {
  if (reauthPromise) return reauthPromise;
  reauthPromise = new Promise((resolve) => {
    wx.request({
      url: `${resolveBaseUrl()}/api/auth/guest`,
      method: 'POST',
      header: { 'X-Device-Id': getDeviceId() },
      success(res) {
        if (res.statusCode >= 200 && res.statusCode < 300 && res.data && res.data.token) {
          setAuthToken(res.data.token);
          resolve(res.data.token);
        } else {
          resolve(null);
        }
      },
      fail() { resolve(null); },
      complete() { reauthPromise = null; }
    });
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
      const refreshed = await ensureGuestSession();
      if (refreshed) {
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

function request(path, options) {
  const config = options || {};
  return rawRequest(path, config).then((result) => {
    if (result.ok) return result.data;
    if (typeof config.fallback === 'function') return config.fallback();
    return null;
  });
}

function requestStrict(path, options) {
  return rawRequest(path, options || {}).then((result) => {
    if (result.ok) return result.data;
    const error = new Error(extractErrorMessage(result.data) || `request failed: ${result.status}`);
    error.status = result.status;
    error.data = result.data;
    throw error;
  });
}

function getDashboard() {
  return request('/api/home/dashboard', { fallback: () => null });
}

function getRecipes(source) {
  return request(`/api/recipes?source=${encodeURIComponent(source || 'all')}`, {
    fallback: () => []
  });
}

function getCommunityPosts() {
  return request('/api/community/posts', { fallback: () => [] });
}

function createCommunityPost(payload) {
  return requestStrict('/api/community/posts', {
    method: 'POST',
    data: payload
  });
}

function getCommunityComments(postId) {
  return request(`/api/community/posts/${encodeURIComponent(postId)}/comments`, {
    fallback: () => []
  });
}

function toggleCommunityFavorite(postId) {
  return requestStrict(`/api/community/posts/${encodeURIComponent(postId)}/favorite`, {
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

function getCommunityReports(status) {
  return request(`/api/community/reports?status=${encodeURIComponent(status || 'PENDING')}`, {
    silent: true,
    fallback: () => []
  });
}

function reviewCommunityReport(reportId, payload) {
  return requestStrict(`/api/community/reports/${encodeURIComponent(reportId)}/review`, {
    method: 'POST',
    data: payload
  });
}

function getMyFavorites() {
  return request('/api/me/favorites', { fallback: () => [] });
}

function getVipStatus() {
  return request('/api/vip/status', { fallback: () => ({ vip: false, planName: '', benefits: [], adPlacements: [] }) });
}

function activateVip(planName) {
  return requestStrict('/api/vip/activate', {
    method: 'POST',
    data: { planName: planName || '家庭年卡' }
  });
}

function getFamilyProfile() {
  return request('/api/family/profile', { fallback: () => null });
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
  return request(`/api/recipes/${encodeURIComponent(recipeId)}`, {
    fallback: () => null
  });
}

function updateRecipe(recipeId, payload) {
  return requestStrict(`/api/recipes/${encodeURIComponent(recipeId)}`, {
    method: 'PUT',
    data: payload
  });
}

function addCookHistory(payload) {
  return requestStrict('/api/cook-history', {
    method: 'POST',
    data: payload
  });
}

function getCookHistory() {
  return request('/api/cook-history', {
    fallback: () => []
  });
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
  return request('/api/daily-menu/today', { fallback: () => null });
}

function addTodayMenuRecipe(recipeId, mealType) {
  return requestStrict('/api/daily-menu/today/items', {
    method: 'POST',
    data: { recipeId, mealType }
  });
}

function removeTodayMenuRecipe(recipeId) {
  return requestStrict(`/api/daily-menu/today/items/${recipeId}`, {
    method: 'DELETE'
  });
}

// ---- 许愿池（家庭共享，按日期+餐次分槽） ----
function getWishes(date, slot) {
  return request('/api/wishes', {
    data: { date, slot },
    fallback: () => []
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
  return request('/api/shopping-list/today', { fallback: () => null });
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
      setAuthToken(response.token);
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
      setAuthToken(response.token);
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
      setAuthToken(response.token);
    }
    return response;
  });
}

function getCurrentUser() {
  return ensureGuestSession().then(() => request('/api/auth/me', {
    silent: true,
    fallback: () => null
  }));
}

// ===== Phase 4: Enhanced =====

function generateWeeklyMenu() {
  return requestStrict('/api/weekly-menu/generate', {
    method: 'POST'
  });
}

function getWeeklyMenu() {
  return request('/api/weekly-menu/current', {
    fallback: () => null
  });
}

function getPreferenceProfile() {
  return request('/api/preference/profile', {
    fallback: () => null
  });
}

function getPantryItems() {
  return request('/api/pantry', { fallback: () => [] });
}

function addPantryItem(payload) {
  return requestStrict('/api/pantry', {
    method: 'POST',
    data: payload
  });
}

function deletePantryItem(itemId) {
  return requestStrict(`/api/pantry/${encodeURIComponent(itemId)}`, {
    method: 'DELETE'
  });
}

function getPantryMatch() {
  return request('/api/pantry/match', { fallback: () => [] });
}

// ===== Payment =====

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
  // 后端 OrderView 用 outTradeNo；规范化补 orderId/amountFen 便于页面读取
  return request('/api/payment/orders', { fallback: () => [] }).then((list) => {
    if (!Array.isArray(list)) return [];
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
  return request('/api/notifications', {
    fallback: () => ({ items: [], unreadCount: 0 })
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
  createPaymentOrder,
  prepayOrder,
  mockPayOrder,
  getPaymentOrders,
  addCommunityComment,
  addCookHistory,
  addPantryItem,
  addShoppingItem,
  createCommunityPost,
  deletePantryItem,
  deleteShoppingItem,
  generateWeeklyMenu,
  getCommunityPosts,
  getCommunityComments,
  getCommunityReports,
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
  activateVip,
  getWeeklyMenu,
  getTodayMenu,
  addTodayMenuRecipe,
  removeTodayMenuRecipe,
  getWishes,
  addWish,
  removeWish,
  getShoppingList,
  rebuildShoppingList,
  toggleShoppingPurchased,
  reportCommunityPost,
  reviewCommunityReport,
  toggleCommunityFavorite,
  previewJoinFamily,
  joinFamily,
  addFamilyMember,
  removeFamilyMember,
  updateProfile,
  guestLogin,
  requestPhoneOtp,
  loginWithOtp,
  previewImport,
  markNotificationsRead,
  saveRecipe,
  setAuthToken,
  submitFeedback,
  updateRecipe,
  wechatLogin
};
