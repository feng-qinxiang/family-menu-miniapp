-- 2026-09-19 社区信息流索引升级（对已有库执行一次；全新库由 schema.sql 直接建出）。
-- 背景：GET /api/community/posts 的排序是 like_count DESC, id DESC（分页见 MysqlKitchenStore），
-- 而 idx_post_audit 只建到 (audit_status, like_count)。第二个排序键不在索引里，
-- MySQL 每次请求都要把全部已过审帖子 filesort 一遍再取 20 条。
-- 5 万帖实测（EXPLAIN ANALYZE）：加 id DESC 之前首页 23.8ms、rows_examined_per_scan=24700、
-- using_filesort=true；之后 0.084ms、using_filesort=false。
--
-- 本脚本是「先删后建」，所以重复执行是安全的（第二次会重建同一个索引，不会报 Duplicate key name）。
-- 大表上 DROP/ADD 各要一次在线 DDL，低峰期执行。

ALTER TABLE community_post
    DROP INDEX idx_post_audit;

ALTER TABLE community_post
    ADD INDEX idx_post_audit (audit_status, like_count DESC, id DESC);
