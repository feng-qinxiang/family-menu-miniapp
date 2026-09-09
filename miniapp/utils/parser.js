const UNIT_PATTERN = /([\d.½¼¾⅓⅔]+|[一二两三四五六七八九十半]{1,3})\s*(g|克|kg|斤|两|ml|毫升|升|个|只|颗|瓣|勺|大勺|小勺|片|根|碗|杯|把|小把|块|条|段|盒|袋|包|瓶|适量|少许|若干)/i;
const STEP_PREFIX = /^[0-9一二三四五六七八九十]+[、..)）:：\s]/;
const XHS_LINK = /https?:\/\/(www\.)?xiaohongshu\.com\/\S+|https?:\/\/xhslink\.com\/\S+/i;
const ANY_URL = /https?:\/\/\S+/;
// 自然语言"想法"输入的解析线索：烹饪动词（识别步骤子句）与菜名提示（做个X/想吃X）
const COOK_VERB = /焯|炖|炒|蒸|煮|烤|煎|炸|拌|腌|卤|烧|切|剁|捞|沥|收汁|下锅|出锅|装盘|调味/;
const TITLE_HINT = /(?:做个|做道|做一道|想做|想吃|来个|来道|整个|试试)([\u4e00-\u9fa5]{2,10})/;
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

module.exports = { parseRecipeText, DIFFICULTY_LABELS };
