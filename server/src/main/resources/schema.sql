CREATE TABLE IF NOT EXISTS user_account (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(64) NOT NULL UNIQUE,
    unionid VARCHAR(64) NULL,
    nickname VARCHAR(64) NOT NULL,
    avatar_url VARCHAR(255) NULL,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    session_key VARCHAR(64) NULL,
    phone_number VARCHAR(20) NULL,
    current_family_id BIGINT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);
-- 会员资格已迁出 user_account：vip_status / plan_name 由 user_membership 表取代（见 ADR-0002/0005）。

CREATE TABLE IF NOT EXISTS user_membership (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    payer_user_id BIGINT NOT NULL,
    current_plan VARCHAR(32) NOT NULL,
    expires_at DATETIME NOT NULL,
    share_scope VARCHAR(16) NOT NULL DEFAULT 'FAMILY',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_membership_payer (payer_user_id),
    INDEX idx_membership_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS payment_order (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    out_trade_no VARCHAR(64) NOT NULL,
    payer_user_id BIGINT NOT NULL,
    family_id BIGINT NULL,
    plan_code VARCHAR(32) NOT NULL,
    amount_fen BIGINT NOT NULL,
    duration_days INT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    payment_method VARCHAR(16) NOT NULL DEFAULT 'MOCK',
    paid_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_order_out_trade_no (out_trade_no),
    INDEX idx_order_payer (payer_user_id, status),
    INDEX idx_order_status (status, id DESC)
);

CREATE TABLE IF NOT EXISTS family (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    name VARCHAR(64) NOT NULL,
    owner_user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_family_owner (owner_user_id)
);

CREATE TABLE IF NOT EXISTS family_member (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    family_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    member_role VARCHAR(32) NOT NULL DEFAULT 'member',
    member_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_family_user (family_id, user_id),
    INDEX idx_family_member_user (user_id)
);

CREATE TABLE IF NOT EXISTS recipe (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    title VARCHAR(128) NOT NULL,
    source_type VARCHAR(16) NOT NULL,
    source_url VARCHAR(512) NULL,
    owner_user_id BIGINT NOT NULL,
    family_id BIGINT NULL,
    cuisine VARCHAR(32) NOT NULL,
    taste_tags_json TEXT NOT NULL,
    time_cost INT NOT NULL DEFAULT 15,
    servings INT NOT NULL DEFAULT 2,
    rating DECIMAL(3,1) NOT NULL DEFAULT 4.5,
    summary VARCHAR(255) NULL,
    cover_image VARCHAR(512) NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_recipe_status_source (status, source_type),
    INDEX idx_recipe_family (family_id),
    INDEX idx_recipe_owner (owner_user_id),
    INDEX idx_recipe_cuisine (cuisine)
);

CREATE TABLE IF NOT EXISTS recipe_step (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    recipe_id BIGINT NOT NULL,
    step_no INT NOT NULL,
    step_text VARCHAR(500) NOT NULL,
    INDEX idx_step_recipe (recipe_id, step_no)
);

CREATE TABLE IF NOT EXISTS recipe_ingredient (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    recipe_id BIGINT NOT NULL,
    ingredient_name VARCHAR(128) NOT NULL,
    amount VARCHAR(32) NOT NULL DEFAULT '',
    unit VARCHAR(16) NOT NULL DEFAULT '',
    INDEX idx_ingredient_recipe (recipe_id)
);

CREATE TABLE IF NOT EXISTS cook_history (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    recipe_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    family_id BIGINT NOT NULL,
    cooked_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    score INT NULL,
    remark VARCHAR(255) NULL,
    INDEX idx_cook_history_user (user_id, cooked_at DESC),
    INDEX idx_cook_history_recipe (recipe_id)
);

CREATE TABLE IF NOT EXISTS daily_menu (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    family_id BIGINT NOT NULL,
    menu_date DATE NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'DRAFT',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_family_menu_date (family_id, menu_date)
);

CREATE TABLE IF NOT EXISTS daily_menu_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    daily_menu_id BIGINT NOT NULL,
    recipe_id BIGINT NOT NULL,
    meal_type VARCHAR(32) NOT NULL DEFAULT 'dinner',
    INDEX idx_menu_item_menu (daily_menu_id),
    INDEX idx_menu_item_recipe (recipe_id)
);

CREATE TABLE IF NOT EXISTS shopping_list (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    family_id BIGINT NOT NULL,
    daily_menu_id BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_shopping_menu (daily_menu_id),
    INDEX idx_shopping_family (family_id)
);

CREATE TABLE IF NOT EXISTS shopping_list_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    shopping_list_id BIGINT NOT NULL,
    ingredient_name VARCHAR(128) NOT NULL,
    amount VARCHAR(32) NOT NULL DEFAULT '',
    unit VARCHAR(16) NOT NULL DEFAULT '',
    purchased TINYINT(1) NOT NULL DEFAULT 0,
    is_manual TINYINT(1) NOT NULL DEFAULT 0,
    INDEX idx_shopping_item_list (shopping_list_id)
);

