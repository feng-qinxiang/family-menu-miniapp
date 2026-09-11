/**
 * 微信订阅消息（客户端侧）
 *
 * 能力边界要先说清楚：一次性订阅的规矩是「用户在客户端同意一次，服务端才能发一条」。
 * 所以这里做两件事——申请授权（攒配额）与同步开关（愿不愿意收）。
 * 真正发送在后端（NotificationService 写站内信时顺带推送）。
 *
 * 两个容易踩的坑，都在这里处理掉了：
 *
 * 1) wx.requestSubscribeMessage 必须在用户点击手势里同步调用。
 *    如果先 await 一个网络请求再调，手势已经失效，微信会直接报错。
 *    所以这里不在申请前发请求：设置用 preload() 在 onLoad 时预热并缓存，
 *    apply() 全程同步走到 wx 调用，只在结果回传时才异步。
 *
 * 2) 高频操作每次都弹窗会烦人。
 *    同一事件 24 小时内只问一次（用户在弹窗里勾了"总是保持以上选择"之后，
 *    微信本来也不会再弹，这里只是替没勾的用户兜一层）。
 *    设置页的开关属于用户明确操作，走 force 跳过节流。
 *
 * 模板 ID 不给前端写死：由后端随设置一起下发（GET /api/notifications/subscribe），
 * 避免模板 ID 在小程序与服务器各存一份、改一处忘一处。
 */

const api = require('./api');

/** 节流记录：{ wish: 上次申请时间戳, meal: ... } */
const APPLY_KEY = 'subscribe_apply_v1';
const APPLY_INTERVAL = 24 * 60 * 60 * 1000;

/** 最近一次拉到的设置；页面 onLoad 时 preload() 预热，申请授权时同步读取 */
let cached = null;

/** 事件类型 → 设置里 templates 的键；'all' 表示两个都要 */
function templateIds(setting, kind) {
  const templates = (setting && setting.templates) || {};
  const keys = kind === 'all' ? ['wish', 'meal'] : [kind];
  return keys.map((k) => templates[k]).filter((id) => !!id);
}

function readApplied() {
  try {
    const raw = wx.getStorageSync(APPLY_KEY);
    return raw && typeof raw === 'object' ? raw : {};
  } catch (e) {
    return {};
  }
}

function markApplied(kindList) {
  try {
    const applied = readApplied();
    const now = Date.now();
    kindList.forEach((k) => { applied[k] = now; });
    wx.setStorageSync(APPLY_KEY, applied);
  } catch (e) {
    // 记不上就退化成"每次都问"，不影响功能正确性
  }
}

function throttled(kindList) {
  const applied = readApplied();
  const now = Date.now();
  return kindList.every((k) => applied[k] && now - applied[k] < APPLY_INTERVAL);
}

/**
 * 预热：拉一次设置并缓存。失败按"功能不可用"处理（页面据此隐藏开关）。
 * 建议在相关页面的 onLoad 调用；模块级缓存，整个会话只会真正请求一次。
 */
function preload(force) {
  if (cached && !force) {
    return Promise.resolve(cached);
  }
  // 后端未配模板时返回 available=false，这里不做特殊处理，交给调用方判断
  return api.getSubscribeSetting({ fallback: () => ({ available: false, enabled: false, templates: {} }) })
    .then((setting) => {
      cached = setting || { available: false, enabled: false, templates: {} };
      return cached;
    })
    .catch(() => {
      cached = { available: false, enabled: false, templates: {} };
      return cached;
    });
}

/**
 * 申请订阅授权。必须在用户点击的回调里调用。
 *
 * @param {string}  kind        'wish' | 'meal' | 'all'
 * @param {boolean} [force]     true = 跳过 24 小时节流（用户明确点了开关时用）
 * @returns {Promise<boolean>}  是否至少拿到一个模板的授权（全被拒 = false）
 */
function apply(kind, force) {
  const setting = cached;
  if (!setting || !setting.available) {
    return Promise.resolve(false);
  }
  const ids = templateIds(setting, kind);
  if (!ids.length) {
    return Promise.resolve(false);
  }
  if (typeof wx === 'undefined' || typeof wx.requestSubscribeMessage !== 'function') {
    return Promise.resolve(false); // 基础库过低：不支持就当作没拿到授权，不报错
  }

  const kindList = kind === 'all' ? ['wish', 'meal'] : [kind];
  if (!force && throttled(kindList)) {
    return Promise.resolve(false);
  }

  // 注意：这里到 wx.requestSubscribeMessage 之间不能有任何异步等待，否则点击手势失效
  return new Promise((resolve) => {
    wx.requestSubscribeMessage({
      tmplIds: ids,
      success(res) {
        markApplied(kindList);
        // 用户可能只同意其中一部分，拿到一个就够用了
        resolve(ids.some((id) => res && res[id] === 'accept'));
      },
      fail(err) {
        // 20004：用户在"设置-订阅消息"里关掉了总开关，属于用户意愿，不提示不重试
        console.warn('[subscribe] requestSubscribeMessage failed', err);
        resolve(false);
      }
    });
  });
}

/**
 * 写用户开关。
 * 打开前必须先 apply() 拿到授权，否则会出现"开关开着但一条也发不出去"的假象。
 * 返回写入后的服务端设置，页面直接用它回填 UI。
 */
function setEnabled(value) {
  return api.updateSubscribe(!!value).then((setting) => {
    cached = setting || cached;
    return cached;
  });
}

module.exports = { preload, apply, setEnabled };
