-- 2026-09-12 步骤媒体列迁移（对已有库执行一次；全新库由 schema.sql 直接建出）。
-- 背景：前端曾把 {text,image,video} 编码成 JSON 字符串塞进 recipe_step.step_text
-- （miniapp/utils/recipe-steps.js 的历史 hack）。本期改为独立列，此脚本负责存量回填。
-- 回填后 step_text 还原为纯文本，服务端 RecipeStep DTO 对旧格式字符串仍保持兼容解码。

ALTER TABLE recipe_step
    ADD COLUMN image_url VARCHAR(512) NULL AFTER step_text,
    ADD COLUMN video_url VARCHAR(512) NULL AFTER image_url;

UPDATE recipe_step
SET image_url = JSON_UNQUOTE(JSON_EXTRACT(step_text, '$.image')),
    video_url = JSON_UNQUOTE(JSON_EXTRACT(step_text, '$.video')),
    step_text = COALESCE(JSON_UNQUOTE(JSON_EXTRACT(step_text, '$.text')), '')
WHERE step_text LIKE '{%'
  AND JSON_VALID(step_text);
