-- 2026-09-19 社区信息流索引升级（对已有库执行一次；全新库由 schema.sql 直接建出）。
-- 背景：GET /api/community/posts 的排序是 like_count DESC, id DESC（分页见 MysqlKitchenStore），
-- 而 idx_post_audit 只建到 (audit_status, like_count)。第二个排序键不在索引里，
-- MySQL 每次请求都要把全部已过审帖子 filesort 一遍再取 20 条。
-- 5 万帖实测（EXPLAIN ANALYZE）：加 id DESC 之前首页 23.8ms、rows_examined_per_scan=24700、
-- using_filesort=true；之后 0.084ms、using_filesort=false。
--
-- 本脚本是「先删后建」，重复执行安全（第二次重建同一个索引，不会报 Duplicate key name）。
-- DROP 也加了存在性判断：索引缺失时（迁移做了一半、或结构是手工建的）直接 DROP 会报
-- 1091 Can't DROP，整个脚本中断；用 information_schema 判断后，缺索引就只做 ADD。
-- 判断写法与 migrate-cook-history-family-index.sql / migrate-import-source-index.sql 一致。
--
-- 大表上 DROP/ADD 各要一次在线 DDL，低峰期执行。

SET @drop_post_audit := (SELECT IF(COUNT(*) > 0,
    'ALTER TABLE community_post DROP INDEX idx_post_audit',
    'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'community_post'
    AND index_name = 'idx_post_audit');
PREPARE st FROM @drop_post_audit;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @add_post_audit := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE community_post ADD INDEX idx_post_audit (audit_status, like_count DESC, id DESC)',
    'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'community_post'
    AND index_name = 'idx_post_audit');
PREPARE st FROM @add_post_audit;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 执行后自检：key 应命中 idx_post_audit，且不应出现 Using filesort
EXPLAIN SELECT id FROM community_post WHERE audit_status = 'APPROVED'
ORDER BY like_count DESC, id DESC LIMIT 20;
