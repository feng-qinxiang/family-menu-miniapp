/**
 * 防抖工具 — 搜索输入等高频场景使用
 */

/**
 * @param {Function} fn - 要防抖的函数
 * @param {number} delay - 延迟毫秒数，默认 300ms
 * @returns {Function} 防抖后的函数（带 .cancel() 方法）
 */
function debounce(fn, delay = 300) {
  let timer = null;
  function debounced(...args) {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => {
      timer = null;
      fn.apply(this, args);
    }, delay);
  }
  debounced.cancel = function () {
    if (timer) {
      clearTimeout(timer);
      timer = null;
    }
  };
  return debounced;
}

module.exports = { debounce };
