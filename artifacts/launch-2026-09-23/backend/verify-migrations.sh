#!/usr/bin/env bash
# 迁移脚本本地验证：正确性 + 幂等性（只碰本地库 fm_migrate_check，绝不连生产库）。
# 用法：bash verify-migrations.sh   （输出即证据，见 03-migrations.log）
set -u
cd "$(dirname "$0")/../../../server" || exit 1
DB=fm_migrate_check
MY=(mysql -uroot -p123456 "$DB")
SQL() { "${MY[@]}" -e "$1" 2>/dev/null; }
# 执行一个 .sql 文件，回显退出码（0=成功；非 0=脚本在报错）
runsql() {
  local f="$1" out rc
  out=$("${MY[@]}" < "sql/$f" 2>&1); rc=$?
  echo "$out" | grep -v "Using a password" | grep -v "^Warning"
  echo "   >> $f rc=$rc"
  return $rc
}

echo "=== 准备：schema.sql 建全新库，再手工退回「迁移前」的旧结构 ==="
mysql -uroot -p123456 -e "DROP DATABASE IF EXISTS $DB; CREATE DATABASE $DB DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;" 2>/dev/null
"${MY[@]}" < src/main/resources/schema.sql 2>/dev/null
SQL "ALTER TABLE cook_history DROP INDEX idx_cook_history_family, DROP INDEX idx_cook_history_family_recipe;
     ALTER TABLE import_source DROP INDEX idx_import_source_audit;
     ALTER TABLE community_post DROP INDEX idx_post_audit;
     ALTER TABLE community_post ADD INDEX idx_post_audit (audit_status, like_count);"
echo "旧结构就绪：cook_history 无 (family_id,*) 索引；import_source 无审核索引；idx_post_audit 缺 id DESC。"

for f in migrate-import-source-index.sql migrate-post-feed-index.sql migrate-cook-history-family-index.sql; do
  echo; echo "######## $f"; echo "-- 第 1 次执行（升级旧库）"; runsql "$f"
  echo "-- 第 2 次执行（幂等性考验）"; runsql "$f"
done

echo; echo "######## 边界：idx_post_audit 完全不存在时是否还能跑（迁移做了一半的库）"
SQL "ALTER TABLE community_post DROP INDEX idx_post_audit;"
echo "-- 索引已删除，再执行一次"; runsql migrate-post-feed-index.sql
SQL "ALTER TABLE community_post DROP INDEX idx_post_audit;
     ALTER TABLE community_post ADD INDEX idx_post_audit (audit_status, like_count DESC, id DESC);"

echo; echo "=== 结构校验（迁移后应有的索引形状）==="
SQL "SELECT table_name, index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) cols
     FROM information_schema.statistics
     WHERE table_schema=DATABASE() AND index_name IN
       ('idx_import_source_audit','idx_post_audit','idx_cook_history_family','idx_cook_history_family_recipe')
     GROUP BY table_name, index_name ORDER BY table_name, index_name;"

echo; echo "=== 执行计划校验（三条都是索引形的重要查询，不该出现 type=ALL / Using filesort）==="
echo "-- 导入审核队列"; SQL "EXPLAIN SELECT id FROM import_source WHERE audit_status='PENDING' ORDER BY id DESC LIMIT 20;"
echo "-- 社区信息流首页"; SQL "EXPLAIN SELECT id FROM community_post WHERE audit_status='APPROVED' ORDER BY like_count DESC, id DESC LIMIT 20;"
echo "-- 做菜记录"; SQL "EXPLAIN SELECT id FROM cook_history WHERE family_id=1 ORDER BY cooked_at DESC LIMIT 50;"
echo "-- 菜谱列表带「我家做过几次」"; SQL "EXPLAIN SELECT recipe_id, COUNT(*) FROM cook_history WHERE family_id=1 GROUP BY recipe_id;"
