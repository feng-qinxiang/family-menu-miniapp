-- ============================================================================
-- 生产建库第 1 步：创建库（本文件不建表）
--
-- 完整流程（两步都要做，只跑本文件会得到一个没有表的空库，接口会全 500）：
--   1) mysql -uroot -p < sql/create-database.sql
--   2) mysql -uroot -p family_menu_daily_db < src/main/resources/schema.sql
--
-- 第 2 步可重复执行（schema.sql 只有 CREATE TABLE IF NOT EXISTS）。
-- 可选：导入演示数据（仅体验/测试环境，生产别跑，会注入演示家庭与免费年卡）
--   3) mysql -uroot -p family_menu_daily_db < src/main/resources/data.sql
--
-- 本次改动之前已部署过的旧库，补列请执行一次：
--   mysql -uroot -p family_menu_daily_db --force < sql/migrate-legacy.sql
-- ============================================================================

CREATE DATABASE IF NOT EXISTS family_menu_daily_db
DEFAULT CHARACTER SET utf8mb4
COLLATE utf8mb4_0900_ai_ci;
