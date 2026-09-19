-- 2026-09-19 做菜记录索引补齐（对**已有库**执行一次；全新库由 schema.sql 直接建出）。
--
-- 背景（两条都是 EXPLAIN 实测出来的，不是推测）：
--  1) GET /api/cook-history 的查询是 WHERE family_id = ? ORDER BY cooked_at DESC LIMIT 50，
--     而 cook_history 原本只有 (user_id, cooked_at) 和 (recipe_id) 两条索引 →
--     EXPLAIN: type=ALL, possible_keys=NULL, Extra="Using where; Using filesort"，
--     即全表扫 + 文件排序。这是全站行数增长最快的一张表（每做一道菜一行）。
--  2) 菜谱列表 / 首页 dashboard 会为每道菜谱带出「我家做过几次、最近一次」，形如
--     LEFT JOIN (SELECT recipe_id, COUNT(*), MAX(cooked_at) FROM cook_history
--                WHERE family_id = ? GROUP BY recipe_id) ch
--     派生表**无法**用 idx_cook_history_recipe 去 seek family_id（该索引以 recipe_id 打头），
--     所以每个菜谱列表请求都要全扫整张 cook_history 再临时表分组。
--     第二条索引 (family_id, recipe_id) 正好覆盖它，并且顺带服务 countFamilyCooks /
--     loadFamilyReviews 里的 (recipe_id, family_id) 组合条件。
--
-- 为什么写成 PREPARE 判断：MySQL 8.4 不支持 ALTER TABLE ... DROP INDEX IF EXISTS
-- （实测 ERROR 1064），而这里是要「新增」索引——直接 ADD 的话第二次执行会报 1061
-- Duplicate key name。用 information_schema 先判断，重复执行安全。
--
-- 大表上 ADD INDEX 是一次在线 DDL（INPLACE），低峰期执行。

SET @add_family := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE cook_history ADD INDEX idx_cook_history_family (family_id, cooked_at DESC)',
    'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cook_history'
    AND index_name = 'idx_cook_history_family');
PREPARE st FROM @add_family;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @add_family_recipe := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE cook_history ADD INDEX idx_cook_history_family_recipe (family_id, recipe_id)',
    'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE()
    AND table_name = 'cook_history'
    AND index_name = 'idx_cook_history_family_recipe');
PREPARE st FROM @add_family_recipe;
EXECUTE st;
DEALLOCATE PREPARE st;

-- 执行后自检：两条查询都不该再出现 type=ALL / Using filesort
EXPLAIN SELECT id FROM cook_history WHERE family_id = 1 ORDER BY cooked_at DESC LIMIT 50;
EXPLAIN SELECT recipe_id, COUNT(*) FROM cook_history WHERE family_id = 1 GROUP BY recipe_id;
