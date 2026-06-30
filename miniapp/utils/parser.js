const UNIT_PATTERN = /([\d.½¼¾⅓⅔]+)\s*(g|克|kg|斤|两|ml|毫升|升|个|只|颗|瓣|勺|大勺|小勺|片|根|碗|杯|把|小把|块|条|段|盒|袋|包|瓶|适量|少许|若干)/i;
const STEP_PREFIX = /^[0-9一二三四五六七八九十]+[、..)）:：\s]/;
const XHS_LINK = /https?:\/\/(www\.)?xiaohongshu\.com\/\S+|https?:\/\/xhslink\.com\/\S+/i;
const ANY_URL = /https?:\/\/\S+/;

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
  const lines = rawText.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return null;

  const url = extractUrl(rawText);
  const isXhs = XHS_LINK.test(rawText);
  const title = inferTitle(lines, url);
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

function inferTitle(lines, url) {
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
      ingredientLines.push(line);
      const name = line.slice(0, line.indexOf(match[0])).replace(/[：:,，、]/g, '').trim() || line.replace(UNIT_PATTERN, '').trim();
      ingredients.push({ name: name || line, amount: match[1], unit: match[2] });
    } else if (/适量|少许|若干/.test(line) && line.length < 20) {
      ingredientLines.push(line);
      const name = line.replace(/适量|少许|若干/g, '').replace(/[：:,，、]/g, '').trim();
      if (name) ingredients.push({ name, amount: '适量', unit: '' });
    }
  }
  if (!ingredients.length) {
    const fallback = lines.slice(1).filter((l) => !STEP_PREFIX.test(l) && l.length < 20).slice(0, 5);
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

module.exports = { parseRecipeText, DIFFICULTY_LABELS };
