-- ============================================================================
-- 演示数据（只在 app.seed-demo-data = true 时执行，默认关，生产固定关）
--
-- 由 SeedRunner 在启动时用 ResourceDatabasePopulator 执行，**排在 seedDefaults() 之后**：
-- 下面有若干 UPDATE 语句靠 openid 关联种子账号（阿宁/小周/猫猫），账号得先存在。
--
-- 内容：种子账号、演示会员与订单、演示家庭的今日菜单/购物清单/库存/做菜记录/通知、演示社区帖子。
-- 放这里而不是 data.sql，是因为这些数据会在运营后台里长成一堆"凭空出现的账号与家庭"，
-- 与小程序里用户自己看到的东西对不上。
-- ============================================================================

INSERT IGNORE INTO user_account (openid, nickname, avatar_url)
VALUES
('seed-aunt-ning', '阿宁', ''),
('seed-zhou', '小周', ''),
('seed-mao', '猫猫', '');

-- Community posts
INSERT IGNORE INTO community_post (id, recipe_id, author_user_id, title, content, like_count, comment_count, tags_json, audit_status)
VALUES
(1, 6, 1, '分享我的麻婆豆腐做法', '用嫩豆腐口感更好，关键是最后勾芡要薄，让汤汁裹住豆腐。花椒粉一定要最后撒，香气才足。', 12, 3, '["川菜","下饭","辣"]', 'APPROVED'),
(2, 8, 1, '糖醋排骨的秘诀', '排骨先炸后炒是关键，糖醋汁比例 2:3:4（糖:醋:水），最后大火收汁挂上亮油。', 8, 1, '["粤菜","宴客","酸甜"]', 'APPROVED');

UPDATE community_post
SET title = '我把西兰花步骤改顺手了',
    content = '蒜末不要炒太久，西兰花焯完沥干再下锅，最后只要快炒几下。',
    tags_json = '["家常","配菜","经验"]'
WHERE title = '外链导入后我改了三个步骤';

UPDATE community_post p
JOIN user_account u ON u.openid = 'seed-aunt-ning'
SET p.author_user_id = u.id
WHERE p.title = '周末家常三菜一汤';

UPDATE community_post p
JOIN user_account u ON u.openid = 'seed-zhou'
SET p.author_user_id = u.id
WHERE p.title = '下班 20 分钟快手餐';

UPDATE community_post p
JOIN user_account u ON u.openid = 'seed-mao'
SET p.author_user_id = u.id
WHERE p.title = '我把西兰花步骤改顺手了';

-- Demo expansion: richer data for linkage and presentation
UPDATE user_account SET phone_number = '13800138000', current_family_id = 1 WHERE id = 1;
UPDATE user_account SET current_family_id = 1 WHERE openid IN ('seed-aunt-ning', 'seed-zhou', 'seed-mao');

-- Demo membership: 平台账号持一份年卡，共享给家庭，演示用未来到期日（见 ADR-0002/0005）
INSERT IGNORE INTO user_membership (id, payer_user_id, current_plan, expires_at, share_scope)
VALUES (1, 1, 'annual', DATE_ADD(NOW(), INTERVAL 365 DAY), 'FAMILY');

INSERT IGNORE INTO payment_order (id, out_trade_no, payer_user_id, family_id, plan_code, amount_fen, duration_days, status, payment_method, paid_at)
VALUES (1, 'SEED-DEMO-ANNUAL-0001', 1, 1, 'annual', 9900, 365, 'PAID', 'MOCK', NOW());

INSERT IGNORE INTO family_member (family_id, user_id, member_role, member_status)
SELECT 1, id, 'member', 'ACTIVE' FROM user_account WHERE openid IN ('seed-aunt-ning', 'seed-zhou', 'seed-mao');

INSERT IGNORE INTO daily_menu (id, family_id, menu_date, status)
VALUES (1001, 1, CURRENT_DATE, 'READY');

INSERT IGNORE INTO daily_menu_item (id, daily_menu_id, recipe_id, meal_type)
VALUES
  (1001, 1001, 1, 'lunch'),
  (1002, 1001, 101, 'lunch'),
  (1003, 1001, 105, 'dinner'),
  (1004, 1001, 104, 'dinner');

