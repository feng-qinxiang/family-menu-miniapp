-- ============================================================================
-- 旧库补列脚本（只给"本次改动之前已经部署过的库"用一次）
--
-- 新库不需要执行本文件：src/main/resources/schema.sql 里的 CREATE TABLE 已包含全部列。
--
-- 为什么单独放这里：
--   MySQL 8 的 ALTER TABLE 不支持 IF NOT EXISTS，重复执行会以 1060/1061 报错
--   并中断 mysql CLI。以前这些 ALTER 混在 schema.sql 里、靠 Spring 的
--   continue-on-error 吞错才没炸；生产建库是手动跑 mysql，必须能安全重跑，
--   所以把它们从 schema.sql 挪出来。
--
-- 用法（每个 ALTER 只需成功执行一次；列已存在时会报错，可忽略或加 --force）：
--   mysql -uroot -p family_menu_daily_db --force < sql/migrate-legacy.sql
-- ============================================================================

-- ---- user_account ----
ALTER TABLE user_account ADD COLUMN phone_number VARCHAR(20) NULL;
ALTER TABLE user_account ADD COLUMN current_family_id BIGINT NULL;
ALTER TABLE user_account ADD UNIQUE KEY uk_user_phone (phone_number);
ALTER TABLE user_account ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE';

-- 会员列已迁到 user_membership（见 ADR-0002/0005），旧库如需清理请手动执行一次：
--   ALTER TABLE user_account DROP COLUMN vip_status;
--   ALTER TABLE user_account DROP COLUMN plan_name;

-- ---- import_source ----
ALTER TABLE import_source ADD COLUMN reviewer_user_id BIGINT NULL;
ALTER TABLE import_source ADD COLUMN review_note VARCHAR(255) NULL;
ALTER TABLE import_source ADD COLUMN resolved_at DATETIME NULL;

-- ---- family_member ----
ALTER TABLE family_member ADD COLUMN avoid_tags_json TEXT DEFAULT NULL COMMENT '忌口标签JSON数组';

-- ---- family ----
ALTER TABLE family ADD COLUMN invite_token VARCHAR(32) NULL UNIQUE;

-- ---- community_post_report ----
ALTER TABLE community_post_report ADD COLUMN description VARCHAR(500) NULL;

-- ---- community_post_comment ----
ALTER TABLE community_post_comment ADD COLUMN deleted TINYINT(1) NOT NULL DEFAULT 0;
-- 评论审核状态：旧数据默认 APPROVED（历史内容保持可见），新内容按机审结果写入
ALTER TABLE community_post_comment ADD COLUMN audit_status VARCHAR(16) NOT NULL DEFAULT 'APPROVED';

-- ---- user_account ----
-- 管理端角色分级：历史 is_admin=1 的账号保持 admin_role=NULL，代码按 SUPER 处理，无需回填。
ALTER TABLE user_account ADD COLUMN admin_role VARCHAR(16) NULL AFTER is_admin;
-- 个人资料（口味画像）：性别 / 生日 / 口味偏好标签。
-- 忌口不加列：已有 family_member.avoid_tags_json 承担该职责。
ALTER TABLE user_account ADD COLUMN gender VARCHAR(16) NULL;
ALTER TABLE user_account ADD COLUMN birthday DATE NULL;
ALTER TABLE user_account ADD COLUMN taste_tags_json TEXT NULL;
-- 微信订阅消息开关（默认关）。只表示用户愿不愿意收，不代表可发条数。
ALTER TABLE user_account ADD COLUMN subscribe_enabled TINYINT(1) NOT NULL DEFAULT 0;

-- ---- daily_menu_item ----
ALTER TABLE daily_menu_item ADD COLUMN status VARCHAR(16) NOT NULL DEFAULT 'todo';
ALTER TABLE daily_menu_item ADD COLUMN added_by_name VARCHAR(64) NULL;

-- ---- recipe ----
ALTER TABLE recipe ADD COLUMN difficulty VARCHAR(16) NOT NULL DEFAULT 'medium' AFTER cover_image;
-- 公共菜谱标记：取代旧的 family_id = 1 判断（那会让"第一个真实家庭"意外全球可见）。
ALTER TABLE recipe ADD COLUMN is_public TINYINT(1) NOT NULL DEFAULT 0;
ALTER TABLE recipe ADD INDEX idx_recipe_public (is_public, status);

-- ---- feedback_ticket ----
ALTER TABLE feedback_ticket ADD COLUMN handled_by BIGINT NULL;
ALTER TABLE feedback_ticket ADD COLUMN handled_at DATETIME NULL;
ALTER TABLE feedback_ticket ADD COLUMN reply TEXT NULL;

-- ---- 数据回填：把旧的种子菜谱标记为公共 ----
-- data.sql 里的种子菜谱原本靠 family_id = 1 被所有人看到，迁移后改用 is_public = 1。
-- 只在"种子家庭确实存在且就是演示家庭"时回填，避免误标记真实用户的菜谱。
UPDATE recipe r
JOIN family_member fm ON fm.family_id = r.family_id
JOIN user_account u ON u.id = fm.user_id
SET r.is_public = 1
WHERE u.openid IN ('seed-aunt-ning', 'seed-zhou', 'seed-mao');
