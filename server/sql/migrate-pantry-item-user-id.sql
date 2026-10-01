-- ============================================================================
-- 旧库补列脚本：pantry_item.user_id（只给"本次改动之前已经部署过的库"用一次）
--
-- 新库不需要执行本文件：src/main/resources/schema.sql 里的 CREATE TABLE 已包含该列。
--
-- 为什么单独放这里：
--   MySQL 8 的 ALTER TABLE 不支持 IF NOT EXISTS，重复执行会以 1060 报错并中断
--   mysql CLI；而 application.yml:52 把 continue-on-error 设成了 false，
--   一条 ALTER 混进 schema.sql 会让每次 dev/test 启动都硬失败。生产建库是手动跑
--   mysql（application-prod.yml 固定 SPRING_SQL_INIT_MODE=never），必须能安全重跑。
--
-- 列语义：记录"是谁加的这条库存"，用于展示与审计；
--   **不参与编辑/删除的归属校验**——冰箱是全家共用一池，校验按 family_id 走。
--   历史行该列为 NULL 属正常（建列之前的行不知道是谁加的），不回填。
--
-- 用法（只需成功执行一次；列已存在时会报错，可忽略或加 --force）：
--   mysql -uroot -p family_menu_daily_db --force < sql/migrate-pantry-item-user-id.sql
-- ============================================================================

ALTER TABLE pantry_item ADD COLUMN user_id BIGINT NULL AFTER expires_at;
