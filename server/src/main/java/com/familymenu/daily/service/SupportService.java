package com.familymenu.daily.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.dto.ApiModels.FeedbackReceipt;
import com.familymenu.daily.dto.ApiModels.FeedbackRequest;
import com.familymenu.daily.dto.ApiModels.MarkNotificationsReadRequest;
import com.familymenu.daily.dto.ApiModels.NotificationItem;
import com.familymenu.daily.dto.ApiModels.NotificationSummary;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDateTime;
import java.util.List;

@Service
public class SupportService {

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public SupportService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    @Transactional
    public FeedbackReceipt submitFeedback(AuthUser user, FeedbackRequest request) {
        List<String> images = request.images() == null ? List.of() : request.images();
        jdbcTemplate.update("""
                        INSERT INTO feedback_ticket(user_id, family_id, types_json, content, contact, images_json)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                user.userId(),
                user.familyId(),
                toJson(request.types()),
                request.content().trim(),
                blankToNull(request.contact()),
                toJson(images)
        );
        Long id = jdbcTemplate.query("""
                SELECT id FROM feedback_ticket
                WHERE user_id = ?
                ORDER BY id DESC
                LIMIT 1
                """, rs -> rs.next() ? rs.getLong("id") : null, user.userId());
        addNotification(user.userId(), user.familyId(), "sys", "反馈已收到",
                "我们已记录你的反馈，会在下一批产品迭代里一起看。", "feedback");
        return new FeedbackReceipt(id, "OPEN", "已受理");
    }

    /**
     * 通知列表。
     *
     * 这里<strong>不再</strong>做"没有通知就补几条演示通知"：那是读接口里的写操作，
     * 而且绕过了 app.seed-demo-data 开关（曾经每个新用户都会收到 3 条英文演示通知）。
     * 演示通知统一由启动播种负责（见 MysqlKitchenStore.seedDefaults / AuthService）。
     */
    @Transactional(readOnly = true)
    public NotificationSummary listNotifications(AuthUser user) {
        List<NotificationItem> items = jdbcTemplate.query("""
                        SELECT id, kind, title, body_text, action_type, unread, created_at
                        FROM notification_message
                        WHERE user_id = ?
                        ORDER BY created_at DESC, id DESC
                        LIMIT 50
                        """,
                (rs, rowNum) -> {
                    LocalDateTime createdAt = rs.getTimestamp("created_at").toLocalDateTime();
                    return new NotificationItem(
                            rs.getLong("id"),
                            createdAt.toLocalDate().equals(LocalDateTime.now().toLocalDate()) ? "today" : "earlier",
                            rs.getString("kind"),
                            rs.getString("title"),
                            formatRelative(createdAt),
                            rs.getBoolean("unread"),
                            rs.getString("body_text"),
                            rs.getString("action_type")
                    );
                },
                user.userId()
        );
        int unread = (int) items.stream().filter(NotificationItem::unread).count();
        return new NotificationSummary(items, unread);
    }

    @Transactional
    public NotificationSummary markRead(AuthUser user, MarkNotificationsReadRequest request) {
        List<Long> ids = request == null || request.ids() == null ? List.of() : request.ids();
        if (ids.isEmpty()) {
            jdbcTemplate.update("UPDATE notification_message SET unread = 0 WHERE user_id = ?", user.userId());
        } else {
            String placeholders = String.join(",", ids.stream().map(id -> "?").toList());
            Object[] args = new Object[ids.size() + 1];
            for (int i = 0; i < ids.size(); i++) {
                args[i] = ids.get(i);
            }
            args[ids.size()] = user.userId();
            jdbcTemplate.update("UPDATE notification_message SET unread = 0 WHERE id IN (" + placeholders + ") AND user_id = ?", args);
        }
        return listNotifications(user);
    }

    private void addNotification(long userId, long familyId, String kind, String title, String body, String actionType) {
        jdbcTemplate.update("""
                        INSERT INTO notification_message(user_id, family_id, kind, title, body_text, action_type)
                        VALUES (?, ?, ?, ?, ?, ?)
                        """,
                userId,
                familyId,
                kind,
                title,
                body,
                actionType
        );
    }

    private String toJson(Object value) {
        try {
            return objectMapper.writeValueAsString(value);
        } catch (JsonProcessingException ex) {
            throw new IllegalArgumentException("json encode failed", ex);
        }
    }

    private String blankToNull(String value) {
        return value == null || value.isBlank() ? null : value.trim();
    }

    /** 相对时间必须中文：这是直接渲染在消息列表上的用户可见文案。 */
    private String formatRelative(LocalDateTime createdAt) {
        Duration duration = Duration.between(createdAt, LocalDateTime.now());
        if (duration.toMinutes() < 1) {
            return "刚刚";
        }
        if (duration.toHours() < 1) {
            return duration.toMinutes() + " 分钟前";
        }
        if (duration.toDays() < 1) {
            return duration.toHours() + " 小时前";
        }
        return duration.toDays() + " 天前";
    }
}