INSERT IGNORE INTO shopping_list (id, family_id, daily_menu_id, status)
VALUES (1001, 1, 1001, 'OPEN');

INSERT IGNORE INTO shopping_list_item (id, shopping_list_id, ingredient_name, amount, unit, purchased, is_manual)
VALUES
  (1001, 1001, '番茄', '2', '个', 0, 0),
  (1002, 1001, '鸡蛋', '5', '个', 1, 0),
  (1003, 1001, '牛肉', '250', 'g', 0, 0),
  (1004, 1001, '西兰花', '1', '颗', 0, 0),
  (1005, 1001, '豆腐', '200', 'g', 0, 0),
  (1006, 1001, '紫菜', '8', 'g', 1, 0),
  (1007, 1001, '水果', '1', '袋', 0, 1);

INSERT IGNORE INTO cook_history (id, recipe_id, user_id, family_id, cooked_at, score, remark)
VALUES
  (1001, 1, 1, 1, DATE_SUB(NOW(), INTERVAL 1 DAY), 5, '孩子拌饭吃光了'),
  (1002, 6, 1, 1, DATE_SUB(NOW(), INTERVAL 2 DAY), 4, '下次少放一点辣'),
  (1003, 101, 1, 1, DATE_SUB(NOW(), INTERVAL 3 DAY), 5, '八分钟出汤，很稳'),
  (1004, 105, 1, 1, DATE_SUB(NOW(), INTERVAL 4 DAY), 5, '适合带饭'),
  (1005, 107, 1, 1, DATE_SUB(NOW(), INTERVAL 6 DAY), 4, '剩饭改造成功'),
  (1006, 2, 1, 1, DATE_SUB(NOW(), INTERVAL 8 DAY), 5, '周末硬菜担当'),
  (1007, 104, 1, 1, DATE_SUB(NOW(), INTERVAL 10 DAY), 4, '雨天喝很舒服'),
  (1008, 7, 1, 1, DATE_SUB(NOW(), INTERVAL 14 DAY), 4, '少油版也够香'),
  (1009, 106, 1, 1, DATE_SUB(NOW(), INTERVAL 21 DAY), 5, '冷冻早餐储备'),
  (1010, 5, 1, 1, DATE_SUB(NOW(), INTERVAL 30 DAY), 5, '全家都喜欢');

INSERT IGNORE INTO pantry_item (id, family_id, ingredient_name, amount, unit, expires_at)
VALUES
  (1001, 1, '鸡蛋', '8', '个', DATE_ADD(CURRENT_DATE, INTERVAL 10 DAY)),
  (1002, 1, '番茄', '3', '个', DATE_ADD(CURRENT_DATE, INTERVAL 3 DAY)),
  (1003, 1, '西兰花', '1', '颗', DATE_ADD(CURRENT_DATE, INTERVAL 2 DAY)),
  (1004, 1, '猪肉末', '300', 'g', DATE_ADD(CURRENT_DATE, INTERVAL 5 DAY)),
  (1005, 1, '紫菜', '1', '包', DATE_ADD(CURRENT_DATE, INTERVAL 90 DAY)),
  (1006, 1, '米饭', '2', '碗', DATE_ADD(CURRENT_DATE, INTERVAL 1 DAY));

INSERT IGNORE INTO notification_message (id, user_id, family_id, kind, title, body_text, action_type, unread, created_at)
VALUES
  (1001, 1, 1, 'fam', '今晚菜单已生成', '午餐有番茄炒蛋和紫菜蛋花汤，晚餐安排牛肉炒西兰花。', 'menu', 1, DATE_SUB(NOW(), INTERVAL 20 MINUTE)),
  (1002, 1, 1, 'sys', '买菜清单待确认', '还有 5 项食材未购买，出门前可以再核对一次。', 'shopping', 1, DATE_SUB(NOW(), INTERVAL 2 HOUR)),
  (1003, 1, 1, 'com', '社区菜谱有新评论', '有人收藏了你的番茄炒蛋做法。', 'community', 0, DATE_SUB(NOW(), INTERVAL 1 DAY));
