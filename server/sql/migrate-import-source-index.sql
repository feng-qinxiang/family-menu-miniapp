-- 2026-09-18 import_source 审核队列索引（对已有库执行一次；全新库由 schema.sql 直接建出）。
-- 背景：后台「导入审核」按 audit_status 过滤 + id 翻页（AdminService 的导入待审查询，
-- 形如 SELECT ... FROM import_source WHERE audit_status = ? ORDER BY id DESC LIMIT ?），
-- 而 import_source 建表时只有主键，数据增长后是全表扫。
--
-- 可重复执行：直接 ADD KEY 时第二次会报 1061 Duplicate key name（实测），
-- MySQL 8.4 又还不支持 ADD INDEX IF NOT EXISTS（实测 1064），
-- 所以和 migrate-cook-history-family-index.sql 用同一套 information_schema + PREPARE 判断。
-- 运维手册要求「脚本可重复执行」，不要求运维记得加 --force —— 加 --force 会连
-- 库名写错、权限不足这类真错误一起吞掉，反而是隐患。

SET @add_import_audit := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE import_source ADD KEY idx_import_source_audit (audit_status, id)',
    'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'import_source'
    AND index_name = 'idx_import_source_audit');
PREPARE st FROM @add_import_audit;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 执行后自检：type 应为 ref（或 range），key 命中 idx_import_source_audit，不应出现 type=ALL
EXPLAIN SELECT id FROM import_source WHERE audit_status = 'PENDING' ORDER BY id DESC LIMIT 20;
