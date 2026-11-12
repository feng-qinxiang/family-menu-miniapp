const { previewImport, saveRecipe, getRecipes } = require('../../utils/api');
const { parseRecipeText, DIFFICULTY_LABELS } = require('../../utils/parser');
const { chooseAndUpload } = require('../../utils/upload');
const { setLeaveGuard } = require('../../utils/interaction');
const { dishImageUrl, dishImagePath, onImgError, DISH_PLACEHOLDER } = require('../../utils/image');

Page({
  onImageError(e) { onImgError(e, this, e.currentTarget.dataset.imagePath); },
  onPreviewImageError(e) { this.setData({ [e.currentTarget.dataset.errKey]: e.currentTarget.dataset.url }); },
  data: {
    imagePlaceholder: DISH_PLACEHOLDER,
    coverFailedUrl: '',
    stepImageErrors: [],
    // 大字模式：档位由设置页写进 storage，根节点挂 .font-lg 才会吃到 --fs-mul
    fontScale: 'normal',
    statusBarHeight: 0,
    activeTab: 'xhs',
    rawText: '',
    charCount: 0,
    preview: null,
    saving: false,
    parsing: false,
    // 预览被改过且没存：切 tab、返回都要确认（syncLeave 维护）
    leaveDirty: false,
    recentImports: [],
    difficultyOptions: [
      { key: 'easy', label: '简单' },
      { key: 'medium', label: '中等' },
      { key: 'hard', label: '困难' }
    ]
  },

  onLoad() {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
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
          cover: dishImageUrl(r.coverImage) || DISH_PLACEHOLDER,
          srcLabel: isXhs ? '小红书' : (url ? '链接' : '纯文本'),
          srcType: isXhs ? 'link' : (url ? 'link' : 'text')
        };
      });
      this.setData({ recentImports: recent, recentLoadFailed: false });
    } catch (e) {
      // 不置 recentLoadFailed，WXML 里那条「加载失败，点按重试」分支就是死代码
      this.setData({ recentImports: [], recentLoadFailed: true });
    }
  },

  // ponytail: 拍照识别（OCR 截图提文字）未实现已下线入口，重做时需接入 OCR 服务再补回第三个 tab
  async switchTab(e) {
    const { tab } = e.currentTarget.dataset;
    if (!tab || tab === this.data.activeTab) return;
    // 预览改过（菜名、菜系、难度、封面、步骤图）才确认；没改过的清掉无妨，粘贴的原文还在，重新解析即可
    if (this.data.leaveDirty) {
      const res = await wx.showModal({
        title: '放弃改过的解析结果？',
        content: '切换导入方式会清空下面的预览，你改过的内容不会保留。',
        confirmText: '放弃',
        cancelText: '取消'
      });
      if (!res.confirm) return;
    }
    this.setData({ activeTab: tab, preview: null });
    this.syncLeave();
  },

  // 预览和解析出来时比有没有改动；_parsedPreview 是每次解析完的快照
  syncLeave() {
    const preview = this.data.preview;
    setLeaveGuard(this, !!preview && JSON.stringify(preview) !== this._parsedPreview);
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
    if (this.data.parsing) return;
    const rawText = this.data.rawText.trim();
    if (!rawText) {
      wx.showToast({ title: '先输入内容', icon: 'none' });
      return;
    }
    const localResult = parseRecipeText(rawText);
    // 本地能解析出食材或步骤就够用了；否则再走远端解析（后端 /api/import/preview）
    const localUsable = localResult && (
      (Array.isArray(localResult.ingredients) && localResult.ingredients.length > 0) ||
      (Array.isArray(localResult.steps) && localResult.steps.length > 0)
    );
    if (localUsable) {
      this.setData({ preview: localResult });
      // 解析结果的快照：switchTab 拿它判断用户有没有改过预览
      this._parsedPreview = JSON.stringify(this.data.preview);
      this.syncLeave();
      return;
    }
    // 远端解析：loading 期间按钮禁点防重复提交
    this.setData({ parsing: true });
    try {
        const preview = await previewImport(rawText);
        if (!preview) {
          wx.showToast({ title: '没能解析出内容，换个格式试试', icon: 'none' });
          return;
        }
        this.setData({
          preview: {
            ...preview,
            coverImage: dishImageUrl(preview.coverImage) || '',
            steps: (preview.steps || []).map((s) => (typeof s === 'string' ? { text: s, image: '' } : { ...s, image: dishImageUrl(s.image) || '' }))
          }
        });
        this._parsedPreview = JSON.stringify(this.data.preview);
        this.syncLeave();
    } catch (err) {
      wx.showToast({ title: '解析失败，请重试', icon: 'none' });
    } finally {
      this.setData({ parsing: false });
    }
  },

  onPreviewTitleInput(e) {
    this.setData({ 'preview.title': e.detail.value });
    this.syncLeave();
  },

  onPreviewCuisineInput(e) {
    this.setData({ 'preview.detectedCuisine': e.detail.value });
    this.syncLeave();
  },

  selectDifficulty(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({
      'preview.difficulty': key,
      'preview.difficultyLabel': DIFFICULTY_LABELS[key] || '中等'
    });
    this.syncLeave();
  },

  async chooseCover() {
    const urls = await chooseAndUpload(1);
    // 上传失败时 chooseAndUpload 返回 ['']，空串视为失败并提示
    if (urls.length && urls[0]) {
      this.setData({ 'preview.coverImage': urls[0] });
      this.syncLeave();
    } else if (urls.length) {
      wx.showToast({ title: '封面上传失败，请重试', icon: 'none' });
    }
  },

  removeCover() {
    this.setData({ 'preview.coverImage': '' });
    this.syncLeave();
  },

  async chooseStepImage(e) {
    const { index } = e.currentTarget.dataset;
    const urls = await chooseAndUpload(1);
    if (urls.length && urls[0]) {
      this.setData({ [`preview.steps[${index}].image`]: urls[0] });
      this.syncLeave();
    } else if (urls.length) {
      wx.showToast({ title: '图片上传失败，请重试', icon: 'none' });
    }
  },

  removeStepImage(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`preview.steps[${index}].image`]: '' });
    this.syncLeave();
  },

  openRecent(e) {
    const { id } = e.currentTarget.dataset;
    if (id) {
      wx.navigateTo({ url: `/pkg-extra/recipe-detail/index?id=${id}` });
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
        coverImage: dishImagePath(preview.coverImage) || '',
        tasteTags: ['导入', preview.isXhs ? '小红书' : '手动录入'],
        timeCost: preview.timeCost || 15,
        servings: preview.servings || 2,
        // 步骤带上配图：只传纯文本的话，用户在预览里加的步骤图保存后静默丢失（服务端 RecipeStep 收 {text,image}）
        steps: (preview.steps || [])
          .map((s) => (typeof s === 'string' ? { text: s.trim(), image: '' } : { text: (s.text || '').trim(), image: dishImagePath(s.image) || '' }))
          .filter((s) => s.text),
        ingredients: preview.ingredients || [],
        summary: `从${preview.isXhs ? '小红书' : '文本'}导入`
      });
    } catch (err) {
      this.setData({ saving: false });
      wx.showToast({ title: (err && err.message) || '保存失败，请重试', icon: 'none' });
      return;
    }
    wx.setStorageSync('last_imported_recipe', recipe);
    wx.showToast({ title: '已保存', icon: 'success' });
    // 已存好：撤掉离开确认，否则下面的跳转也会被拦
    this._parsedPreview = JSON.stringify(preview);
    this.syncLeave();
    if (recipe && recipe.id) {
      // 成功路径不复位 saving，并用 redirectTo 换掉本页：否则跳转前再点、
      // 或从详情页返回后再点「存入」，都会多出一道删不掉的重复菜谱
      this._navTimer = setTimeout(() => {
        wx.redirectTo({ url: `/pkg-extra/recipe-detail/index?id=${recipe.id}` });
      }, 600);
    } else {
      // 存成功却拿不到 id、跳不走：清掉预览，同一份内容不能再存第二次
      this.setData({ saving: false, preview: null });
    }
  },

  onUnload() {
    if (this._navTimer) {
      clearTimeout(this._navTimer);
      this._navTimer = null;
    }
  }
});
