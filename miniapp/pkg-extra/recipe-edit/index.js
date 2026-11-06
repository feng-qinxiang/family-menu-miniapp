const { getRecipeDetail, saveRecipe, updateRecipe } = require('../../utils/api');
const { chooseImage, chooseVideo, uploadFile } = require('../../utils/upload');
const { LOCAL_DISHES, recipeDishImg } = require('../../utils/image');
const { cuisineList } = require('../../utils/constants');
const { setLeaveGuard } = require('../../utils/interaction');

const PICKER_IMAGES = LOCAL_DISHES.map((file) => `/assets/dishes/${file}.jpg`);

const DIFFICULTY_OPTIONS = [
  { key: 'easy', label: '简单' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '困难' }
];

// 与全站 constants.cuisineList 保持一致（家常排最前），避免编辑鲁菜/西餐/日料时无原值可选
const CUISINE_OPTIONS = ['家常'].concat(cuisineList.filter((c) => c !== '家常'));

Page({
  data: {
    // 大字模式：档位由设置页写进 storage，根节点挂 .font-lg 才会吃到 --fs-mul
    fontScale: 'normal',
    isEdit: false,
    recipeId: null,
    difficultyOptions: DIFFICULTY_OPTIONS,
    cuisineOptions: CUISINE_OPTIONS,
    tipText: '',
    form: {
      title: '',
      cuisine: '',
      timeCost: 15,
      servings: 2,
      difficulty: 'medium',
      coverImage: '',
      tasteTags: [],
      summary: '',
      ingredients: [{ name: '', amount: '', unit: '' }],
      videoUrl: '',
      steps: [{ text: '', image: '' }]
    },
    tasteTagsText: '',
    formQuality: {
      ingredientCount: 1,
      stepCount: 1,
      hasSummary: false,
      readyText: ''
    },
    previewInfo: {
      title: '未命名',
      meta: '— · 15分钟 · 2人',
      desc: ''
    },
    commonTags: [
      { name: '下饭', active: false },
      { name: '快手', active: false },
      { name: '清淡', active: false },
      { name: '儿童友好', active: false },
      { name: '宴客', active: false },
      { name: '低脂', active: false }
    ],
    saving: false,
    // 编辑模式下原菜谱没拉到：此时表单是空的，保存（PUT）会把原菜谱整条覆盖掉，必须拦住
    loadFailed: false,
    // 表单和打开时比有改动：返回要确认（setLeaveGuard 维护）
    leaveDirty: false,
    editTab: 'info',
    editingStep: -1,
    tagsLabel: '未选',
    pickSheet: { visible: false, mode: 'cuisine' },
    mediaSheet: { visible: false, mode: 'image', index: 0 },
    // 上传失败的暂存：失败后不再只弹 toast 就把用户刚选的图丢掉，
    // 而是留下面板和原临时路径，给一个「重试」入口（tempPath 不能落库，但可以重传）。
    pendingUpload: null,
    uploading: false,
    pickerImages: PICKER_IMAGES
  },

  onLoad(options) {
    let fontScale = 'normal';
    try { fontScale = wx.getStorageSync('font_scale') || 'normal'; } catch (e) { fontScale = 'normal'; }
    if (fontScale !== this.data.fontScale) this.setData({ fontScale });
    if (options.id) {
      // 编辑模式：先遮罩加载，避免空表单闪变后被数据覆盖
      this.setData({ isEdit: true, recipeId: options.id, pageLoading: true });
      this.loadRecipe(options.id);
    } else {
      // 从「菜谱搜索一条都没命中 → 新建这道菜」跳来时带上菜名（options.title）：
      // 心愿里写的是什么，表单里就填什么——省掉一次"刚看完那个词、再打字一遍"。
      const prefillTitle = options && options.title ? String(options.title).trim().slice(0, 64) : '';
      if (prefillTitle) {
        this.setData({ 'form.title': prefillTitle });
      }
      this._baseline = JSON.stringify(this.data.form);
      this.refreshQuality();
    }
  },

  async loadRecipe(id) {
    let recipe;
    try {
      recipe = await getRecipeDetail(id);
    } catch (err) {
      this.setData({ pageLoading: false, loadFailed: true });
      wx.showToast({ title: '菜谱加载失败', icon: 'none' });
      return;
    }
    if (!recipe) {
      this.setData({ pageLoading: false, loadFailed: true });
      return;
    }
    // 服务端已返回结构化步骤 {text,image,video}，表单直接用同构对象
    const steps = (recipe.steps && recipe.steps.length)
      ? recipe.steps.map((s) => ({
          text: (s && s.text) || '',
          image: (s && s.image) || '',
          video: (s && s.video) || ''
        }))
      : [{ text: '', image: '' }];
    const form = {
      title: recipe.title || '',
      cuisine: recipe.cuisine || '',
      timeCost: recipe.timeCost || 15,
      servings: recipe.servings || 2,
      difficulty: recipe.difficulty || 'medium',
      coverImage: recipe.coverImage || recipeDishImg(recipe) || '',
      tasteTags: recipe.tasteTags || [],
      summary: recipe.summary || '',
      ingredients: (recipe.ingredients && recipe.ingredients.length)
        ? recipe.ingredients
        : [{ name: '', amount: '', unit: '' }],
      videoUrl: (steps.find((st) => st.video) || {}).video || recipe.videoUrl || '',
      steps
    };
    this.setData({
      form,
      tasteTagsText: form.tasteTags.join(','),
      tagsLabel: this.labelForTags(form.tasteTags),
      commonTags: this.buildCommonTags(form.tasteTags),
      pageLoading: false,
      loadFailed: false
    });
    this._baseline = JSON.stringify(this.data.form);
    this.refreshQuality();
  },

  // 加载失败的重试入口（页内提示行和保存拦截弹窗共用）
  retryLoad() {
    if (!this.data.recipeId) return;
    this.setData({ pageLoading: true });
    this.loadRecipe(this.data.recipeId);
  },

  // 校验失败时把用户带到出问题的那一页：菜名/菜系在「介绍」，食材在「用料」，
  // 步骤在「步骤」。只弹 toast 的话，人在「用料」页却被「介绍」页的字段拦住，找不到要改哪。
  jumpToTab(tab) {
    if (this.data.editTab === tab) return;
    this.setData({ editTab: tab, editingStep: -1 });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  switchTab(e) {
    const tab = e.currentTarget.dataset.tab;
    if (!tab || tab === this.data.editTab) return;
    this.setData({ editTab: tab, editingStep: -1 });
    wx.pageScrollTo({ scrollTop: 0, duration: 0 });
  },

  onInput(e) {
    const { field } = e.currentTarget.dataset;
    const value = e.detail.value;
    this.setData({ [`form.${field}`]: value });
    this.refreshQuality();
  },

  selectDifficulty(e) {
    const { key } = e.currentTarget.dataset;
    this.setData({ 'form.difficulty': key });
    this.syncLeave();
  },

  selectCuisine(e) {
    const { value } = e.currentTarget.dataset;
    this.setData({
      'form.cuisine': value,
      'pickSheet.visible': false
    });
    this.refreshQuality();
  },

  openCuisineSheet() {
    this.setData({ pickSheet: { visible: true, mode: 'cuisine' } });
  },

  openTagSheet() {
    this.setData({ pickSheet: { visible: true, mode: 'tags' } });
  },

  closePickSheet() {
    this.setData({ 'pickSheet.visible': false });
  },

  labelForTags(tags) {
    const list = (tags || []).filter(Boolean);
    return list.length ? list.join('、') : '未选';
  },

  stepperChange(e) {
    const { field, delta } = e.currentTarget.dataset;
    const min = field === 'timeCost' ? 1 : 1;
    const step = field === 'timeCost' ? 5 : 1;
    const current = Number(this.data.form[field]) || min;
    const next = Math.max(min, current + Number(delta) * step);
    this.setData({ [`form.${field}`]: next });
    this.refreshQuality();
  },

  chooseCover() {
    const cover = this.data.form.coverImage || '';
    const pickerImages = (cover && PICKER_IMAGES.indexOf(cover) < 0)
      ? [cover].concat(PICKER_IMAGES)
      : PICKER_IMAGES;
    this.setData({
      pickerImages,
      mediaSheet: { visible: true, mode: 'cover', index: 0 }
    });
  },

  async removeCover() {
    // 有内容才确认（下面四个删除同理）：删错了没有撤销，空行空图直接删不打扰
    if (this.data.form.coverImage) {
      const res = await wx.showModal({ title: '移除封面？', confirmText: '移除', cancelText: '取消' });
      if (!res.confirm) return;
    }
    this.setData({ 'form.coverImage': '' });
    this.syncLeave();
  },

  toggleCommonTag(e) {
    const { tag } = e.currentTarget.dataset;
    const current = this.data.form.tasteTags || [];
    const next = current.includes(tag) ? current.filter((item) => item !== tag) : current.concat(tag);
    this.setData({
      'form.tasteTags': next,
      tasteTagsText: next.join(','),
      tagsLabel: this.labelForTags(next),
      commonTags: this.buildCommonTags(next)
    });
    this.refreshQuality();
  },

  buildCommonTags(activeTags) {
    const activeSet = activeTags || [];
    return this.data.commonTags.map((tag) => {
      const name = tag.name || tag;
      return { name, active: activeSet.includes(name) };
    });
  },

  onIngredientInput(e) {
    const { index, field } = e.currentTarget.dataset;
    this.setData({ [`form.ingredients[${index}].${field}`]: e.detail.value });
    this.refreshQuality();
  },

  addIngredient() {
    const ingredients = this.data.form.ingredients.concat([{ name: '', amount: '', unit: '' }]);
    this.setData({ 'form.ingredients': ingredients });
    this.refreshQuality();
  },

  async removeIngredient(e) {
    const { index } = e.currentTarget.dataset;
    const row = this.data.form.ingredients[Number(index)] || {};
    if (row.name || row.amount || row.unit) {
      const res = await wx.showModal({ title: '删除这一行食材？', confirmText: '删除', cancelText: '取消' });
      if (!res.confirm) return;
    }
    const ingredients = this.data.form.ingredients.filter((_, i) => i !== Number(index));
    this.setData({ 'form.ingredients': ingredients.length ? ingredients : [{ name: '', amount: '', unit: '' }] });
    this.refreshQuality();
  },

  onStepInput(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`form.steps[${index}].text`]: e.detail.value });
    this.refreshQuality();
  },

  editStep(e) {
    this.setData({ editingStep: Number(e.currentTarget.dataset.index) });
  },

  blurStep() {
    this.setData({ editingStep: -1 });
  },

  chooseStepImage(e) {
    const index = Number(e.currentTarget.dataset.index);
    const cover = this.data.form.coverImage || '';
    const pickerImages = (cover && PICKER_IMAGES.indexOf(cover) < 0)
      ? [cover].concat(PICKER_IMAGES)
      : PICKER_IMAGES;
    this.setData({
      pickerImages,
      mediaSheet: { visible: true, mode: 'image', index }
    });
  },

  async removeStepImage(e) {
    const { index } = e.currentTarget.dataset;
    if ((this.data.form.steps[Number(index)] || {}).image) {
      const res = await wx.showModal({ title: '移除这一步的配图？', confirmText: '移除', cancelText: '取消' });
      if (!res.confirm) return;
    }
    this.setData({ [`form.steps[${index}].image`]: '' });
    this.syncLeave();
  },

  chooseLessonVideo() {
    this.setData({
      mediaSheet: { visible: true, mode: 'video', index: 0 }
    });
  },

  closeMediaSheet() {
    // 关面板即放弃这次失败的上传：临时路径留着也没入口再用，下次选图会产生新的
    this.setData({ 'mediaSheet.visible': false, pendingUpload: null });
  },

  pickLocalImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (this.data.mediaSheet.mode === 'cover') {
      this.setData({ 'form.coverImage': url, 'mediaSheet.visible': false });
      this.syncLeave();
      return;
    }
    const index = this.data.mediaSheet.index;
    this.setData({
      [`form.steps[${index}].image`]: url,
      'mediaSheet.visible': false
    });
    this.syncLeave();
  },

  // 统一的「传完落地」：成功才写进表单并关面板；失败留 pendingUpload 供重试。
  // 三个入口（封面 / 步骤图 / 视频）共用，避免各自维护一份「失败只弹 toast」的分支。
  _applyUpload(tempPath, url) {
    if (!url) {
      this.setData({ pendingUpload: { tempPath, mode: this.data.mediaSheet.mode }, uploading: false });
      wx.showToast({ title: '上传失败，可点重试', icon: 'none' });
      return;
    }
    const mode = this.data.mediaSheet.mode;
    if (mode === 'video') {
      this.setData({ 'form.videoUrl': url, 'mediaSheet.visible': false, pendingUpload: null, uploading: false });
      this.syncLeave();
      return;
    }
    if (mode === 'cover') {
      this.setData({ 'form.coverImage': url, 'mediaSheet.visible': false, pendingUpload: null, uploading: false });
      this.syncLeave();
      return;
    }
    const index = this.data.mediaSheet.index;
    this.setData({
      [`form.steps[${index}].image`]: url,
      'mediaSheet.visible': false,
      pendingUpload: null,
      uploading: false
    });
    this.syncLeave();
  },

  // 真的在传：给 loading 反馈，防止网络慢时用户以为没反应又点一次
  _uploadTemp(tempPath) {
    this.setData({ uploading: true });
    wx.showLoading({ title: '上传中', mask: true });
    return uploadFile(tempPath).then((url) => {
      wx.hideLoading();
      this._applyUpload(tempPath, url);
    });
  },

  async pickImageFromAlbum() {
    if (this.data.uploading) return;
    const paths = await chooseImage(1);
    if (!paths.length || !paths[0]) return; // 用户取消，不提示
    return this._uploadTemp(paths[0]);
  },

  // 上传失败后的重试：复用原临时路径，不必让用户重挑一次
  retryUpload() {
    const pending = this.data.pendingUpload;
    if (!pending || !pending.tempPath || this.data.uploading) return;
    return this._uploadTemp(pending.tempPath);
  },

  async pickVideoFromAlbum() {
    if (this.data.uploading) return;
    const path = await chooseVideo();
    if (!path) {
      wx.showToast({ title: '没有选到视频', icon: 'none' });
      return;
    }
    return this._uploadTemp(path);
  },

  async removeLessonVideo() {
    if (this.data.form.videoUrl) {
      const res = await wx.showModal({ title: '移除教学视频？', confirmText: '移除', cancelText: '取消' });
      if (!res.confirm) return;
    }
    this.setData({ 'form.videoUrl': '' });
    this.syncLeave();
  },

  addStep() {
    const steps = this.data.form.steps.concat([{ text: '', image: '' }]);
    this.setData({ 'form.steps': steps, editingStep: steps.length - 1 });
    this.refreshQuality();
  },

  async removeStep(e) {
    const { index } = e.currentTarget.dataset;
    const step = this.data.form.steps[Number(index)] || {};
    if ((step.text && step.text.trim()) || step.image) {
      const res = await wx.showModal({ title: `删除第 ${Number(index) + 1} 步？`, confirmText: '删除', cancelText: '取消' });
      if (!res.confirm) return;
    }
    const steps = this.data.form.steps.filter((_, i) => i !== Number(index));
    this.setData({ 'form.steps': steps.length ? steps : [{ text: '', image: '' }] });
    this.refreshQuality();
  },

  refreshQuality() {
    const form = this.data.form;
    const ingredientCount = (form.ingredients || []).filter((item) => item.name && item.name.trim()).length;
    const stepCount = (form.steps || []).filter((item) => item.text && item.text.trim()).length;
    const hasTitle = !!(form.title && form.title.trim());
    const hasCuisine = !!(form.cuisine && form.cuisine.trim());
    const hasSummary = !!(form.summary && form.summary.trim());
    let readyText = '';
    if (hasTitle && hasCuisine && ingredientCount && stepCount) {
      readyText = hasSummary ? '可以保存' : '可以保存';
    }
    let tipText = '';
    if (!hasTitle) {
      tipText = '还没写菜名';
    } else if (!hasCuisine) {
      tipText = '选个菜系';
    } else if (!ingredientCount) {
      tipText = '至少加一种食材';
    } else if (!stepCount) {
      tipText = '至少加一步做法';
    }
    this.setData({
      formQuality: { ingredientCount, stepCount, hasSummary, readyText },
      tipText,
      previewInfo: this.buildPreviewInfo(form)
    });
    // 文字、用料、步骤、标签、份量的改动都经过这里，顺手判一次有没有没保存的修改
    this.syncLeave();
  },

  // 和打开时的表单比；_baseline 没有（原菜谱没加载出来，保存本来就拦着）就不拦返回
  syncLeave() {
    if (this._baseline === undefined) return;
    setLeaveGuard(this, JSON.stringify(this.data.form) !== this._baseline);
  },

  buildPreviewInfo(form) {
    const title = (form.title || '').trim() || '未命名';
    const cuisine = (form.cuisine || '').trim() || '—';
    const timeCost = form.timeCost || 15;
    const servings = form.servings || 2;
    const diffLabel = DIFFICULTY_OPTIONS.find((d) => d.key === form.difficulty);
    const desc = (form.summary || '').trim();
    return {
      title,
      meta: `${cuisine} · ${timeCost}分钟 · ${servings}人 · ${diffLabel ? diffLabel.label : '中等'}`,
      desc
    };
  },

  async submit() {
    if (this.data.saving) return;
    if (this.data.loadFailed) {
      const res = await wx.showModal({
        title: '原菜谱还没加载出来',
        content: '现在保存会用这张空表单覆盖原菜谱。先重新加载一次？',
        confirmText: '重新加载',
        cancelText: '取消'
      });
      if (res.confirm) this.retryLoad();
      return;
    }
    this.setData({ saving: true });
    const { form, isEdit, recipeId } = this.data;
    if (!form.title.trim()) {
      this.setData({ saving: false });
      this.jumpToTab('info');
      wx.showToast({ title: '请输入菜名', icon: 'none' });
      return;
    }
    if (!form.cuisine.trim()) {
      this.setData({ saving: false });
      this.jumpToTab('info');
      wx.showToast({ title: '请输入菜系', icon: 'none' });
      return;
    }
    if (!form.ingredients.filter((i) => i.name.trim()).length) {
      this.setData({ saving: false });
      this.jumpToTab('ings');
      wx.showToast({ title: '至少添加一种食材', icon: 'none' });
      return;
    }
    if (!form.steps.filter((s) => s.text.trim()).length) {
      this.setData({ saving: false });
      this.jumpToTab('steps');
      wx.showToast({ title: '至少添加一个步骤', icon: 'none' });
      return;
    }
    // 后端 RecipeRequest.tasteTags 是 @NotEmpty：客户端不拦的话，用户只会看到
    // 一句"创建失败，请重试"，而重试永远不可能成功
    if (!form.tasteTags.filter(Boolean).length) {
      this.setData({ saving: false });
      this.jumpToTab('info');
      wx.showToast({ title: '至少选一个口味标签', icon: 'none' });
      return;
    }
    const payload = {
      title: form.title.trim(),
      cuisine: form.cuisine.trim(),
      timeCost: Number(form.timeCost) || 15,
      servings: Number(form.servings) || 2,
      difficulty: form.difficulty || 'medium',
      coverImage: form.coverImage || '',
      tasteTags: form.tasteTags.filter(Boolean),
      summary: form.summary.trim(),
        ingredients: form.ingredients.filter((i) => i.name.trim()),
        // 教学视频只挂第 0 步（页面约定，与详情页 hoist 取法一致）
        steps: form.steps.filter((s) => s.text.trim()).map((s, i) => ({
          text: s.text,
          image: s.image || '',
          video: i === 0 ? (form.videoUrl || '') : ''
        })),
      sourceType: 'owned'
    };

    if (isEdit) {
      let updated;
      try {
        updated = await updateRecipe(recipeId, payload);
      } catch (err) {
        this.setData({ saving: false });
        wx.showToast({ title: (err && err.message) || '保存失败，请重试', icon: 'none' });
        return;
      }
      if (!updated) {
        this.setData({ saving: false });
        wx.showToast({ title: '保存失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已保存', icon: 'success' });
    } else {
      let created;
      try {
        created = await saveRecipe(payload);
      } catch (err) {
        this.setData({ saving: false });
        wx.showToast({ title: (err && err.message) || '创建失败，请重试', icon: 'none' });
        return;
      }
      if (!created) {
        this.setData({ saving: false });
        wx.showToast({ title: '创建失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已创建', icon: 'success' });
    }
    // 成功路径不复位 saving：返回前这 600ms 再点一次就是一道删不掉的重复菜谱，
    // 两个计时器还会各退一层页面。页面卸载时清计时器（同 pages/menu）
    // 已存好：撤掉离开确认，否则下面的 navigateBack 也会被系统拦一下
    this._baseline = undefined;
    setLeaveGuard(this, false);
    this._navTimer = setTimeout(() => wx.navigateBack(), 600);
  },

  onUnload() {
    if (this._navTimer) {
      clearTimeout(this._navTimer);
      this._navTimer = null;
    }
  }
});
