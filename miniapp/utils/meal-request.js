// 有限条件识别；不把未识别的要求悄悄丢掉，也不调用点菜写接口。
const NUMBER = '[0-9一二两三四五六七八九十]+';

function numberOf(value) {
  if (/^\d+$/.test(value)) return Number(value);
  if (!/^(?:[一二两三四五六七八九]?十[一二三四五六七八九]?|[一二两三四五六七八九])$/.test(value)) return NaN;
  const digits = { 一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9 };
  if (value.includes('十')) {
    const parts = value.split('十');
    return (parts[0] ? digits[parts[0]] : 1) * 10 + (parts[1] ? digits[parts[1]] : 0);
  }
  return digits[value] || NaN;
}

function parseMealRequest(value, cuisines = []) {
  const result = { minServings: 0, maxTime: 0, cuisine: '', mealType: '', pantryOnly: false, mildOnly: false, labels: [], warnings: [] };
  let rest = String(value || '').trim();
  const remember = (key, value) => {
    if (result[key] && result[key] !== value) result.warnings.push('同一条件有多个要求，请保留一个');
    result[key] = value;
  };
  rest = rest.replace(new RegExp(`(${NUMBER})\\s*(?:个?人(?:份)?|口人?)`, 'g'), (_, value) => {
    const n = numberOf(value);
    if (!Number.isInteger(n) || n < 1 || n > 20) result.warnings.push('人数请填写 1–20 人');
    else remember('minServings', n);
    return ' ';
  });
  rest = rest.replace(/半(?:个)?小时/g, () => { remember('maxTime', 30); return ' '; });
  rest = rest.replace(new RegExp(`(${NUMBER})\\s*(分钟|分|小时)`, 'g'), (_, value, unit) => {
    const minutes = numberOf(value) * (unit === '小时' ? 60 : 1);
    if (!Number.isInteger(minutes) || minutes < 1 || minutes > 360) result.warnings.push('耗时请填写 1–360 分钟');
    else remember('maxTime', minutes);
    return ' ';
  });
  rest = rest.replace(/不(?:要)?辣|无辣/g, () => { result.mildOnly = true; return ' '; });
  rest = rest.replace(/(?:优先)?(?:用)?(?:冰箱(?:里)?(?:有的|现有|能做的|能做)?(?:食材)?|临期(?:食材)?)/g, () => { result.pantryOnly = true; return ' '; });
  rest = rest.replace(/早餐|早饭|午餐|午饭|晚餐|晚饭|加餐/g, value => {
    const key = /早/.test(value) ? 'breakfast' : /午/.test(value) ? 'lunch' : /晚/.test(value) ? 'dinner' : 'snack';
    remember('mealType', key);
    return ' ';
  });
  [...cuisines].sort((a, b) => b.length - a.length).forEach(cuisine => {
    if (cuisine && rest.includes(cuisine)) {
      remember('cuisine', cuisine);
      rest = rest.split(cuisine).join(' ');
    }
  });
  // 只允许不改变条件含义的连接词；负面要求、过敏、未支持的食材等都会留下并阻止应用。
  rest = rest.replace(/[，,。.!！?？、；;：:\s]/g, '').replace(/帮我|给我|请|想吃|做点|做个|吃点|以内|之内|分钟内|人份|挑一道|挑菜|推荐|优先|一起|左右|吃|的|菜|内/g, '');
  if (rest) result.warnings.push(`暂不能识别「${rest.slice(0, 24)}」，请改用人数、耗时、菜系、不辣或冰箱条件`);
  if (result.minServings) result.labels.push(`${result.minServings} 人以上`);
  if (result.maxTime) result.labels.push(`${result.maxTime} 分钟内`);
  if (result.cuisine) result.labels.push(result.cuisine);
  if (result.mealType) result.labels.push({ breakfast: '早餐', lunch: '午餐', dinner: '晚餐', snack: '加餐' }[result.mealType]);
  if (result.mildOnly) result.labels.push('有不辣／清淡标注');
  if (result.pantryOnly) result.labels.push('冰箱能做 · 临期优先');
  result.canApply = result.labels.length > 0 && !result.warnings.length;
  return result;
}

function hasMildLabel(recipe) {
  const tags = (recipe.tasteTags || []).map(String).join(' ');
  const labelled = /清淡|不辣|无辣/.test(tags);
  const copy = [recipe.title, tags].join(' ').replace(/不辣|无辣/g, '');
  return labelled && !/辣|麻婆|水煮/.test(copy);
}

module.exports = { parseMealRequest, hasMildLabel };
