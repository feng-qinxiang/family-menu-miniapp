const { getRecipeDetail, saveRecipe, updateRecipe } = require('../../utils/api');
const { chooseAndUpload } = require('../../utils/upload');

const DIFFICULTY_OPTIONS = [
  { key: 'easy', label: '简单' },
  { key: 'medium', label: '中等' },
  { key: 'hard', label: '困难' }
];

const CUISINE_OPTIONS = ['家常', '川菜', '粤菜', '湘菜', '面点'];

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
    saving: false
  },

  onLoad(options) {
    if (options.id) {
      this.setData({ isEdit: true, recipeId: options.id });
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
      wx.showToast({ title: '菜谱加载失败', icon: 'none' });
      return;
    }
    if (!recipe) return;
    const steps = (recipe.steps && recipe.steps.length)
      ? recipe.steps.map((s) => typeof s === 'string' ? { text: s, image: '' } : { text: s.text || '', image: s.image || '' })
      : [{ text: '', image: '' }];
    const form = {
      title: recipe.title || '',
      cuisine: recipe.cuisine || '',
      timeCost: recipe.timeCost || 15,
      servings: recipe.servings || 2,
      difficulty: recipe.difficulty || 'medium',
      coverImage: recipe.coverImage || '',
      tasteTags: recipe.tasteTags || [],
      summary: recipe.summary || '',
      ingredients: (recipe.ingredients && recipe.ingredients.length)
        ? recipe.ingredients
        : [{ name: '', amount: '', unit: '' }],
      steps
    };
    this.setData({
      form,
      tasteTagsText: form.tasteTags.join(','),
      commonTags: this.buildCommonTags(form.tasteTags)
    });
    this.refreshQuality();
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
    this.setData({ 'form.cuisine': value });
    this.refreshQuality();
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

  async chooseCover() {
    const urls = await chooseAndUpload(1);
    if (urls.length) {
      this.setData({ 'form.coverImage': urls[0] });
    }
  },

  removeCover() {
    this.setData({ 'form.coverImage': '' });
  },

  onTagsInput(e) {
    const text = e.detail.value || '';
    const tags = text.split(/[,，]/).map((s) => s.trim()).filter(Boolean);
    this.setData({
      tasteTagsText: text,
      'form.tasteTags': tags,
      commonTags: this.buildCommonTags(tags)
    });
    this.refreshQuality();
  },

  toggleCommonTag(e) {
    const { tag } = e.currentTarget.dataset;
    const current = this.data.form.tasteTags || [];
    const next = current.includes(tag) ? current.filter((item) => item !== tag) : current.concat(tag);
    this.setData({
      'form.tasteTags': next,
      tasteTagsText: next.join(','),
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

  async chooseStepImage(e) {
    const { index } = e.currentTarget.dataset;
    const urls = await chooseAndUpload(1);
    if (urls.length) {
      this.setData({ [`form.steps[${index}].image`]: urls[0] });
    }
  },

  removeStepImage(e) {
    const { index } = e.currentTarget.dataset;
    this.setData({ [`form.steps[${index}].image`]: '' });
  },

  addStep() {
    const steps = this.data.form.steps.concat([{ text: '', image: '' }]);
    this.setData({ 'form.steps': steps });
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
      tipText = '先给这道菜起个名字吧';
    } else if (ingredientCount < 2) {
      tipText = `再填 ${2 - ingredientCount} 个食材，这道菜就完整啦`;
    } else if (!stepCount) {
      tipText = '加一个做法步骤，家人照着做不出错';
    } else {
      tipText = '信息齐全，随时可以保存';
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
        steps: form.steps.filter((s) => s.text.trim()).map((s) => s.text.trim()),
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
