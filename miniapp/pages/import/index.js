const { previewImport, saveRecipe, getRecipes } = require('../../utils/api');
const { parseRecipeText, DIFFICULTY_LABELS } = require('../../utils/parser');
const { chooseAndUpload } = require('../../utils/upload');

// 本地菜图兜底池（接口清单 16 张）
const FALLBACK_DISHES = [
  'sweet-sour-chicken', 'sichuan-eggplant', 'hot-sour-soup', 'kungpao-chicken',
  'mapo-tofu', 'tomato-egg', 'hongshao-pork', 'beef-broccoli'
];

Page({
  data: {
    statusBarHeight: 0,
    activeTab: 'xhs',
    rawText: '',
    charCount: 0,
    preview: null,
    saving: false,
    recentImports: [],
    difficultyOptions: [
      { key: 'easy', label: '简单' },
      { key: 'medium', label: '中等' },
      { key: 'hard', label: '困难' }
    ]
  },

  onLoad() {
    try {
      if (typeof wx.getWindowInfo === 'function') {
        this.setData({ statusBarHeight: wx.getWindowInfo().statusBarHeight || 0 });
      } else if (typeof wx.getSystemInfoSync === 'function') {
        this.setData({ statusBarHeight: wx.getSystemInfoSync().statusBarHeight || 0 });
      }
    } catch (e) {
      this.setData({ statusBarHeight: 0 });
    }
    this.loadRecent();
  },

  async loadRecent() {
    try {
      const list = await getRecipes('imported');
      const recent = (list || []).slice(0, 5).map((r, i) => {
        const url = r.sourceUrl || '';
        const isXhs = /xiaohongshu|xhslink/i.test(url);
        return {
          id: r.id,
          title: r.title || '未命名菜谱',
          cover: r.coverImage || `/assets/dishes/${FALLBACK_DISHES[i % FALLBACK_DISHES.length]}.jpg`,
          srcLabel: isXhs ? '小红书' : (url ? '链接' : '纯文本'),
          srcType: isXhs ? 'link' : (url ? 'link' : 'text')
        };
      });
      this.setData({ recentImports: recent });
    } catch (e) {
      this.setData({ recentImports: [] });
    }
  },

  switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (tab === 'photo') {
      wx.showToast({ title: '拍照识别即将上线', icon: 'none' });
      return;
    }
    this.setData({ activeTab: tab, preview: null });
  },

  sampleText() {
    const samples = {
      xhs: [
        '分享一道超下饭的宫保鸡丁',
        'https://www.xiaohongshu.com/explore/abc123',
        '鸡腿肉 300克',
        '黄瓜 半根',
        '花生米 1小把',
        '干辣椒 5个',
        '生抽 2勺',
        '1. 鸡腿肉切丁腌10分钟',
        '2. 热锅炒鸡丁变色盛出',
        '3. 炒辣椒花椒出香',
        '4. 倒回鸡丁加宫保汁翻匀',
        '20分钟搞定 3人份'
      ].join('\n'),
      manual: [
        '蒜蓉西兰花',
        '西兰花 1颗',
        '蒜 5瓣',
        '盐 适量',
        '蚝油 1勺',
        '1. 西兰花焯水',
        '2. 蒜末爆香',
        '3. 快速翻炒加蚝油'
      ].join('\n')
    };
    const text = samples[this.data.activeTab] || samples.manual;
    this.setData({ rawText: text, charCount: text.length });
  },

  onInput(event) {
    const v = event.detail.value || '';
    this.setData({ rawText: v, charCount: v.length });
  },

  async parseImport() {
    const rawText = this.data.rawText.trim();
    if (!rawText) {
      wx.showToast({ title: '先输入内容', icon: 'none' });
      return;
    }
    const localResult = parseRecipeText(rawText);
    if (localResult) {
      this.setData({ preview: localResult });
      return;
    }
    try {
        const preview = await previewImport(rawText);
        if (!preview) {
          wx.showToast({ title: '没能解析出内容，换个格式试试', icon: 'none' });
          return;
        }
        this.setData({
          preview: {
            ...preview,
            steps: (preview.steps || []).map((s) => (typeof s === 'string' ? { text: s, image: '' } : s))
          }
        });
    } catch (err) {
      wx.showToast({ title: '解析失败，请重试', icon: 'none' });
    }
  },

  onPreviewTitleInput(e) {
    this.setData({ 'preview.title': e.detail.value });
  },

  onPreviewCuisineInput(e) {
    this.setData({ 'preview.detectedCuisine': e.detail.value });
  },

  selectDifficulty(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({
      'preview.difficulty': key,
      'preview.difficultyLabel': DIFFICULTY_LABELS[key] || '中等'
    });
  },

  async chooseCover() {
    const urls = await chooseAndUpload(1);
    if (urls.length) {
      this.setData({ 'preview.coverImage': urls[0] });
    }
  },

  removeCover() {
    this.setData({ 'preview.coverImage': '' });
  },

  async chooseStepImage(e) {
    const { index } = e.currentTarget.dataset;
    const urls = await chooseAndUpload(1);
    if (urls.length) {
      this.setData({ [`preview.steps[${index}].image`]: urls[0] });
    }
  },

  removeStepImage(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`preview.steps[${index}].image`]: '' });
  },

  openRecent(e) {
    const { id } = e.currentTarget.dataset;
    if (id) {
      wx.navigateTo({ url: `/pages/recipe-detail/index?id=${id}` });
    }
  },

  async saveImport() {
    if (this.data.saving) return;
    const preview = this.data.preview;
    if (!preview) {
      wx.showToast({ title: '先解析一次', icon: 'none' });
      return;
    }
    this.setData({ saving: true });
    let recipe;
    try {
      recipe = await saveRecipe({
        title: preview.title,
        sourceType: 'imported',
        sourceUrl: preview.sourceUrl || '',
        cuisine: preview.detectedCuisine,
        difficulty: preview.difficulty || 'medium',
        coverImage: preview.coverImage || '',
        tasteTags: ['导入', preview.isXhs ? '小红书' : '手动录入'],
        timeCost: preview.timeCost || 15,
        servings: preview.servings || 2,
        steps: (preview.steps || []).map((s) => (typeof s === 'string' ? s : (s.text || '').trim())).filter(Boolean),
        ingredients: preview.ingredients || [],
        summary: `从${preview.isXhs ? '小红书' : '文本'}导入`
      });
    } catch (err) {
      this.setData({ saving: false });
      wx.showToast({ title: '保存失败，请重试', icon: 'none' });
      return;
    }
    wx.setStorageSync('last_imported_recipe', recipe);
    this.setData({ saving: false });
    wx.showToast({ title: '已保存', icon: 'success' });
    if (recipe && recipe.id) {
      setTimeout(() => {
        wx.navigateTo({ url: `/pages/recipe-detail/index?id=${recipe.id}` });
      }, 600);
    }
  }
});
