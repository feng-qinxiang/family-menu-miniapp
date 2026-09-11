-- ============================================================================
-- 清理历史演示数据与废弃游客账号（本地/测试库用；生产库请先确认再执行）
--
-- 为什么需要它：早期版本 app.seed-demo-data 默认开启，凡启动过或登录过就会留下
--   种子账号（seed-*）、演示管理员（admin-demo-*）、演示会员与订单（SEED-DEMO-*），
--   以及每个游客账号自带的"周末厨房"家庭与演示菜单/购物清单/库存/做菜记录。
-- 后果是运营后台的账号数、家庭数与小程序里看到的完全对不上（典型症状：后台 4 个
-- 重名"周末厨房"，小程序里只有 1 个当前家庭）。
--
-- 把开关默认值改成 false 只保证"以后不再产生"，已经写进库的必须靠本脚本清。
--
-- 执行：mysql -u<user> -p <库名> < server/sql/cleanup-demo-data.sql
-- ⚠️ 会删数据，请先备份：mysqldump -uroot -p --databases <库名> > backup.sql
--
-- 分两段，按需执行：
--   第一段（默认启用）清「明确的演示数据」，任何环境都该删。
--   第二段（默认注释）清「废弃的游客账号」，只在本地开发库用 —— 生产库里游客就是真实用户。
-- ============================================================================


-- ============================================================================
-- 第一段：演示数据（种子账号 / 演示管理员 / 演示会员与订单）
-- ============================================================================

SET @demo_users = 'seed-aunt-ning,seed-zhou,seed-mao,seed-family-chef,admin-demo-openid,admin-demo-mod,admin-demo-sup';

-- 1) 这些账号产生的 UGC 与个人数据
DELETE c  FROM community_post_comment  c  JOIN user_account u ON u.id = c.user_id            WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE l  FROM community_post_like     l  JOIN user_account u ON u.id = l.user_id            WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE fv FROM community_post_favorite fv JOIN user_account u ON u.id = fv.user_id           WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE rp FROM community_post_report   rp JOIN user_account u ON u.id = rp.user_id           WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE cp FROM community_post          cp JOIN user_account u ON u.id = cp.author_user_id    WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE nm FROM notification_message    nm JOIN user_account u ON u.id = nm.user_id           WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE ch FROM cook_history            ch JOIN user_account u ON u.id = ch.user_id           WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE us FROM user_session            us JOIN user_account u ON u.id = us.user_id           WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE um FROM user_membership         um JOIN user_account u ON u.id = um.payer_user_id     WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE po FROM payment_order           po JOIN user_account u ON u.id = po.payer_user_id     WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE ir FROM import_source           ir JOIN user_account u ON u.id = ir.reviewer_user_id  WHERE FIND_IN_SET(u.openid, @demo_users);

-- 2) 演示账号拥有的家庭：先清家庭内的菜单/清单/库存，再删关系与家庭
DELETE dmi FROM daily_menu_item dmi JOIN daily_menu dm ON dm.id = dmi.daily_menu_id
  JOIN family f ON f.id = dm.family_id JOIN user_account u ON u.id = f.owner_user_id
 WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE dm FROM daily_menu dm JOIN family f ON f.id = dm.family_id
  JOIN user_account u ON u.id = f.owner_user_id WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE sli FROM shopping_list_item sli JOIN shopping_list sl ON sl.id = sli.shopping_list_id
  JOIN family f ON f.id = sl.family_id JOIN user_account u ON u.id = f.owner_user_id
 WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE sl FROM shopping_list sl JOIN family f ON f.id = sl.family_id
  JOIN user_account u ON u.id = f.owner_user_id WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE pi FROM pantry_item pi JOIN family f ON f.id = pi.family_id
  JOIN user_account u ON u.id = f.owner_user_id WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE fw FROM family_wish fw JOIN family f ON f.id = fw.family_id
  JOIN user_account u ON u.id = f.owner_user_id WHERE FIND_IN_SET(u.openid, @demo_users);

-- 3) 演示账号自建的菜谱。is_public = 0 这个条件必须留着：
--    公共菜谱库（is_public = 1）挂在平台账号下，是产品能力，删了小程序菜谱页就空了。
DELETE rs FROM recipe_step rs JOIN recipe r ON r.id = rs.recipe_id
  JOIN user_account u ON u.id = r.owner_user_id
 WHERE FIND_IN_SET(u.openid, @demo_users) AND r.is_public = 0;
DELETE ri FROM recipe_ingredient ri JOIN recipe r ON r.id = ri.recipe_id
  JOIN user_account u ON u.id = r.owner_user_id
 WHERE FIND_IN_SET(u.openid, @demo_users) AND r.is_public = 0;
DELETE r FROM recipe r JOIN user_account u ON u.id = r.owner_user_id
 WHERE FIND_IN_SET(u.openid, @demo_users) AND r.is_public = 0;

-- 4) 成员关系、家庭、账号
DELETE fm FROM family_member fm JOIN user_account u ON u.id = fm.user_id
  WHERE FIND_IN_SET(u.openid, @demo_users);
