package com.familymenu.daily.service;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.List;

/**
 * 站内通知：把业务事件写入 notification_message，通知页（/api/me/notifications）读取展示。
 * 定位是家庭内广播（排除触发者本人）；写入失败只吞掉——通知是旁路，不允许影响业务主流程。
 *
 * 现有 kind 约定：fam / sys / com（见 SupportService 种子数据）。
 * 本服务新增两类业务事件：
 *   wish —— 家人许愿（"XX 想吃糖醋排骨"），action_type=home，跳首页许愿池
 *   meal —— 开饭提醒（"今天的菜都做好了"），action_type=menu，跳今日菜单
 */
@Service
public class NotificationService {

    private final JdbcTemplate jdbcTemplate;

    public NotificationService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
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
            }
        } catch (Exception ignored) {
            // 通知失败不影响主流程（例如成员表异常、单条插入失败）
        }
    }
}
