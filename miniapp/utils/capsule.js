/**
 * 胶囊（右上角按钮）避让 —— 全站唯一实现。
 *
 * 此前 home / recipes / me / menu / search 各抄了一份，且兜底值互不相同
 * （'51px' / '91px' / 96 / 'calc(env(safe-area-inset-top) + 90rpx)'），
 * 量不到胶囊时有的页面直接拿到空值，真机上表现为「首帧偏位再跳正」。
 * 统一规则：量得到就用真实值；量不到一律回落到带安全区的 calc，右侧留 96px。
 */

const FALLBACK_TOP = 'calc(env(safe-area-inset-top) + 90rpx)';
const FALLBACK_BOTTOM = 'calc(env(safe-area-inset-top) + 178rpx)';
const FALLBACK_RIGHT = '96px';
const FALLBACK_RIGHT_NUM = 96;

function empty() {
  return { top: FALLBACK_TOP, bottom: FALLBACK_BOTTOM, right: FALLBACK_RIGHT, rightNum: FALLBACK_RIGHT_NUM };
}

function getCapsule() {
  try {
    const mb = wx.getMenuButtonBoundingClientRect();
    const sys = (wx.getWindowInfo && wx.getWindowInfo()) || wx.getSystemInfoSync() || {};
    if (!mb || !mb.left || !sys.windowWidth) return empty();
    const rightNum = sys.windowWidth - mb.left + 8;
    return {
      top: mb.top + 'px',
      bottom: (mb.bottom + 8) + 'px',
      right: rightNum + 'px',
      rightNum
    };
  } catch (e) {
    return empty();
  }
}

module.exports = { getCapsule };
