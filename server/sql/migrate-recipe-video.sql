-- 2026-11-16 整道菜教学视频独立成列（对已有库执行一次；全新库由 schema.sql 直接建出）。可重复执行。
-- 背景：以前编辑页把整道菜的视频存进第 1 步的 recipe_step.video_url；现在每一步都能传自己的视频，两者必须分开。
-- 列不存在时：加列，并把第 1 步上的视频挪到 recipe.video_url、第 1 步清空。
-- 列已存在时什么都不做：再挪一次会把用户给第 1 步传的步骤视频当成整道菜视频。
-- （多表 UPDATE 不保证赋值顺序，所以「复制」和「清空」分两条。）
SET @recipe_video_column = (
    SELECT COUNT(*) FROM information_schema.COLUMNS
    WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'recipe' AND COLUMN_NAME = 'video_url'
);

SET @recipe_video_sql = IF(@recipe_video_column = 0,
    'ALTER TABLE recipe ADD COLUMN video_url VARCHAR(512) NULL AFTER cover_image',
    'SELECT 1');
PREPARE recipe_video_stmt FROM @recipe_video_sql;
EXECUTE recipe_video_stmt;
DEALLOCATE PREPARE recipe_video_stmt;

SET @recipe_video_sql = IF(@recipe_video_column = 0,
    'UPDATE recipe r JOIN recipe_step s ON s.recipe_id = r.id AND s.step_no = 1
        SET r.video_url = s.video_url
      WHERE s.video_url IS NOT NULL AND s.video_url <> ''''',
    'SELECT 1');
PREPARE recipe_video_stmt FROM @recipe_video_sql;
EXECUTE recipe_video_stmt;
DEALLOCATE PREPARE recipe_video_stmt;

SET @recipe_video_sql = IF(@recipe_video_column = 0,
    'UPDATE recipe_step s JOIN recipe r ON r.id = s.recipe_id
        SET s.video_url = NULL
      WHERE s.step_no = 1 AND s.video_url = r.video_url',
    'SELECT 1');
PREPARE recipe_video_stmt FROM @recipe_video_sql;
EXECUTE recipe_video_stmt;
DEALLOCATE PREPARE recipe_video_stmt;
