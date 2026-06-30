-- Seed data: default guest user + family + sample recipes
INSERT IGNORE INTO user_account (id, openid, nickname, avatar_url)
VALUES (1, 'guest_default', '阿昊', '');

INSERT IGNORE INTO family (id, name, owner_user_id)
VALUES (1, '周末厨房', 1);

INSERT IGNORE INTO family_member (id, family_id, user_id, member_role, member_status)
VALUES (1, 1, 1, 'owner', 'ACTIVE');

INSERT IGNORE INTO user_account (openid, nickname, avatar_url)
VALUES
('seed-aunt-ning', '阿宁', ''),
('seed-zhou', '小周', ''),
('seed-mao', '猫猫', '');

-- Sample recipes
INSERT IGNORE INTO recipe (id, title, source_type, owner_user_id, family_id, cuisine, taste_tags_json, time_cost, servings, rating, summary, cover_image, status)
VALUES
(1, '番茄炒蛋', 'owned', 1, 1, '家常', '["鲜","酸甜","下饭"]', 10, 2, 4.8, '最经典的家常菜，酸甜开胃，10分钟搞定', 'https://images.unsplash.com/photo-1546069901-ba9599a7e63c?w=400&h=300&fit=crop&q=80', 'ACTIVE'),
(2, '红烧肉', 'owned', 1, 1, '川菜', '["咸甜","浓香","下饭"]', 60, 4, 4.9, '肥而不腻，入口即化的经典硬菜', 'https://images.unsplash.com/photo-1544025162-d76694265947?w=400&h=300&fit=crop&q=80', 'ACTIVE'),
(3, '清炒时蔬', 'owned', 1, 1, '家常', '["清淡","爽口"]', 8, 2, 4.5, '当季蔬菜简单翻炒，健康快手', 'https://images.unsplash.com/photo-1512621776951-a57141f2eefd?w=400&h=300&fit=crop&q=80', 'ACTIVE'),
(4, '酸辣土豆丝', 'owned', 1, 1, '川菜', '["酸辣","爽脆","下饭"]', 15, 2, 4.7, '刀工练习经典菜，酸辣爽脆', 'https://images.unsplash.com/photo-1625938145744-e380515399bf?w=400&h=300&fit=crop&q=80', 'ACTIVE'),
(5, '可乐鸡翅', 'owned', 1, 1, '家常', '["甜","鲜香"]', 30, 3, 4.8, '小朋友最爱，甜香入味', 'https://images.unsplash.com/photo-1527477396000-e27163b481c2?w=400&h=300&fit=crop&q=80', 'ACTIVE'),
(6, '麻婆豆腐', 'community', 1, 1, '川菜', '["麻辣","鲜香","下饭"]', 20, 3, 4.6, '麻辣鲜香，米饭杀手', 'https://images.unsplash.com/photo-1555939594-58d7cb561ad1?w=400&h=300&fit=crop&q=80', 'ACTIVE'),
(7, '蒜蓉西兰花', 'owned', 1, 1, '家常', '["清淡","蒜香"]', 10, 2, 4.4, '低脂高纤，蒜香浓郁', 'https://images.unsplash.com/photo-1459411552884-841db9b3cc2a?w=400&h=300&fit=crop&q=80', 'ACTIVE'),
(8, '糖醋排骨', 'community', 1, 1, '粤菜', '["酸甜","外酥里嫩"]', 40, 4, 4.9, '外酥里嫩，酸甜适口的宴客菜', 'https://images.unsplash.com/photo-1529692236671-f1f6cf9683ba?w=400&h=300&fit=crop&q=80', 'ACTIVE');

-- Recipe ingredients
INSERT IGNORE INTO recipe_ingredient (id, recipe_id, ingredient_name, amount, unit) VALUES
(1, 1, '鸡蛋', '3', '个'),
(2, 1, '番茄', '2', '个'),
(3, 1, '葱花', '适量', ''),
(4, 1, '盐', '适量', ''),
(5, 1, '糖', '少许', ''),
(6, 2, '五花肉', '500', '克'),
(7, 2, '冰糖', '30', '克'),
(8, 2, '生抽', '2', '勺'),
(9, 2, '老抽', '1', '勺'),
(10, 2, '料酒', '2', '勺'),
(11, 2, '八角', '2', '个'),
(12, 2, '桂皮', '1', '小块'),
(13, 4, '土豆', '2', '个'),
(14, 4, '干辣椒', '5', '个'),
(15, 4, '花椒', '少许', ''),
(16, 4, '醋', '2', '勺'),
(17, 5, '鸡翅中', '8', '个'),
(18, 5, '可乐', '1', '罐'),
(19, 5, '生抽', '2', '勺'),
(20, 5, '姜片', '3', '片');

