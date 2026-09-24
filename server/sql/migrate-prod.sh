#!/usr/bin/env bash
# ============================================================================
# 生产库三条索引迁移一键脚本：备份 → 执行 → 校验，失败即停（set -e）。
#
# 对应手册：spec/LAUNCH-CHECKLIST.md §「三条索引迁移的执行手册」。
# 脚本只做索引 DDL 与一致性校验，不写、不改、不删任何业务数据；
# migrate-post-feed-index.sql 是唯一含 DROP+ADD 的（低峰期执行）。
#
# 用法（在 server/sql 目录或任意位置）：
#   bash migrate-prod.sh <用户名> <数据库名>
# 会提示输入一次密码（MYSQL_PWD 传给 mysql/mysqldump，避免每步都问）。
#
# 回滚：见手册第 4 步（索引变更不改数据，回滚 = DROP 新形状 + ADD 回旧形状）；
# 本脚本产生的备份 dump 始终留在当前目录兜底。
# ============================================================================
set -euo pipefail

if [ "$#" -ne 2 ]; then
  echo "用法: bash migrate-prod.sh <用户名> <数据库名>" >&2
  exit 64
fi
DB_USER="$1"
DB_NAME="$2"
cd "$(dirname "$0")"

printf 'MySQL 密码（%s@%s）: ' "$DB_USER" "$DB_NAME"
read -rs MYSQL_PWD
echo
export MYSQL_PWD

DUMP="backup-${DB_NAME}-$(date +%F-%H%M).sql"

echo "== 1/3 备份 -> $DUMP =="
mysqldump -u"$DB_USER" --single-transaction --routines --triggers "$DB_NAME" > "$DUMP"
echo "   备份完成（$(du -h "$DUMP" | cut -f1)）"

echo "== 2/3 执行三条迁移 =="
for f in migrate-import-source-index.sql migrate-post-feed-index.sql migrate-cook-history-family-index.sql; do
  echo "-- $f"
  # 脚本末尾自带 EXPLAIN 自检，输出里有执行计划行是正常的；退出码非 0 即失败并停止
  mysql -u"$DB_USER" "$DB_NAME" < "$f"
done

echo "== 3/3 校验索引形状（期望 4 条，列序见注释）==="
mysql -u"$DB_USER" "$DB_NAME" -e "
SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) cols
FROM information_schema.statistics
WHERE table_schema = DATABASE() AND index_name IN
  ('idx_import_source_audit','idx_post_audit','idx_cook_history_family','idx_cook_history_family_recipe')
GROUP BY table_name, index_name;
-- 期望：community_post/idx_post_audit = audit_status,like_count,id
--       cook_history/idx_cook_history_family = family_id,cooked_at
--       cook_history/idx_cook_history_family_recipe = family_id,recipe_id
--       import_source/idx_import_source_audit = audit_status,id"

echo "== 最重查询计划抽查（应 type=ref 且无 Using filesort）=="
mysql -u"$DB_USER" "$DB_NAME" -e "
EXPLAIN SELECT id FROM cook_history WHERE family_id = 1 ORDER BY cooked_at DESC LIMIT 50\G"

echo "全部完成：备份留在 $DUMP；如需回滚见 LAUNCH-CHECKLIST 手册第 4 步。"
