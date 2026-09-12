package com.familymenu.daily.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 站内通知：把业务事件写入 notification_message，通知页（/api/me/notifications）读取展示。
 * 定位是家庭内广播（排除触发者本人）；写入失败只吞掉——通知是旁路，不允许影响业务主流程。
 *
 * 这里是全站唯一的通知出口：写站内信的同时，顺带尝试一次微信订阅消息推送。
 * 好处是新增一类通知不需要再记得去接推送——只要 kind 配了模板，它就会发。
 *
 * 现有 kind 约定：fam / sys / com（见 SupportService 种子数据）。
 * 本服务新增两类业务事件：
 *   wish —— 家人许愿（"XX 想吃糖醋排骨"），action_type=home，跳首页许愿池
 *   meal —— 开饭提醒（"今天的菜都做好了"），action_type=menu，跳今日菜单
 */
@Service
public class NotificationService {

    private final JdbcTemplate jdbcTemplate;
    private final SubscribeMessageService subscribeMessageService;

    public NotificationService(JdbcTemplate jdbcTemplate, SubscribeMessageService subscribeMessageService) {
        this.jdbcTemplate = jdbcTemplate;
        this.subscribeMessageService = subscribeMessageService;
    }

    /** 给家庭内除 excludeUserId 外的所有活跃成员各写一条通知。 */
    public void notifyFamily(long familyId, long excludeUserId, String kind, String title, String body, String actionType) {
        try {
            List<Long> userIds = jdbcTemplate.queryForList(
                    "SELECT user_id FROM family_member WHERE family_id = ? AND member_status = 'ACTIVE' AND user_id <> ?",
                    Long.class, familyId, excludeUserId
            );
            for (Long uid : userIds) {
                jdbcTemplate.update(
                        "INSERT INTO notification_message(user_id, family_id, kind, title, body_text, action_type) VALUES (?, ?, ?, ?, ?, ?)",
                        uid, familyId, kind, title, body, actionType
                );
                // 订阅消息是异步的，且失败只记日志：站内信已经写成功了，推送少一条不影响用户看得到
                subscribeMessageService.sendAsync(uid, kind, title, body, pageFor(actionType));
            }
        } catch (Exception ignored) {
            // 通知失败不影响主流程（例如成员表异常、单条插入失败）
        }
    }

    /**
     * 给单个用户写一条通知，用于跨家庭的场景（如社区互动：被赞/被评的是帖子作者本人）。
     * familyId 仅作归属记录，作者没有活跃家庭时传 0（列 NOT NULL 的哨兵值）。
     */
    public void notifyUser(long userId, long familyId, String kind, String title, String body, String actionType) {
        try {
            jdbcTemplate.update(
                    "INSERT INTO notification_message(user_id, family_id, kind, title, body_text, action_type) VALUES (?, ?, ?, ?, ?, ?)",
                    userId, familyId, kind, title, body, actionType
            );
            subscribeMessageService.sendAsync(userId, kind, title, body, pageFor(actionType));
        } catch (Exception ignored) {
            // 同 notifyFamily：通知是旁路，失败不影响业务主流程
        }
    }

    /** 站内动作类型 → 订阅消息被点击后跳转的小程序页面（微信要求不带前导斜杠）。 */
    private static String pageFor(String actionType) {
        return switch (actionType == null ? "" : actionType) {
            case "home" -> "pages/home/index";
            case "menu" -> "pages/menu/index";
            default -> "";
        };
    }
}