CREATE TABLE IF NOT EXISTS community_post (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    recipe_id BIGINT NULL,
    author_user_id BIGINT NOT NULL,
    title VARCHAR(128) NOT NULL,
    content TEXT NOT NULL,
    like_count INT NOT NULL DEFAULT 0,
    comment_count INT NOT NULL DEFAULT 0,
    tags_json TEXT NOT NULL,
    audit_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_post_audit (audit_status, like_count DESC),
    INDEX idx_post_author (author_user_id),
    INDEX idx_post_recipe (recipe_id)
);

CREATE TABLE IF NOT EXISTS community_post_comment (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    content VARCHAR(500) NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_comment_post (post_id, id DESC),
    INDEX idx_comment_user (user_id)
);

CREATE TABLE IF NOT EXISTS community_post_favorite (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_post_user (post_id, user_id),
    INDEX idx_fav_user (user_id)
);

CREATE TABLE IF NOT EXISTS community_post_report (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    reason VARCHAR(128) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    reviewer_user_id BIGINT NULL,
    review_note VARCHAR(255) NULL,
    resolved_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_report_post (post_id),
    INDEX idx_report_status (status, id DESC)
);

CREATE TABLE IF NOT EXISTS import_source (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    source_type VARCHAR(16) NOT NULL,
    source_url VARCHAR(512) NULL,
    source_text TEXT NULL,
    parse_status VARCHAR(16) NOT NULL DEFAULT 'PARSED',
    audit_status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS user_session (
    token VARCHAR(64) PRIMARY KEY,
    user_id BIGINT NOT NULL,
    login_type VARCHAR(16) NOT NULL,
    expires_at DATETIME NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_session_user (user_id),
    INDEX idx_session_expires (expires_at)
);

CREATE TABLE IF NOT EXISTS pantry_item (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    family_id BIGINT NOT NULL,
    ingredient_name VARCHAR(128) NOT NULL,
    amount VARCHAR(32) NOT NULL DEFAULT '',
    unit VARCHAR(16) NOT NULL DEFAULT '',
    expires_at DATE NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_pantry_family (family_id, created_at DESC)
);

CREATE TABLE IF NOT EXISTS phone_otp (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    phone VARCHAR(20) NOT NULL,
    code_hash VARCHAR(64) NOT NULL,
    expires_at DATETIME NOT NULL,
    consumed_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_phone_otp_phone (phone, created_at DESC)
);

CREATE TABLE IF NOT EXISTS feedback_ticket (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    family_id BIGINT NOT NULL,
    types_json TEXT NOT NULL,
    content TEXT NOT NULL,
    contact VARCHAR(128) NULL,
    images_json TEXT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'OPEN',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_feedback_family (family_id, created_at DESC),
    INDEX idx_feedback_status (status, id DESC)
);

CREATE TABLE IF NOT EXISTS notification_message (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    family_id BIGINT NOT NULL,
    kind VARCHAR(24) NOT NULL,
    title VARCHAR(128) NOT NULL,
    body_text VARCHAR(500) NOT NULL,
    action_type VARCHAR(32) NULL,
    unread TINYINT(1) NOT NULL DEFAULT 1,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_notification_user (user_id, unread, created_at DESC)
);

CREATE TABLE IF NOT EXISTS uploaded_file (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    original_name VARCHAR(255) NOT NULL,
    stored_name VARCHAR(255) NOT NULL,
    url VARCHAR(512) NOT NULL,
    size_bytes BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_uploaded_user (user_id, created_at DESC)
);

-- 旧库前向兼容 ALTER：仅保留 CREATE 阶段未覆盖的列补丁。
-- 这些列在早期部署的 user_account 里不存在，新库已在 CREATE 中建全，旧库靠下面两条补齐。
-- continue-on-error 让列已存在时安全跳过。
ALTER TABLE user_account ADD COLUMN phone_number VARCHAR(20) NULL;
ALTER TABLE user_account ADD COLUMN current_family_id BIGINT NULL;

-- 会员迁表收尾：清除旧库 user_account 上已废弃的会员列（见 ADR-0002/0005）。
-- 新库无此列时 continue-on-error 安全跳过；数据已不再读取，删除不影响业务。
ALTER TABLE user_account DROP COLUMN vip_status;
ALTER TABLE user_account DROP COLUMN plan_name;

-- T3: 成员忌口标签（JSON 数组），创建/编辑成员可写，菜单推荐与今日菜单过滤读取。
-- 不使用 IF NOT EXISTS（部分 MySQL 版本不支持），依赖 continue-on-error 兜底旧部署列已存在的情况。
ALTER TABLE family_member ADD COLUMN avoid_tags_json TEXT DEFAULT NULL COMMENT '忌口标签JSON数组';

-- 许愿池：家庭共享，按日期+餐次分槽（见 家庭点菜-核心方案 §5）。
CREATE TABLE IF NOT EXISTS family_wish (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    family_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    wish_date DATE NOT NULL,
    slot VARCHAR(16) NOT NULL DEFAULT 'dinner',
    text VARCHAR(128) NOT NULL,
    recipe_id BIGINT NULL,
    author_name VARCHAR(64) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_wish_family_date_slot (family_id, wish_date, slot, id)
);
