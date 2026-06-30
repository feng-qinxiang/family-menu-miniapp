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
        addNotification(user.userId(), user.familyId(), "sys", "Feedback received",
                "We have recorded your feedback and will review it with the next product batch.", "feedback");
        return new FeedbackReceipt(id, "OPEN", "feedback received");
    }

    @Transactional
    public NotificationSummary listNotifications(AuthUser user) {
        seedNotificationsIfEmpty(user);
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

    private void seedNotificationsIfEmpty(AuthUser user) {
        Integer count = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM notification_message WHERE user_id = ?",
                Integer.class,
                user.userId()
        );
        if (count != null && count > 0) {
            return;
        }
        addNotification(user.userId(), user.familyId(), "fam", "Family menu", "Your family kitchen is ready. Add dishes to today's menu.", "menu");
        addNotification(user.userId(), user.familyId(), "sys", "Shopping list", "Shopping list will rebuild automatically after today's menu changes.", "shopping");
        addNotification(user.userId(), user.familyId(), "com", "Community", "Share a recipe to collect comments and favorites.", "community");
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

    private String formatRelative(LocalDateTime createdAt) {
        Duration duration = Duration.between(createdAt, LocalDateTime.now());
        if (duration.toMinutes() < 1) {
            return "just now";
        }
        if (duration.toHours() < 1) {
            return duration.toMinutes() + " min ago";
        }
        if (duration.toDays() < 1) {
            return duration.toHours() + " h ago";
        }
        return duration.toDays() + " d ago";
    }
}
