-- 可重复执行；只新增照片映射，不改库存、菜单或采购数量。
CREATE TABLE IF NOT EXISTS ingredient_photo (
    family_id BIGINT NOT NULL,
    ingredient_name VARCHAR(128) NOT NULL,
    cover_image VARCHAR(512) NOT NULL,
    PRIMARY KEY (family_id, ingredient_name)
);
