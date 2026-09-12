CREATE TABLE IF NOT EXISTS user_account (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    openid VARCHAR(64) NOT NULL UNIQUE,
    unionid VARCHAR(64) NULL,
    nickname VARCHAR(64) NOT NULL,
    avatar_url VARCHAR(255) NULL,
    is_admin TINYINT(1) NOT NULL DEFAULT 0,
    -- 管理端角色：SUPER 超管 / MODERATOR 内容审核员 / SUPPORT 客服；NULL 表示非管理员
    -- 历史数据 is_admin=1 且 admin_role IS NULL 视为 SUPER（见 AdminRole.of）
    admin_role VARCHAR(16) NULL,
    -- 账号停用状态：ACTIVE 正常 / BANNED 封禁（封禁用户所有会话立即失效且无法再登录）
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    session_key VARCHAR(64) NULL,
    phone_number VARCHAR(20) NULL,
    current_family_id BIGINT NULL,
    -- 个人资料：性别 / 生日 / 口味偏好标签。
    -- 口味偏好是用户自己声明的，与 GET /api/preference/profile 从做菜记录"推断"出来的画像是两回事。
    -- 忌口不在这里：它按「家庭 + 成员」存于 family_member.avoid_tags_json，资料页编辑的是同一个字段，
    -- 不另开一列以免出现两处真相。
    gender VARCHAR(16) NULL,
    birthday DATE NULL,
    taste_tags_json TEXT NULL,
    -- 微信订阅消息开关（默认关：不打扰是默认值）。
    -- 这一列只表示"用户愿不愿意收"，不代表配额——能发几条由微信按用户授权次数决定，服务端查不到。
    subscribe_enabled TINYINT(1) NOT NULL DEFAULT 0,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    UNIQUE KEY uk_user_phone (phone_number)
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
    -- 邀请令牌：新成员凭链接加入，可重置
    invite_token VARCHAR(32) NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_family_owner (owner_user_id),
    UNIQUE INDEX idx_family_invite (invite_token)
);

CREATE TABLE IF NOT EXISTS family_member (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    family_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    member_role VARCHAR(32) NOT NULL DEFAULT 'member',
    member_status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    avoid_tags_json TEXT NULL,
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
    -- 1 = 种子/公共菜谱，对全部家庭可见；0 = 家庭私有。
    -- 取代历史上按 family_id = 1 判断公共菜谱的写法：那会让"第一个真实家庭"意外全球可见。
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    cuisine VARCHAR(32) NOT NULL,
    taste_tags_json TEXT NOT NULL,
    time_cost INT NOT NULL DEFAULT 15,
    servings INT NOT NULL DEFAULT 2,
    rating DECIMAL(3,1) NOT NULL DEFAULT 4.5,
    summary VARCHAR(255) NULL,
    cover_image VARCHAR(512) NULL,
    difficulty VARCHAR(16) NOT NULL DEFAULT 'medium',
    status VARCHAR(16) NOT NULL DEFAULT 'ACTIVE',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
    INDEX idx_recipe_status_source (status, source_type),
    INDEX idx_recipe_public (is_public, status),
    INDEX idx_recipe_family (family_id),
    INDEX idx_recipe_owner (owner_user_id),
    INDEX idx_recipe_cuisine (cuisine)
);

CREATE TABLE IF NOT EXISTS recipe_step (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    recipe_id BIGINT NOT NULL,
    step_no INT NOT NULL,
    step_text VARCHAR(500) NOT NULL,
    -- 步骤配图/教学视频（/uploads/ 相对 URL）。历史上前端把 {text,image,video} 编码塞进 step_text，
    -- 2026-09-12 起改为独立列；存量数据回填见 server/sql/migrate-step-media.sql
    image_url VARCHAR(512) NULL,
    video_url VARCHAR(512) NULL,
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
    -- 菜单项状态（todo/done）与添加人昵称（列表直接展示）
    status VARCHAR(16) NOT NULL DEFAULT 'todo',
    added_by_name VARCHAR(64) NULL,
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
    -- 帖子配图（JSON 字符串数组，元素为 /uploads/ 图片 URL，最多 6 张）
    images_json TEXT NULL,
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
    -- 评论同样需要审核：无法机审时先 PENDING，仅作者本人可见（详见 ContentSecurityService）
    audit_status VARCHAR(16) NOT NULL DEFAULT 'APPROVED',
    -- 软删除：管理员删除后保留行，支持恢复
    deleted TINYINT(1) NOT NULL DEFAULT 0,
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

-- 帖子点赞：与收藏分离（点赞表达喜欢，收藏用于「我的收藏」列表）
CREATE TABLE IF NOT EXISTS community_post_like (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    UNIQUE KEY uk_like_post_user (post_id, user_id),
    INDEX idx_like_user (user_id)
);

CREATE TABLE IF NOT EXISTS community_post_report (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    post_id BIGINT NOT NULL,
    user_id BIGINT NOT NULL,
    reason VARCHAR(128) NOT NULL,
    description VARCHAR(500) NULL,
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
    reviewer_user_id BIGINT NULL,
    review_note VARCHAR(255) NULL,
    resolved_at DATETIME NULL,
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
);

-- token 列存的是 bearer token 的 SHA-256 十六进制摘要，不是明文：
-- 数据库泄露时无法直接冒用会话。老库遗留的明文行会因哈希不匹配自然失效。
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
    -- 处理留痕：谁处理的、什么时候、回复内容
    handled_by BIGINT NULL,
    handled_at DATETIME NULL,
    reply TEXT NULL,
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

-- 运营审计日志：记录管理员的每一次敏感操作（谁、何时、对什么、做了什么、结果）。
-- 只增不改不删，用于事后追责与合规。
CREATE TABLE IF NOT EXISTS admin_audit_log (
    id BIGINT PRIMARY KEY AUTO_INCREMENT,
    actor_user_id BIGINT NOT NULL,
    actor_nickname VARCHAR(64) NULL,
    action VARCHAR(64) NOT NULL,
    target_type VARCHAR(32) NOT NULL,
    target_id VARCHAR(64) NULL,
    detail VARCHAR(512) NULL,
    result VARCHAR(16) NOT NULL DEFAULT 'OK',
    created_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    INDEX idx_audit_actor (actor_user_id, id DESC),
    INDEX idx_audit_created (created_at DESC)
);

-- ============================================================================
-- 本文件只包含 CREATE TABLE IF NOT EXISTS，可重复执行（幂等）。
--
-- 历史遗留的 ALTER TABLE 补丁（给"早期部署的旧库"补列）已移到
-- server/sql/migrate-legacy.sql。原因：MySQL 8 的 ALTER 不支持 IF NOT EXISTS，
-- 重复执行会以 1060/1061 报错并中断 mysql CLI —— 生产建库流程必须能安全重跑。
-- 新库用本文件即可建全所有列，无需执行 migrate-legacy.sql。
-- ============================================================================
