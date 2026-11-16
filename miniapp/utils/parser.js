const UNIT_PATTERN = /([\d.½¼¾⅓⅔]+|[一二两三四五六七八九十半]{1,3})\s*(g|克|kg|斤|两|ml|毫升|升|个|只|颗|瓣|勺|大勺|小勺|片|根|碗|杯|把|小把|块|条|段|盒|袋|包|瓶|适量|少许|若干)/i;
const STEP_PREFIX = /^[0-9一二三四五六七八九十]+[、..)）:：\s]/;
const XHS_LINK = /https?:\/\/(www\.)?xiaohongshu\.com\/\S+|https?:\/\/xhslink\.com\/\S+/i;
const ANY_URL = /https?:\/\/\S+/;
// 自然语言"想法"输入的解析线索：烹饪动词（识别步骤子句）与菜名提示（做个X/想吃X）
const COOK_VERB = /焯|炖|炒|蒸|煮|烤|煎|炸|拌|腌|卤|烧|切|剁|捞|沥|收汁|下锅|出锅|装盘|调味/;
// 「想要这道菜」的说法：导入时用来认菜名，一句话点菜时用来认「加菜」
const WANT_VERBS = '做个|做道|做一道|想做|想吃|来个|来道|整个|试试';
const TITLE_HINT = new RegExp(`(?:${WANT_VERBS})([\\u4e00-\\u9fa5]{2,10})`);
// 食材名里的动词杂质（"排骨买500克"→"排骨"）
const ING_NOISE = /买|用|备好|准备|需要|放|加|要/g;

const CUISINE_RULES = [
  { pattern: /川|麻辣|豆瓣|花椒|回锅|鱼香|水煮/, cuisine: '川菜' },
  { pattern: /粤|蒸|煲|老火|白切|叉烧/, cuisine: '粤菜' },
  { pattern: /湘|剁椒|小炒|腊/, cuisine: '湘菜' },
  { pattern: /鲁|葱烧|糖醋|爆/, cuisine: '鲁菜' },
  { pattern: /日|寿司|刺身|味噌|照烧/, cuisine: '日料' },
  { pattern: /西|意面|沙拉|牛排|烤箱/, cuisine: '西餐' }
];

const DIFFICULTY_RULES = [
  { pattern: /快手|简单|新手|零失败|懒人|5分钟|十分钟/, difficulty: 'easy' },
  { pattern: /硬菜|宴客|复杂|慢炖|2小时|三小时/, difficulty: 'hard' }
];

const DIFFICULTY_LABELS = { easy: '简单', medium: '中等', hard: '困难' };

function parseRecipeText(rawText) {
  let lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;
  // 一段话式"想法"输入（行少且长）：按中文标点切成子句，逐句归类
  if (lines.length <= 2 && rawText.trim().length > 16) {
    lines = rawText.split(/[，,。；;！!？?\r\n]/).map((l) => l.trim()).filter(Boolean);
  }

  const url = extractUrl(rawText);
  const isXhs = XHS_LINK.test(rawText);
  const title = inferTitle(lines, url, rawText);
  const cuisine = detectCuisine(rawText);
  const difficulty = detectDifficulty(rawText);
  const { ingredients, ingredientLines } = extractIngredients(lines);
  const { steps, stepLines } = extractSteps(lines);
  const timeCost = inferTimeCost(rawText, steps);
  const servings = inferServings(rawText);

  const totalSignals = (ingredients.length > 0 ? 1 : 0)
    + (steps.length > 0 ? 1 : 0)
    + (title !== '导入菜谱' ? 1 : 0)
    + (url ? 1 : 0);
  const confidence = Math.min(0.95, 0.3 + totalSignals * 0.15 + lines.length * 0.02);

  return {
    title,
    sourceType: url ? 'link' : 'text',
    sourceUrl: url,
    isXhs,
    detectedCuisine: cuisine,
    difficulty,
    difficultyLabel: DIFFICULTY_LABELS[difficulty],
    timeCost,
    servings,
    ingredients,
    steps,
    confidence: Math.round(confidence * 100) + '%',
    notes: buildNotes({ url, isXhs, ingredients, steps })
  };
}

