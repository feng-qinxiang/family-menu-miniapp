-- 先执行此迁移，再上线新的前后端。可重复执行；不改、不删已有业务记录。
-- 若同一菜单/菜谱/餐次已有重复行，最后一条 DDL 会失败：应先人工核对并保留状态，禁止自动删重。
SET @add_completion := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE cook_history ADD COLUMN completion_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NULL',
    'DO 0')
  FROM information_schema.columns
  WHERE table_schema = DATABASE() AND table_name = 'cook_history' AND column_name = 'completion_id');
PREPARE st FROM @add_completion;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @add_completion_key := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE cook_history ADD UNIQUE KEY uk_cook_completion (family_id, user_id, completion_id)',
    'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'cook_history' AND index_name = 'uk_cook_completion');
PREPARE st FROM @add_completion_key;
EXECUTE st;
DEALLOCATE PREPARE st;

SET @add_menu_key := (SELECT IF(COUNT(*) = 0,
    'ALTER TABLE daily_menu_item ADD UNIQUE KEY uk_menu_recipe_meal (daily_menu_id, recipe_id, meal_type)',
    'DO 0')
  FROM information_schema.statistics
  WHERE table_schema = DATABASE() AND table_name = 'daily_menu_item' AND index_name = 'uk_menu_recipe_meal');
PREPARE st FROM @add_menu_key;
EXECUTE st;
DEALLOCATE PREPARE st;
