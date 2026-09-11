const { getRecipeDetail, saveRecipe, updateRecipe } = require('../../utils/api');
const { chooseAndUpload, chooseVideo, uploadFile } = require('../../utils/upload');
const { decodeStep, encodeStep, hoistVideo } = require('../../utils/recipe-steps');
const { LOCAL_DISHES, recipeDishImg } = require('../../utils/image');
const { cuisineList } = require('../../utils/constants');

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
    editTab: 'info',
    editingStep: -1,
    tagsLabel: '未选',
    pickSheet: { visible: false, mode: 'cuisine' },
    mediaSheet: { visible: false, mode: 'image', index: 0 },
    pickerImages: PICKER_IMAGES
  },

  onLoad(options) {
    if (options.id) {
      // 编辑模式：先遮罩加载，避免空表单闪变后被数据覆盖
      this.setData({ isEdit: true, recipeId: options.id, pageLoading: true });
      this.loadRecipe(options.id);
    } else {
      this.refreshQuality();
    }
  },

  async loadRecipe(id) {
    let recipe;
    try {
      recipe = await getRecipeDetail(id);
    } catch (err) {
      this.setData({ pageLoading: false });
      wx.showToast({ title: '菜谱加载失败', icon: 'none' });
      return;
    }
    if (!recipe) {
      this.setData({ pageLoading: false });
      return;
    }
    const steps = (recipe.steps && recipe.steps.length)
      ? recipe.steps.map((s) => decodeStep(s))
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
      videoUrl: hoistVideo(steps) || recipe.videoUrl || '',
      steps
    };
    this.setData({
      form,
      tasteTagsText: form.tasteTags.join(','),
      tagsLabel: this.labelForTags(form.tasteTags),
      commonTags: this.buildCommonTags(form.tasteTags),
      pageLoading: false
    });
    this.refreshQuality();
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

  removeCover() {
    this.setData({ 'form.coverImage': '' });
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

  removeIngredient(e) {
    const { index } = e.currentTarget.dataset;
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

  removeStepImage(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`form.steps[${index}].image`]: '' });
  },

  chooseLessonVideo() {
    this.setData({
      mediaSheet: { visible: true, mode: 'video', index: 0 }
    });
  },

  closeMediaSheet() {
    this.setData({ 'mediaSheet.visible': false });
  },

  pickLocalImage(e) {
    const url = e.currentTarget.dataset.url;
    if (!url) return;
    if (this.data.mediaSheet.mode === 'cover') {
      this.setData({ 'form.coverImage': url, 'mediaSheet.visible': false });
      return;
    }
    const index = this.data.mediaSheet.index;
    this.setData({
      [`form.steps[${index}].image`]: url,
      'mediaSheet.visible': false
    });
  },

  async pickImageFromAlbum() {
    const urls = await chooseAndUpload(1);
    // 上传失败会返回空串（不再回退本地临时路径），必须按空值拦截
    if (!urls.length || !urls[0]) {
      wx.showToast({ title: '上传失败，请重试', icon: 'none' });
      return;
    }
    if (this.data.mediaSheet.mode === 'cover') {
      this.setData({ 'form.coverImage': urls[0], 'mediaSheet.visible': false });
      return;
    }
    const index = this.data.mediaSheet.index;
    this.setData({
      [`form.steps[${index}].image`]: urls[0],
      'mediaSheet.visible': false
    });
  },

  async pickVideoFromAlbum() {
    const path = await chooseVideo();
    if (!path) {
      wx.showToast({ title: '没有选到视频', icon: 'none' });
      return;
    }
    wx.showLoading({ title: '上传中', mask: true });
    const url = await uploadFile(path);
    wx.hideLoading();
    if (!url) {
      wx.showToast({ title: '上传失败', icon: 'none' });
      return;
    }
    this.setData({
      'form.videoUrl': url,
      'mediaSheet.visible': false
    });
  },

  removeLessonVideo() {
    this.setData({ 'form.videoUrl': '' });
  },

  addStep() {
    const steps = this.data.form.steps.concat([{ text: '', image: '' }]);
    this.setData({ 'form.steps': steps, editingStep: steps.length - 1 });
    this.refreshQuality();
  },

  removeStep(e) {
    const { index } = e.currentTarget.dataset;
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
    this.setData({ saving: true });
    const { form, isEdit, recipeId } = this.data;
    if (!form.title.trim()) {
      this.setData({ saving: false });
      wx.showToast({ title: '请输入菜名', icon: 'none' });
      return;
    }
    if (!form.cuisine.trim()) {
      this.setData({ saving: false });
      wx.showToast({ title: '请输入菜系', icon: 'none' });
      return;
    }
    if (!form.ingredients.filter((i) => i.name.trim()).length) {
      this.setData({ saving: false });
      wx.showToast({ title: '至少添加一种食材', icon: 'none' });
      return;
    }
    if (!form.steps.filter((s) => s.text.trim()).length) {
      this.setData({ saving: false });
      wx.showToast({ title: '至少添加一个步骤', icon: 'none' });
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
        steps: form.steps.filter((s) => s.text.trim()).map((s, i) => encodeStep({
          text: s.text,
          image: s.image,
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
        wx.showToast({ title: '保存失败，请重试', icon: 'none' });
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
        wx.showToast({ title: '创建失败，请重试', icon: 'none' });
        return;
      }
      if (!created) {
        this.setData({ saving: false });
        wx.showToast({ title: '创建失败', icon: 'none' });
        return;
      }
      wx.showToast({ title: '已创建', icon: 'success' });
    }
    this.setData({ saving: false });
    setTimeout(() => wx.navigateBack(), 600);
  }
});