-- Recipe steps
INSERT IGNORE INTO recipe_step (id, recipe_id, step_no, step_text) VALUES
(1, 1, 1, '鸡蛋打散加少许盐搅匀'),
(2, 1, 2, '番茄切块备用'),
(3, 1, 3, '热锅凉油，倒入蛋液炒至凝固盛出'),
(4, 1, 4, '锅中留底油，放入番茄翻炒出汁'),
(5, 1, 5, '加入炒好的鸡蛋，调入盐和少许糖翻匀出锅'),
(6, 2, 1, '五花肉切块，冷水下锅焯水去腥'),
(7, 2, 2, '锅中放少许油，加冰糖小火炒至枣红色'),
(8, 2, 3, '放入五花肉翻炒上色'),
(9, 2, 4, '加料酒、生抽、老抽、八角、桂皮，加开水没过肉'),
(10, 2, 5, '大火烧开转小火炖45分钟，大火收汁即可'),
(11, 4, 1, '土豆去皮切细丝，泡水去淀粉'),
(12, 4, 2, '锅中热油，放花椒和干辣椒爆香'),
(13, 4, 3, '放入土豆丝大火快炒2分钟'),
(14, 4, 4, '沿锅边淋入醋，加盐调味出锅'),
(15, 5, 1, '鸡翅划两刀方便入味，冷水焯去血水'),
(16, 5, 2, '锅中少许油煎鸡翅至两面金黄'),
(17, 5, 3, '倒入可乐和生抽，放姜片'),
(18, 5, 4, '大火烧开转中火煮15分钟，大火收汁');

-- Community posts
INSERT IGNORE INTO community_post (id, recipe_id, author_user_id, title, content, like_count, comment_count, tags_json, audit_status)
VALUES
(1, 6, 1, '分享我的麻婆豆腐做法', '用嫩豆腐口感更好，关键是最后勾芡要薄，让汤汁裹住豆腐。花椒粉一定要最后撒，香气才足。', 12, 3, '["川菜","下饭","辣"]', 'APPROVED'),
(2, 8, 1, '糖醋排骨的秘诀', '排骨先炸后炒是关键，糖醋汁比例 2:3:4（糖:醋:水），最后大火收汁挂上亮油。', 8, 1, '["粤菜","宴客","酸甜"]', 'APPROVED');

UPDATE user_account
SET nickname = '阿昊'
WHERE openid IN ('guest_default', 'guest-family-menu-user') OR nickname IN ('家庭用户', '默认用户');

UPDATE family
SET name = '周末厨房'
WHERE name IN ('我的家庭', '默认家庭') OR id = 1;

UPDATE recipe
SET source_url = NULL
WHERE source_url LIKE '%example.com%';

UPDATE recipe
SET summary = '饭点讨论最多的下饭菜，适合能吃辣的晚上'
WHERE title = '麻婆豆腐' AND summary LIKE '%社区热度%';

UPDATE recipe
SET summary = '从家里常做步骤整理出来的清爽配菜'
WHERE title = '蒜蓉西兰花' AND source_type = 'imported';

UPDATE recipe
SET taste_tags_json = '["自家录入","待复核"]'
WHERE source_type = 'imported' AND taste_tags_json = '["导入","待确认"]';

UPDATE recipe
SET summary = '从导入页面整理保存'
WHERE source_type = 'imported' AND summary LIKE '%导入保存%';

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

-- Demo membership: user 1 持一份年卡，共享给家庭，演示用未来到期日（见 ADR-0002/0005）
INSERT IGNORE INTO user_membership (id, payer_user_id, current_plan, expires_at, share_scope)
VALUES (1, 1, 'annual', DATE_ADD(NOW(), INTERVAL 365 DAY), 'FAMILY');

INSERT IGNORE INTO payment_order (id, out_trade_no, payer_user_id, family_id, plan_code, amount_fen, duration_days, status, payment_method, paid_at)
VALUES (1, 'SEED-DEMO-ANNUAL-0001', 1, 1, 'annual', 9900, 365, 'PAID', 'MOCK', NOW());

INSERT IGNORE INTO family_member (family_id, user_id, member_role, member_status)
SELECT 1, id, 'member', 'ACTIVE' FROM user_account WHERE openid IN ('seed-aunt-ning', 'seed-zhou', 'seed-mao');

