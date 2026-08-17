// components/recipe-card/index.js
// 菜谱卡：variant=card|row；card 可叠 badge/selected/角标加菜
const FALLBACK_DISHES = [
  'beef-broccoli', 'chicken-congee', 'egg-drop-soup', 'fried-rice',
  'hongshao-pork', 'hot-sour-soup', 'kungpao-chicken', 'lo-mein',
  'long-beans', 'mapo-tofu', 'orange-chicken', 'shrimp-peas',
  'sichuan-eggplant', 'sweet-sour-chicken', 'tomato-egg', 'wontons'
];

Component({
  options: {
    addGlobalClass: true,
    // 去掉多余宿主节点，width/横滑槽直接作用在根 .rc-card / .rc-row
    virtualHost: true
  },

  properties: {
    recipe: {
      type: Object,
      value: {}
    },
    // card | row
    variant: {
      type: String,
      value: 'card'
    },
    // home 横滑宽卡 | grid 双列 | default(favorites)
    density: {
      type: String,
      value: 'default'
    },
    showFav: {
      type: Boolean,
      value: false
    },
    // row 右侧 / card 角标加菜
    showAdd: {
      type: Boolean,
      value: true
    },
    // card 加菜位置：corner 右上(home) | float 右下(recipes)
    addPlacement: {
      type: String,
      value: 'corner'
    },
    // 是否已在今日菜单（recipes 选中描边 + ✓）
    selected: {
      type: Boolean,
      value: false
    },
    // 封面角标文案，空则用 cuisine
    badge: {
      type: String,
      value: ''
    },
    // 强制副文案；空则按 density 拼
    metaOverride: {
      type: String,
      value: ''
    }
  },

  data: {
    cover: '',
    title: '',
    label: '',
    badgeText: '',
    timeText: '',
    metaText: '',
    favorited: false,
    addMark: '+'
  },

  observers: {
    'recipe, density, badge, metaOverride, selected': function () {
      this._buildView();
    }
  },

  lifetimes: {
    attached() {
      this._buildView();
    }
  },

  methods: {
    _buildView() {
      const r = this.data.recipe || {};
      const density = this.data.density || 'default';

      let cover = r.coverImage || r.cover || r.dishImg;
      if (!cover) {
        const seed = String(r.id || r.title || '');
        let sum = 0;
        for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
        cover = '/assets/dishes/' + FALLBACK_DISHES[sum % FALLBACK_DISHES.length] + '.jpg';
      }

      const tags = Array.isArray(r.tasteTags) ? r.tasteTags : [];
      const label = r.cuisine || tags[0] || '家常';
      const timeText = r.timeCost ? r.timeCost + ' 分钟' : '';

      let metaText = this.data.metaOverride || '';
      if (!metaText) {
        if (density === 'grid') {
          const parts = [
            r.cuisine || '家常',
            (r.timeCost || '?') + '分钟',
            (r.servings || '?') + '人'
          ];
          metaText = parts.join(' · ');
        } else if (density === 'home') {
          const parts = [];
          if (timeText) parts.push(timeText);
          parts.push(tags[0] || r.sourceLabel || '下饭快手');
          metaText = parts.join(' · ');
        } else if (this.data.variant === 'row') {
          const subParts = [];
          if (r.cuisine) subParts.push(r.cuisine);
          if (tags[0] && tags[0] !== r.cuisine) subParts.push(tags[0]);
          metaText = subParts.join(' · ');
        } else {
          const subParts = [];
          if (timeText) subParts.push(timeText);
          if (r.cuisine) subParts.push(r.cuisine);
          metaText = subParts.join(' · ');
        }
      }

      const badgeProp = this.data.badge;
      const badgeText = badgeProp !== '' && badgeProp != null
        ? badgeProp
        : (r.sourceLabel || '');

      this.setData({
        cover: cover,
        title: r.title || '未命名菜谱',
        label: label,
        badgeText: badgeText,
        timeText: timeText,
        metaText: metaText,
        favorited: !!r.favorited,
        addMark: this.data.selected ? '✓' : '+'
      });
    },

    onTap() {
      const r = this.data.recipe || {};
      this.triggerEvent('tap', { recipe: r, id: r.id });
    },

    onAdd() {
      const r = this.data.recipe || {};
      this.triggerEvent('add', { recipe: r, id: r.id });
    },

    onFav() {
      const next = !this.data.favorited;
      this.setData({ favorited: next });
      this.triggerEvent('fav', { recipe: this.data.recipe, favorited: next });
    }
  }
});