function extractUrl(text) {
  const xhs = text.match(XHS_LINK);
  if (xhs) return xhs[0];
  const any = text.match(ANY_URL);
  return any ? any[0] : '';
}

function inferTitle(lines, url, rawText) {
  // 优先从"做个X/想吃X"类表达提取菜名（自然语言输入）
  const hint = String(rawText || '').match(TITLE_HINT);
  if (hint && hint[1]) return hint[1];
  const first = lines[0];
  if (first.length <= 30 && !ANY_URL.test(first) && !UNIT_PATTERN.test(first) && !STEP_PREFIX.test(first)) {
    return first.replace(/^[#【\[]+|[】\]]+$/g, '').trim() || '导入菜谱';
  }
  return url ? '外链菜谱' : '导入菜谱';
}

function detectCuisine(text) {
  for (const rule of CUISINE_RULES) {
    if (rule.pattern.test(text)) return rule.cuisine;
  }
  return '家常';
}

function detectDifficulty(text) {
  for (const rule of DIFFICULTY_RULES) {
    if (rule.pattern.test(text)) return rule.difficulty;
  }
  return 'medium';
}

function extractIngredients(lines) {
  const ingredientLines = [];
  const ingredients = [];
  for (const line of lines) {
    if (STEP_PREFIX.test(line)) continue;
    const match = line.match(UNIT_PATTERN);
    if (match) {
      let name = line.slice(0, line.indexOf(match[0])).replace(/[：:,，、]/g, '').trim() || line.replace(UNIT_PATTERN, '').trim();
      // 清理"想吃X/做个X"菜名提示语和"买/用/准备"等动词杂质（自然语言里常见：排骨买500克）
      name = name.replace(/(?:做个|做道|做一道|想做|想吃|来个|来道|整个|试试)[\u4e00-\u9fa5]{2,10}/g, '')
        .replace(ING_NOISE, '').trim();
      // 名字过长说明是叙述句而非食材行，丢弃避免整句话变食材
      if (!name || name.length > 10) continue;
      ingredientLines.push(line);
      ingredients.push({ name, amount: match[1], unit: match[2] });
    } else if (/适量|少许|若干/.test(line) && line.length < 20) {
      ingredientLines.push(line);
      const name = line.replace(/适量|少许|若干/g, '').replace(/[：:,，、]/g, '').replace(ING_NOISE, '').trim();
      if (name) ingredients.push({ name, amount: '适量', unit: '' });
    }
  }
  if (!ingredients.length) {
    // 兜底也排除烹饪动作句，避免"先焯水再炖"被当食材
    const fallback = lines.slice(1).filter((l) => !STEP_PREFIX.test(l) && !COOK_VERB.test(l) && l.length < 20).slice(0, 5);
    fallback.forEach((l) => {
      ingredientLines.push(l);
      ingredients.push({ name: l, amount: '', unit: '' });
    });
  }
  return { ingredients: ingredients.slice(0, 20), ingredientLines };
}

function extractSteps(lines) {
  const stepLines = [];
  const steps = [];
  for (const line of lines) {
    if (STEP_PREFIX.test(line)) {
      stepLines.push(line);
      steps.push({ text: line.replace(STEP_PREFIX, '').trim(), image: '' });
    }
  }
  if (!steps.length) {
    // 无序号时：含烹饪动词且不是食材行的子句按顺序当步骤（自然语言输入）
    const verbLines = lines.filter((l) => COOK_VERB.test(l) && !UNIT_PATTERN.test(l) && l.length >= 4);
    verbLines.slice(0, 8).forEach((l) => {
      stepLines.push(l);
      steps.push({ text: l, image: '' });
    });
  }
  if (!steps.length) {
    const candidates = lines.filter((l) => l.length > 15 && !UNIT_PATTERN.test(l));
    candidates.slice(0, 6).forEach((l) => {
      stepLines.push(l);
      steps.push({ text: l, image: '' });
    });
  }
  return { steps, stepLines };
}

function inferTimeCost(text, steps) {
  const match = text.match(/(\d+)\s*分钟/);
  if (match) return Math.min(180, Number(match[1]));
  if (steps.length <= 3) return 15;
  if (steps.length <= 5) return 25;
  return 40;
}

function inferServings(text) {
  const match = text.match(/(\d+)\s*人[份分]?/);
  if (match) return Math.min(10, Number(match[1]));
  return 2;
}

function buildNotes({ url, isXhs, ingredients, steps }) {
  const notes = [];
  if (isXhs) notes.push('检测到小红书链接，已提取文本内容');
  else if (url) notes.push('已保留来源链接');
  else notes.push('纯文本导入，无来源链接');
  if (!ingredients.length) notes.push('未识别到食材，请手动补充');
  if (!steps.length) notes.push('未识别到步骤，请手动补充');
  notes.push('保存前请核对食材用量和步骤顺序');
  return notes;
}

// ———— 一句话点菜（规则版）————
// 把一句话变成一份「计划」，页面和确认卡只认计划、不认规则：以后换成大模型，
// 只要它吐出同样形状的计划，页面不用动。计划只是「打算怎么改」，真正改数据要等用户点确认。
//
// plan = {
//   intent: 'add' | 'remove' | 'replace' | '',   // 加菜 / 撤菜 / 换菜；'' = 没听懂
//   mealType: 'breakfast' | 'lunch' | 'dinner', // 加菜加到哪一餐
//   mealGuessed: boolean,                       // 句子里没说餐次，用的是入口带来的默认餐次
//   notToday: boolean,                          // 说的是明天以后：菜单只能改今天的
//   items: [{
//     role: 'add' | 'remove',
//     query: string,                            // 句子里说的菜名
//     recipe: { id, title, mealType? } | null,  // 认准的那道；撤菜时带它在今天哪一餐
//     candidates: [{ id, title, mealType? }],   // 没认准时让人点的候选；也为空 = 没找到
//     missing: boolean                          // 撤菜时菜单里没这道，candidates 是这一餐已点的菜
//   }]
// }
const MEAL_RULES = [
  { mealType: 'breakfast', label: '早饭', pattern: /早饭|早餐|早上|早晨|今早/ },
  { mealType: 'lunch', label: '午饭', pattern: /午饭|午餐|中午|中饭/ },
  { mealType: 'dinner', label: '晚饭', pattern: /晚饭|晚餐|晚上|今晚|夜宵|宵夜/ }
];
const MEAL_LABELS = { breakfast: '早饭', lunch: '午饭', dinner: '晚饭' };
const NOT_TODAY = /明天|明早|明晚|明儿|后天|下周|星期[一二三四五六日天]|周[一二三四五六日天]/;
// 「把 A 换成 B」：左边撤、右边加；单个「换」后面跟着个/一/道时是「换个 B」，算加菜
const REPLACE_MARK = /换成|改成|换为|改为|替换成|换(?![个一道])/;
const REMOVE_VERB = /不要|不吃|不做|别做|去掉|删掉|删了|撤掉|撤了|撤下|拿掉|取消|划掉/;
const ADD_VERB = new RegExp(`${WANT_VERBS}|换个|换一道|换道|加|添|点|安排|吃`);
const CLAUSE_SPLIT = /[，,。；;！!？?\n]+/;
const CHUNK_SPLIT = /和|与|跟|及|、|还有|以及|\s+/;
const LEAD_NOISE = /^(?:把|将|给|再|也|就|还|的|我|我们|帮我|今天|今日|一个|一道|一份|个|道|份|些|点)+/;
const TAIL_NOISE = /(?:的|了|吧|呢|啊|呀|哦|嘛|一下|这道|这个)+$/;
const EMPTY_QUERY = /^(?:菜|饭|东西|什么|啥|菜单|一个|个)?$/;
const MAX_CANDIDATES = 6;
// 同一样东西的两种叫法（和做菜步骤认料共用一份）：比菜名前先统一成第一种
const { STEP_SYNONYMS } = require('./dish-logic');
function sameName(s) {
  return STEP_SYNONYMS.reduce((acc, pair) => pair.slice(1).reduce((t, w) => t.split(w).join(pair[0]), acc), s);
}

function detectMeal(text) {
  const hit = MEAL_RULES.find((r) => r.pattern.test(text));
  return hit ? hit.mealType : '';
}

// 句子里说的菜名 → 菜谱：先找完整菜名（长的先认、认到就划掉），剩下的字再按包含 / 字面相近去猜
function matchDishes(segment, pool) {
  const found = [];
  let rest = segment;
  pool.slice().sort((a, b) => b.title.length - a.title.length).forEach((r) => {
    if (!r.title) return;
    // 同名的两条（撤菜时同一道菜点在两餐）：名字已经划掉了，先在认到的里找
    const same = found.find((f) => f.query === r.title);
    if (same) { same.candidates.push(r); return; }
    if (rest.indexOf(r.title) === -1) return;
    found.push({ query: r.title, candidates: [r], pos: segment.indexOf(r.title) });
    rest = rest.split(r.title).join(' ');
  });
  found.forEach((f) => {
    f.recipe = f.candidates.length === 1 ? f.candidates[0] : null;
    if (f.recipe) f.candidates = [];
  });
  MEAL_RULES.forEach((r) => { rest = rest.replace(new RegExp(r.pattern.source, 'g'), ' '); });
  rest = rest.replace(new RegExp(REMOVE_VERB.source, 'g'), ' ')
    .replace(new RegExp(REPLACE_MARK.source, 'g'), ' ')
    .replace(new RegExp(ADD_VERB.source, 'g'), ' ')
    .replace(/菜单里|菜单上|菜单/g, ' ');
  rest.split(CHUNK_SPLIT).forEach((raw) => {
    const query = raw.replace(LEAD_NOISE, '').replace(TAIL_NOISE, '').trim();
    if (EMPTY_QUERY.test(query) || !/[\u4e00-\u9fa5]/.test(query)) return;
    const q = sameName(query);
    const contains = pool.filter((r) => sameName(r.title).indexOf(q) !== -1 || q.indexOf(sameName(r.title)) !== -1);
    // ponytail: 字面相近只数共有的字，「鸡」能猜到「可乐鸡翅」「香菇滑鸡」；同音字、没登记的别名认不出，换大模型时整段替掉
    const chars = Array.from(new Set(q.split('')));
    const similar = contains.length ? contains : pool
      .map((r) => ({ r, n: chars.filter((c) => sameName(r.title).indexOf(c) !== -1).length }))
      .filter((x) => x.n >= Math.min(2, chars.length) && x.n * 2 >= chars.length)
      .sort((a, b) => b.n - a.n || a.r.title.length - b.r.title.length)
      .map((x) => x.r);
    // 只有一道菜名包含它、且说了两个字以上，才直接认定（确认卡上照样写全名给人看）
    const sure = contains.length === 1 && query.length >= 2;
    const pos = segment.indexOf(query);
    found.push({ query, recipe: sure ? contains[0] : null, candidates: sure ? [] : similar.slice(0, MAX_CANDIDATES), pos: pos < 0 ? segment.length : pos });
  });
  // 长菜名先认是为了不被短的截胡；给人看时按说的先后排回来
  return found.sort((a, b) => a.pos - b.pos);
}

// 换菜没说餐次时，加的那道跟着撤掉的那道走（「把红烧肉换成糖醋排骨」= 红烧肉在哪一餐就换在哪一餐）
function settleMeal(plan) {
  const removed = plan.items.find((it) => it.role === 'remove' && it.recipe);
  if (plan.mealGuessed && removed && removed.recipe.mealType) plan.mealType = removed.recipe.mealType;
  return plan;
}

/**
 * @param {string} text 用户说的一句话
 * @param {{recipes: Array<{id,title}>, menu: Array<{id,title,mealType}>, mealType?: string}} ctx
 *   recipes 是能点的菜；menu 是今天已点的菜（id 是菜谱 id）；mealType 是没说餐次时用的默认餐次
 */
function planMenuCommand(text, ctx) {
  const say = String(text || '').trim();
  const recipes = ((ctx && ctx.recipes) || []).filter((r) => r && r.id != null && r.title);
  const menu = ((ctx && ctx.menu) || []).filter((r) => r && r.id != null && r.title);
  const said = detectMeal(say);
  const plan = {
    intent: '',
    mealType: said || (ctx && ctx.mealType) || 'dinner',
    mealGuessed: !said,
    notToday: NOT_TODAY.test(say),
    items: []
  };
  if (!say || plan.notToday) return plan;
  // 撤菜只在今天已点的菜里找：说了餐次就只找那一餐
  const removable = said ? menu.filter((m) => (m.mealType || 'dinner') === said) : menu;
  let lastRole = 'add';
  say.split(CLAUSE_SPLIT).filter(Boolean).forEach((clause) => {
    const parts = [];
    const swap = clause.match(REPLACE_MARK);
    if (swap) {
      parts.push({ role: 'remove', text: clause.slice(0, swap.index), said: true });
      parts.push({ role: 'add', text: clause.slice(swap.index + swap[0].length), said: true });
    } else if (REMOVE_VERB.test(clause)) {
      parts.push({ role: 'remove', text: clause, said: true });
    } else {
      const said = ADD_VERB.test(clause);
      parts.push({ role: said ? 'add' : lastRole, text: clause, said });
    }
    parts.forEach((part) => {
      const pool = part.role === 'remove' ? removable : recipes;
      // 没有「加 / 撤 / 换」的字、也对不上任何菜（「今天天气不错」）：不当成点菜
      const dishes = matchDishes(part.text, pool).filter((d) => part.said || d.recipe || d.candidates.length);
      if (dishes.length) lastRole = part.role;
      dishes.forEach((d) => {
        const item = { role: part.role, query: d.query, recipe: d.recipe || null, candidates: d.candidates, missing: false };
        // 撤菜：菜单里没这道 → 把这一餐已点的菜列出来，让人点要撤哪道
        if (part.role === 'remove' && !item.recipe && !item.candidates.length) {
          item.missing = true;
          item.candidates = removable.slice(0, MAX_CANDIDATES);
        }
        plan.items.push(item);
      });
    });
  });
  const roles = plan.items.map((it) => it.role);
  const adds = roles.indexOf('add') !== -1;
  const removes = roles.indexOf('remove') !== -1;
  plan.intent = adds && removes ? 'replace' : (adds ? 'add' : (removes ? 'remove' : ''));
  return settleMeal(plan);
}

// 用户在确认卡上点了某个候选：返回新的计划（不改原对象）
function pickCandidate(plan, index, candidate) {
  const items = plan.items.map((it, i) => (i === index ? { ...it, recipe: candidate, candidates: [], missing: false } : it));
  return settleMeal({ ...plan, items });
}

// 确认后要调的接口：先撤后加；有没认准的就不给动作（确认按钮不可点）
function planActions(plan) {
  if (!plan || !plan.intent || !plan.items.length || plan.items.some((it) => !it.recipe)) return [];
  return plan.items.slice()
    .sort((a, b) => (a.role === b.role ? 0 : (a.role === 'remove' ? -1 : 1)))
    .map((it) => ({
      op: it.role,
      recipeId: it.recipe.id,
      title: it.recipe.title,
      mealType: it.role === 'remove' ? (it.recipe.mealType || plan.mealType) : plan.mealType
    }));
}

module.exports = { parseRecipeText, DIFFICULTY_LABELS, planMenuCommand, pickCandidate, planActions, MEAL_LABELS };
