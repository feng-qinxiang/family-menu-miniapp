// components/recipe-card/index.js
// 菜谱卡组件：variant="card"(纵向大卡) / "row"(横向行卡)
const FALLBACK_DISHES = [
  'beef-broccoli', 'chicken-congee', 'egg-drop-soup', 'fried-rice',
  'hongshao-pork', 'hot-sour-soup', 'kungpao-chicken', 'lo-mein',
  'long-beans', 'mapo-tofu', 'orange-chicken', 'shrimp-peas',
  'sichuan-eggplant', 'sweet-sour-chicken', 'tomato-egg', 'wontons'
];

Component({
  options: {
    addGlobalClass: true
  },

  properties: {
    recipe: {
      type: Object,
      value: {}
    },
    // card: 纵向大卡 | row: 横向行卡
    variant: {
      type: String,
      value: 'card'
    },
    showFav: {
      type: Boolean,
      value: false
    },
    showAdd: {
      type: Boolean,
      value: true
    }
  },

  data: {
    cover: '',
    title: '',
    label: '',
    timeText: '',
    metaText: '',
    favorited: false
  },

  observers: {
    recipe: function (recipe) {
      this._buildView(recipe || {});
    }
  },

  lifetimes: {
    attached() {
      this._buildView(this.data.recipe || {});
    }
  },

  methods: {
    _buildView(recipe) {
      const r = recipe || {};

      // 封面：优先后端 coverImage，兼容 cover/dishImg 别名，无则按 id/title 稳定兜底本地图
      let cover = r.coverImage || r.cover || r.dishImg;
      if (!cover) {
        const seed = String(r.id || r.title || '');
        let sum = 0;
        for (let i = 0; i < seed.length; i++) sum += seed.charCodeAt(i);
        const name = FALLBACK_DISHES[sum % FALLBACK_DISHES.length];
        cover = '/assets/dishes/' + name + '.jpg';
      }

      const tags = Array.isArray(r.tasteTags) ? r.tasteTags : [];
      const label = r.cuisine || tags[0] || '家常';
      const timeText = r.timeCost ? r.timeCost + ' 分钟' : '';

      // 行卡副信息：菜系 · 口味
      const subParts = [];
      if (r.cuisine) subParts.push(r.cuisine);
      if (tags[0] && tags[0] !== r.cuisine) subParts.push(tags[0]);
      const metaText = subParts.join(' · ');

      this.setData({
        cover: cover,
        title: r.title || '未命名菜谱',
        label: label,
        timeText: timeText,
        metaText: metaText,
        favorited: !!r.favorited
      });
    },

    onTap() {
      this.triggerEvent('tap', { recipe: this.data.recipe, id: this.data.recipe && this.data.recipe.id });
    },

    onAdd() {
      // catchtap 已阻断冒泡
      this.triggerEvent('add', { recipe: this.data.recipe, id: this.data.recipe && this.data.recipe.id });
    },

    onFav() {
      const next = !this.data.favorited;
      this.setData({ favorited: next });
      this.triggerEvent('fav', { recipe: this.data.recipe, favorited: next });
    }
  }
});
