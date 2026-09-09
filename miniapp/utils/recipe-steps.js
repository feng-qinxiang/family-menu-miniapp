/**
 * 步骤图编码：后端 recipe_step.step_text 只收字符串（List<String>）。
 * 有图时把 {text,image} 存成 JSON 字符串；无图仍存纯文本。
 * applies to this case only — 等后端有 image 列再删掉编解码。
 */

function decodeStep(s) {
  if (s && typeof s === 'object') {
    return {
      text: String(s.text || s.desc || ''),
      image: String(s.image || ''),
      video: String(s.video || '')
    };
  }
  const raw = String(s || '');
  if (raw.charAt(0) === '{') {
    try {
      const o = JSON.parse(raw);
      if (o && (o.text != null || o.image || o.video)) {
        return {
          text: String(o.text || ''),
          image: String(o.image || ''),
          video: String(o.video || '')
        };
      }
    } catch (e) {
      console.warn('[recipe-steps] JSON 步骤解析失败，按纯文本', e);
    }
  }
  return { text: raw, image: '', video: '' };
}

function encodeStep(s) {
  const text = String((s && s.text) || '').trim();
  const image = String((s && s.image) || '').trim();
  const video = String((s && s.video) || '').trim();
  if (!image && !video) return text;
  const o = { text };
  if (image) o.image = image;
  if (video) o.video = video;
  return JSON.stringify(o);
}

function hoistVideo(steps) {
  const list = Array.isArray(steps) ? steps : [];
  for (let i = 0; i < list.length; i++) {
    const v = list[i] && list[i].video;
    if (v) return v;
  }
  return '';
}

module.exports = { decodeStep, encodeStep, hoistVideo };
