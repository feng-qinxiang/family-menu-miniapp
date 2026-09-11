/**
 * 微信隐私接口封装
 *
 * 背景：2023 年 9 月起，小程序在调用相册、剪贴板等「隐私接口」前必须先取得用户同意，
 * 否则调用会直接失败（errno 112 / api scope is not declared）。涉及本项目的接口：
 *   相册相机 wx.chooseMedia、剪贴板 wx.setClipboardData / wx.getClipboardData
 *
 * 本模块提供两件事：
 *   ensurePrivacy(action)      —— 任意隐私接口调用前的授权闸门
 *   copyText(data, ok, fail)   —— 写剪贴板（它本身就是隐私接口，所以收在这里，顺带统一全站复制逻辑）
 *
 * 为什么用微信官方弹窗、不自己画弹窗：
 *   官方弹窗的内容直接取自 mp 后台「用户隐私保护指引」，和后台声明的项天然一致；
 *   一旦注册 onNeedPrivacyAuthorization 就必须自己画弹窗、自己调 resolve，
 *   还要在全局回调里跟页面组件联动，风险与代码量都更高，收益为零。
 *   所以这里刻意不注册该回调 —— 未注册时微信会自己弹官方弹窗。
 *
 * 兼容：基础库低于 2.32.3 时没有这个接口，直接放行交给微信兜底处理。
 */

/** 当前环境是否支持隐私授权接口 */
function supported() {
  return typeof wx !== 'undefined' && typeof wx.requirePrivacyAuthorize === 'function';
}

/**
 * 确保隐私授权已完成，再执行 action。
 * 已同意过时微信会直接回调 success，不会重复弹窗（所以多接几处不增加打扰）。
 *
 * @param {Function} action      授权通过后要执行的动作
 * @param {Function} [onDenied]  用户拒绝时的回调；默认给一条明确提示，避免「点了没反应」
 */
function ensurePrivacy(action, onDenied) {
  if (typeof action !== 'function') return;
  if (!supported()) {
    action();
    return;
  }
  wx.requirePrivacyAuthorize({
    success() {
      action();
    },
    fail() {
      if (typeof onDenied === 'function') {
        onDenied();
      } else {
        wx.showToast({ title: '需同意隐私保护指引后才能使用该功能', icon: 'none' });
      }
    }
  });
}

/**
 * 写剪贴板。剪切板属隐私接口，所以与 ensurePrivacy 放在同一模块，顺带统一全站复制逻辑
 * （原先 5 个页面各写一遍 setClipboardData + 两条提示）。
 *
 * 成功/失败都由调用方决定提示：各页统一用 state-toast 组件，样式才一致。
 *
 * @param {string} data        要复制的内容；为空视为失败
 * @param {Function} [onOk]    复制成功回调
 * @param {Function} [onFail]  复制失败回调
 */
function copyText(data, onOk, onFail) {
  if (!data) {
    if (typeof onFail === 'function') onFail();
    return;
  }
  ensurePrivacy(() => {
    wx.setClipboardData({
      data: String(data),
      success() {
        if (typeof onOk === 'function') onOk();
      },
      fail() {
        if (typeof onFail === 'function') onFail();
      }
    });
  }, () => {
    // 拒绝授权不等于复制失败，不能复用同一句提示误导用户
    wx.showToast({ title: '需同意隐私保护指引后才能复制', icon: 'none' });
  });
}

module.exports = { ensurePrivacy, copyText, supported };
