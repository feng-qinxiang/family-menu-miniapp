// pages/showcase · Awwwards 风格概念页
// 动效方案：scroll 驱动 reveal（ins 数组）+ 数字滚动（nums 数组）+ 进度条 + canvas 光斑
Page({
  data: {
    ins: [],      // reveal 入场标记（g-reveal 逐个）
    nums: [0, 0, 0, 0, 0, 0, 0],  // 7 个滚动数字
    barA: 0,
    barB: 0,
    barC: 0,
    pastHero: false
  },

  onReady() {
    this.initCanvas();
    this.collectReveals();
  },

  onUnload() {
    if (this._raf && this._canvas) this._canvas.cancelAnimationFrame(this._raf);
  },

  /* ---------- 背景光斑 canvas ---------- */
  initCanvas() {
    const query = this.createSelectorQuery();
    query.select('#fx').fields({ node: true, size: true }).exec(res => {
      const info = res && res[0];
      if (!info || !info.node) return;
      const canvas = info.node;
      this._canvas = canvas;
      const ctx = canvas.getContext('2d');
      const dpr = wx.getSystemInfoSync().pixelRatio || 2;
      canvas.width = info.width * dpr;
      canvas.height = info.height * dpr;
      ctx.scale(dpr, dpr);

      const W = info.width, H = info.height;
      const orbs = [];
      for (let i = 0; i < 18; i++) {
        orbs.push({
          hx: Math.random() * W, hy: Math.random() * H,
          r: 50 + Math.random() * 150,
          vx: (Math.random() - 0.5) * 0.2,
          vy: (Math.random() - 0.5) * 0.2
        });
      }
      const draw = () => {
        ctx.clearRect(0, 0, W, H);
        for (const o of orbs) {
          o.hx += o.vx; o.hy += o.vy;
          if (o.hx < -100 || o.hx > W + 100) o.vx *= -1;
          if (o.hy < -100 || o.hy > H + 100) o.vy *= -1;
          const g = ctx.createRadialGradient(o.hx, o.hy, 0, o.hx, o.hy, o.r);
          g.addColorStop(0, 'rgba(255,74,34,0.05)');
          g.addColorStop(0.6, 'rgba(255,74,34,0.018)');
          g.addColorStop(1, 'rgba(255,74,34,0)');
          ctx.fillStyle = g;
          ctx.beginPath();
          ctx.arc(o.hx, o.hy, o.r, 0, 6.2832);
          ctx.fill();
        }
        this._raf = canvas.requestAnimationFrame(draw);
      };
      draw();
    });
  },

  /* ---------- 收集 reveal 元素位置 ---------- */
  collectReveals() {
    this._tops = [];
    this.createSelectorQuery()
      .selectAll('.g-reveal')
      .boundingClientRect(rects => {
        this._tops = (rects || []).map(r => r.top);
      })
      .exec(() => {
        // 首屏立即触发一次
        this.onScroll({ detail: { scrollTop: 0 } });
      });
  },

  onScroll(e) {
    const sy = e.detail.scrollTop;
    if (sy > 400) {
      if (!this.data.pastHero) this.setData({ pastHero: true });
    } else if (this.data.pastHero) {
      this.setData({ pastHero: false });
    }

    // reveal 判断：元素 top(相对视口首屏) + scrollTop < 屏高*0.92 → 入场
    if (this._tops && this._tops.length) {
      const vh = wx.getWindowInfo ? wx.getWindowInfo().windowHeight : 700;
      let changed = false;
      const ins = this.data.ins.slice();
      this._tops.forEach((t, i) => {
        if (!ins[i] && t - sy < vh * 0.9) { ins[i] = true; changed = true; }
      });
      if (changed) this.setData({ ins });
    }

    // 数字滚动：hero 数字到顶即滚，冰箱数字进入视口再滚
    if (!this._n1 && sy > 60) {
      this._n1 = true;
      this.runCounts([11, 4, 98, 0], 0);
    }
    if (!this._n2 && this._tops[16] !== undefined && this._tops[16] - sy < vh * 0.85) {
      this._n2 = true;
      this.runCounts([23, 4, 3], 4);
    }

    // 冰箱进度条
    if (!this._bars && this._tops[16] !== undefined && this._tops[16] - sy < vh * 0.85) {
      this._bars = true;
      this.setData({ barA: 76, barB: 13, barC: 10 });
    }
  },

  runCounts(targets, offset) {
    const start = Date.now();
    const dur = 1400;
    const tick = () => {
      const p = Math.min(1, (Date.now() - start) / dur);
      const ease = 1 - Math.pow(1 - p, 3);
      const patch = {};
      targets.forEach((t, i) => { patch['nums[' + (offset + i) + ']'] = Math.round(t * ease); });
      this.setData(patch);
      if (p < 1) setTimeout(tick, 16);
    };
    tick();
  },

  scrollTop() {
    this.setData({ _top: Date.now() });
    const sv = this.selectComponent && this;
    // scroll-view 回顶：切换 scroll-top 触发
    if (this._st === undefined) this._st = 0;
    this._st = this._st ? 0 : 0.001;
    this.setData({ st: this._st });
  },

  goBack() { wx.navigateBack({ fail: () => wx.switchTab({ url: '/pages/home/index' }) }); },
  goMenu() { wx.navigateTo({ url: '/pages/menu/index' }); },
  goWeekly() { wx.navigateTo({ url: '/pages/weekly-menu/index' }); },
  goMe() { wx.switchTab({ url: '/pages/me/index' }); }
});
