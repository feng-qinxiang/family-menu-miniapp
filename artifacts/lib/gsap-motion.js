/* ============================================================
 * 家庭点菜 · 共享动效引擎(GSAP)
 * 演示原型专用。落地小程序时用原生动画(IntersectionObserver +
 * WXSS keyframes + setData)按相同缓动/节奏 1:1 还原。
 *
 * 用法:页面引入 gsap.min.js + ScrollTrigger.min.js + 本文件即可,
 * 通过标准 class / data 属性自动挂载,无需逐页写动画。
 *
 * 约定 class:
 *   [data-enter]            入场元素(进场错峰浮现),可加 data-enter="up|down|left|right|scale"
 *   [data-reveal]           滚动进视口时浮现(卡片/区块)
 *   [data-reveal-group]     容器:其直接子级滚动进入时错峰浮现
 *   [data-count]            数字滚动,data-count="目标值",可选 data-count-suffix
 *   [data-parallax]         视差元素(hero 图等),可选 data-parallax-amt="40"
 *   .scroll                 滚动容器(各页 phone 内的滚动区)
 * ============================================================ */
(function () {
  if (typeof gsap === 'undefined') return;
  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  gsap.defaults({ ease: 'power3.out', duration: 0.6 });

  var hasST = typeof ScrollTrigger !== 'undefined';
  if (hasST) gsap.registerPlugin(ScrollTrigger);

  // 滚动容器:各页面 phone 内是 .scroll;ScrollTrigger 需要知道 scroller
  var scroller = document.querySelector('.scroll') || window;

  function ease(map) { return reduce ? 0 : map; }

  // ---------- 1. 入场时间线:页面载入时主屏元素错峰浮现 ----------
  function playEntrance() {
    var items = gsap.utils.toArray('[data-enter]');
    if (!items.length) return;
    if (reduce) { gsap.set(items, { clearProps: 'all' }); return; }

    // 按在文档中的垂直位置排序,保证从上到下依次浮现
    items.sort(function (a, b) {
      return a.getBoundingClientRect().top - b.getBoundingClientRect().top;
    });

    items.forEach(function (el) {
      var dir = el.getAttribute('data-enter') || 'up';
      var from = { autoAlpha: 0 };
      if (dir === 'up') from.y = 28;
      else if (dir === 'down') from.y = -28;
      else if (dir === 'left') from.x = 36;
      else if (dir === 'right') from.x = -36;
      else if (dir === 'scale') { from.scale = 0.9; from.transformOrigin = '50% 50%'; }
      gsap.set(el, from);
    });

    var tl = gsap.timeline({ delay: 0.08 });
    tl.to(items, {
      autoAlpha: 1, x: 0, y: 0, scale: 1,
      duration: 0.62,
      ease: 'power3.out',
      stagger: 0.075,
      clearProps: 'transform,visibility'
    });
    return tl;
  }

  // ---------- 2. 滚动浮现:进视口的卡片/区块淡入上浮 ----------
  function bindReveal() {
    if (!hasST || reduce) {
      gsap.set('[data-reveal],[data-reveal-group] > *', { clearProps: 'all' });
      return;
    }
    // 单个元素
    gsap.utils.toArray('[data-reveal]').forEach(function (el) {
      gsap.from(el, {
        autoAlpha: 0, y: 30, duration: 0.55, ease: 'power2.out',
        scrollTrigger: { trigger: el, scroller: scroller, start: 'top 88%', toggleActions: 'play none none none' }
      });
    });
    // 容器内子级错峰
    gsap.utils.toArray('[data-reveal-group]').forEach(function (group) {
      var kids = gsap.utils.toArray(group.children);
      gsap.from(kids, {
        autoAlpha: 0, y: 26, duration: 0.5, ease: 'power2.out', stagger: 0.08,
        scrollTrigger: { trigger: group, scroller: scroller, start: 'top 85%', toggleActions: 'play none none none' }
      });
    });
  }

  // ---------- 3. 数字滚动:统计数字从 0 涨到目标 ----------
  function bindCounters() {
    gsap.utils.toArray('[data-count]').forEach(function (el) {
      var target = parseFloat(el.getAttribute('data-count')) || 0;
      var suffix = el.getAttribute('data-count-suffix') || '';
      var dec = (String(target).split('.')[1] || '').length;
      if (reduce) { el.textContent = target + suffix; return; }
      var obj = { v: 0 };
      var run = function () {
        gsap.to(obj, {
          v: target, duration: 1.1, ease: 'power2.out',
          onUpdate: function () { el.textContent = obj.v.toFixed(dec) + suffix; }
        });
      };
      if (hasST) {
        ScrollTrigger.create({ trigger: el, scroller: scroller, start: 'top 92%', once: true, onEnter: run });
      } else { run(); }
    });
  }

  // ---------- 4. 视差:hero 图随滚动轻微位移 ----------
  function bindParallax() {
    if (!hasST || reduce) return;
    gsap.utils.toArray('[data-parallax]').forEach(function (el) {
      var amt = parseFloat(el.getAttribute('data-parallax-amt')) || 36;
      gsap.to(el, {
        y: amt, ease: 'none',
        scrollTrigger: { trigger: el.parentNode, scroller: scroller, start: 'top top', end: 'bottom top', scrub: true }
      });
    });
  }

  // ---------- 5. 微交互:可点元素按下回弹 ----------
  function bindTaps() {
    if (reduce) return;
    var sel = '[data-tap],.act,.card,.cook,.cz,.hero-cta,.tab,.screen';
    document.querySelectorAll(sel).forEach(function (el) {
      el.addEventListener('touchstart', function () {
        gsap.to(el, { scale: 0.96, duration: 0.12, ease: 'power2.out' });
      }, { passive: true });
      var back = function () { gsap.to(el, { scale: 1, duration: 0.3, ease: 'back.out(2)' }); };
      el.addEventListener('touchend', back, { passive: true });
      el.addEventListener('touchcancel', back, { passive: true });
    });
  }

  function init() {
    playEntrance();
    bindReveal();
    bindCounters();
    bindParallax();
    bindTaps();
    if (hasST) setTimeout(function () { ScrollTrigger.refresh(); }, 300);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else { init(); }
})();