INSERT IGNORE INTO recipe (id, title, source_type, owner_user_id, family_id, cuisine, taste_tags_json, time_cost, servings, rating, summary, cover_image, status)
VALUES
  (101, '紫菜蛋花汤', 'owned', 1, 1, '汤羹', '["清淡","快手","晚餐"]', 8, 3, 4.6, '晚饭收尾的清爽热汤', '/assets/dishes/egg-drop-soup.jpg', 'ACTIVE'),
  (102, '青椒土豆丝', 'owned', 1, 1, '家常', '["脆爽","省钱","快手"]', 10, 3, 4.4, '冰箱常备食材也能炒出香气', '/assets/dishes/long-beans.jpg', 'ACTIVE'),
  (103, '香菇滑鸡', 'owned', 1, 1, '粤菜', '["鲜香","蒸菜","少油"]', 28, 3, 4.7, '电饭煲蒸格也能完成的嫩滑鸡肉', '/assets/dishes/chicken-congee.jpg', 'ACTIVE'),
  (104, '酸辣汤', 'community', 1, NULL, '川菜', '["酸辣","开胃","汤羹"]', 18, 4, 4.6, '下雨天最适合的一碗酸辣热汤', '/assets/dishes/hot-sour-soup.jpg', 'ACTIVE'),
  (105, '牛肉炒西兰花', 'community', 1, NULL, '家常', '["高蛋白","清爽","便当"]', 20, 3, 4.8, '肉菜均衡的工作日晚餐', '/assets/dishes/beef-broccoli.jpg', 'ACTIVE'),
  (106, '鲜肉馄饨', 'owned', 1, 1, '面点', '["早餐","孩子爱吃","可冷冻"]', 38, 4, 4.5, '周末包好冷冻，早晨十分钟上桌', '/assets/dishes/wontons.jpg', 'ACTIVE'),
  (107, '扬州炒饭', 'owned', 1, 1, '主食', '["快手","剩饭改造","孩子爱吃"]', 14, 2, 4.5, '剩米饭和鸡蛋的稳定发挥', '/assets/dishes/fried-rice.jpg', 'ACTIVE'),
  (108, '家常拌面', 'community', 1, NULL, '面食', '["快手","香辣","夜宵"]', 12, 2, 4.3, '不想开大火时的拌面方案', '/assets/dishes/lo-mein.jpg', 'ACTIVE');

INSERT IGNORE INTO recipe_ingredient (id, recipe_id, ingredient_name, amount, unit) VALUES
  (101, 101, '紫菜', '8', 'g'), (102, 101, '鸡蛋', '2', '个'), (103, 101, '香葱', '1', '根'),
  (104, 102, '土豆', '2', '个'), (105, 102, '青椒', '1', '个'), (106, 102, '米醋', '1', '勺'),
  (107, 103, '鸡腿肉', '350', 'g'), (108, 103, '香菇', '6', '朵'), (109, 103, '姜丝', '10', 'g'),
  (110, 104, '豆腐', '200', 'g'), (111, 104, '木耳', '30', 'g'), (112, 104, '鸡蛋', '1', '个'),
  (113, 105, '牛肉', '250', 'g'), (114, 105, '西兰花', '1', '颗'), (115, 105, '蒜末', '10', 'g'),
  (116, 106, '馄饨皮', '40', '张'), (117, 106, '猪肉馅', '300', 'g'), (118, 106, '虾皮', '10', 'g'),
  (119, 107, '米饭', '2', '碗'), (120, 107, '鸡蛋', '2', '个'), (121, 107, '火腿丁', '80', 'g'),
  (122, 108, '面条', '250', 'g'), (123, 108, '花生酱', '1', '勺'), (124, 108, '黄瓜', '1', '根');

INSERT IGNORE INTO recipe_step (id, recipe_id, step_no, step_text) VALUES
  (101, 101, 1, '水开后放入紫菜，转小火淋入蛋液'),
  (102, 101, 2, '加盐调味，撒葱花即可出锅'),
  (103, 102, 1, '土豆切丝冲洗淀粉，青椒切丝备用'),
  (104, 102, 2, '大火快炒，沿锅边淋醋保持脆爽'),
  (105, 103, 1, '鸡腿肉加生抽、姜丝和淀粉抓匀'),
  (106, 103, 2, '铺上香菇蒸 18 分钟，出锅撒葱花'),
  (107, 104, 1, '豆腐木耳切丝，汤底调入醋和胡椒'),
  (108, 104, 2, '淋蛋液后勾薄芡，最后补酸辣味'),
  (109, 105, 1, '牛肉切片腌制，西兰花焯水断生'),
  (110, 105, 2, '蒜末爆香后快炒牛肉，再合入西兰花'),
  (111, 106, 1, '肉馅调味后包入馄饨皮'),
  (112, 106, 2, '水开下锅煮至浮起，配紫菜虾皮汤底'),
  (113, 107, 1, '鸡蛋炒散盛出，米饭提前打散'),
  (114, 107, 2, '火腿丁和米饭炒香，最后合入鸡蛋'),
  (115, 108, 1, '面条煮熟过温水，黄瓜切丝'),
  (116, 108, 2, '花生酱、生抽和辣油调汁拌匀');

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
