-- 2026-09-18 import_source 审核队列索引（对已有库执行一次；全新库由 schema.sql 直接建出）。
-- 背景：后台「导入审核」按 audit_status 过滤 + id 翻页（MysqlKitchenStore 的导入待审查询），
-- 而 import_source 建表时只有主键，数据增长后是全表扫。
-- 重复执行会报 "Duplicate key name"，属预期，可加 --force 忽略。

ALTER TABLE import_source
    ADD KEY idx_import_source_audit (audit_status, id);
