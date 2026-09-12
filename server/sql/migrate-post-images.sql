-- 2026-09-12 帖子配图迁移（对已有库执行一次；全新库由 schema.sql 直接建出）。
-- images_json 为 JSON 字符串数组（元素为 /uploads/ 图片 URL），服务端统一 readStringList 解析，NULL 视为无图。

ALTER TABLE community_post
    ADD COLUMN images_json TEXT NULL AFTER tags_json;