UPDATE user_account SET current_family_id = NULL WHERE FIND_IN_SET(openid, @demo_users);
DELETE f FROM family f JOIN user_account u ON u.id = f.owner_user_id
  WHERE FIND_IN_SET(u.openid, @demo_users);
DELETE FROM user_account WHERE FIND_IN_SET(openid, @demo_users);

-- 5) 演示会员与订单（挂在平台账号下，按单号前缀识别，不靠账号归属）
DELETE FROM user_membership WHERE payer_user_id = 1 AND current_plan IS NOT NULL
  AND payer_user_id NOT IN (SELECT id FROM user_account WHERE openid LIKE 'guest-%');
DELETE FROM payment_order WHERE out_trade_no LIKE 'SEED-DEMO-%';


-- ============================================================================
-- 第二段：废弃的游客账号与它们的"周末厨房"（本地开发库专用，默认注释掉）
--
-- 为什么本地会攒出一堆：小程序里清一次缓存 = 换一个游客身份 = 新账号 + 新家庭。
-- 开发期反复清缓存，后台就会堆出一排重名"周末厨房"和昵称全是"家人"的账号。
-- 生产环境不要执行这段：生产里的游客就是真实用户。
--
-- 用法：先跑下面的自查查询（会列出每个游客家庭的数据量与最后活动时间），
--       确认哪个是你正在用的，把它从 @keep 里排除后再执行第三段。
-- ============================================================================

-- 自查：每个游客家庭有多少数据、最后活动时间，据此判断哪个是"活的"
SELECT f.id AS family_id, f.name, f.invite_token, f.owner_user_id,
       (SELECT nickname FROM user_account WHERE id = f.owner_user_id) AS owner,
       (SELECT COUNT(*) FROM daily_menu    dm WHERE dm.family_id = f.id) AS menus,
       (SELECT COUNT(*) FROM shopping_list sl WHERE sl.family_id = f.id) AS shop_lists,
       (SELECT COUNT(*) FROM pantry_item   pi WHERE pi.family_id = f.id) AS pantry,
       (SELECT COUNT(*) FROM cook_history  ch WHERE ch.family_id = f.id) AS cooks,
       (SELECT MAX(created_at) FROM daily_menu WHERE family_id = f.id)   AS last_menu_at
  FROM family f
  JOIN user_account u ON u.id = f.owner_user_id
 WHERE u.openid LIKE 'guest-%' AND u.openid <> 'guest_default'
 ORDER BY last_menu_at DESC;

-- 第三段（确认后取消注释再执行）：把 @keep 改成你要保留的家庭 id，其余游客家庭连账号一起清
-- SET @keep = 4;   -- 你正在用的那个家庭 id（从上面的自查结果里选，按 last_menu_at 最新挑）
-- SET @waste_users = (SELECT GROUP_CONCAT(u.openid) FROM family f JOIN user_account u ON u.id = f.owner_user_id
--                      WHERE u.openid LIKE 'guest-%' AND u.openid <> 'guest_default' AND f.id <> @keep);
-- SET @waste_families = (SELECT GROUP_CONCAT(f.id) FROM family f JOIN user_account u ON u.id = f.owner_user_id
--                         WHERE u.openid LIKE 'guest-%' AND u.openid <> 'guest_default' AND f.id <> @keep);
-- （然后按第一段同样的删除顺序，把 @demo_users 换成 @waste_users、家庭条件换成 @waste_families 执行一遍）


-- ============================================================================
-- 执行结果自查
-- ============================================================================
SELECT (SELECT COUNT(*) FROM user_account) AS users,
       (SELECT COUNT(*) FROM family) AS families,
       (SELECT COUNT(*) FROM recipe WHERE is_public = 1) AS public_recipes,
       (SELECT COUNT(*) FROM payment_order) AS orders,
       (SELECT COUNT(*) FROM user_membership) AS memberships;
-- 孤儿检查：这几个数都该是 0，否则说明删漏了关联数据
SELECT (SELECT COUNT(*) FROM recipe r WHERE r.owner_user_id NOT IN (SELECT id FROM user_account)) AS orphan_recipes,
       (SELECT COUNT(*) FROM recipe_ingredient ri WHERE ri.recipe_id NOT IN (SELECT id FROM recipe)) AS orphan_ingredients,
       (SELECT COUNT(*) FROM recipe_step rs WHERE rs.recipe_id NOT IN (SELECT id FROM recipe)) AS orphan_steps,
       (SELECT COUNT(*) FROM community_post p WHERE p.author_user_id NOT IN (SELECT id FROM user_account)) AS orphan_posts,
       (SELECT COUNT(*) FROM family_member fm WHERE fm.user_id NOT IN (SELECT id FROM user_account)) AS orphan_members,
       (SELECT COUNT(*) FROM family f WHERE f.owner_user_id NOT IN (SELECT id FROM user_account)) AS orphan_families;
