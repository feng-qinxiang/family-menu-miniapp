package com.familymenu.daily.service;

import org.junit.jupiter.api.Test;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;

import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 不启动服务器，不接数据库，不调用微信：验证汇总、去重与失败后可重试。 */
class PantryReminderTests {
    private final LocalDate today = LocalDate.of(2026, 10, 9);

    @Test
    void groupsByFamilyIgnoresUsedUpStockAndContinuesAfterOneRecipientFails() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        NotificationService notifications = mock(NotificationService.class);
        when(jdbc.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<PantryReminderService.DueStock>>any(),
                eq(today), eq(today.plusDays(3)))).thenReturn(List.of(
                new PantryReminderService.DueStock(1, "番茄", "2", today),
                new PantryReminderService.DueStock(1, "鸡蛋", "适量", today.plusDays(3)),
                new PantryReminderService.DueStock(1, "已用完", "0.00", today),
                new PantryReminderService.DueStock(1, "已用完带单位", "0 个", today),
                new PantryReminderService.DueStock(1, "负数", "-1", today),
                new PantryReminderService.DueStock(2, "牛奶", "1", today.plusDays(1))));
        when(jdbc.queryForList(contains("member_status = 'ACTIVE'"), eq(Long.class), eq(1L)))
                .thenReturn(List.of(11L, 12L));
        when(jdbc.queryForList(anyString(), eq(Long.class), eq(2L))).thenReturn(List.of(21L));
        doThrow(new DataAccessResourceFailureException("test failure")).when(notifications)
                .notifyUserOnce(eq(11L), anyLong(), anyString(), anyString(), anyString(), anyString(), anyString());

        new PantryReminderService(jdbc, notifications).sendFor(today);

        verify(notifications).notifyUserOnce(eq(12L), eq(1L), eq("pantry"), eq("2 项食材快到期了"),
                argThat(body -> body.contains("番茄今天到期") && body.contains("鸡蛋剩 3 天") && !body.contains("用完") && !body.contains("牛奶")),
                eq("pantry"), eq("pantry:1:2026-10-09"));
        verify(notifications).notifyUserOnce(eq(21L), eq(2L), eq("pantry"), eq("1 项食材快到期了"),
                contains("牛奶剩 1 天"), eq("pantry"), eq("pantry:2:2026-10-09"));
        verify(jdbc).query(contains("expires_at BETWEEN ? AND ?"),
                org.mockito.ArgumentMatchers.<RowMapper<PantryReminderService.DueStock>>any(), eq(today), eq(today.plusDays(3)));
    }

    @Test
    void noDatedExpiringStockProducesNoMessages() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        NotificationService notifications = mock(NotificationService.class);
        when(jdbc.query(anyString(), org.mockito.ArgumentMatchers.<RowMapper<PantryReminderService.DueStock>>any(),
                any(), any())).thenReturn(List.of());
        new PantryReminderService(jdbc, notifications).sendFor(today);
        verifyNoInteractions(notifications);
    }

    @Test
    void duplicateInsertDoesNotSendWechatTwice() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SubscribeMessageService sender = mock(SubscribeMessageService.class);
        when(jdbc.update(anyString(), any(Object[].class))).thenReturn(1)
                .thenThrow(new DuplicateKeyException("same user and event"));
        NotificationService service = new NotificationService(jdbc, sender);
        service.notifyUserOnce(11, 1, "pantry", "临期提醒", "番茄今天到期", "pantry", "pantry:1:2026-10-09");
        service.notifyUserOnce(11, 1, "pantry", "临期提醒", "番茄今天到期", "pantry", "pantry:1:2026-10-09");
        verify(sender, times(1)).sendAsync(11, "pantry", "临期提醒", "番茄今天到期", "pages/pantry/index");
    }

    @Test
    void databaseFailureDoesNotPushAndCanBeRetried() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        SubscribeMessageService sender = mock(SubscribeMessageService.class);
        when(jdbc.update(anyString(), any(Object[].class)))
                .thenThrow(new DataAccessResourceFailureException("offline")).thenReturn(1);
        NotificationService service = new NotificationService(jdbc, sender);
        assertThatThrownBy(() -> service.notifyUserOnce(11, 1, "pantry", "临期提醒", "番茄今天到期", "pantry", "event"))
                .isInstanceOf(DataAccessResourceFailureException.class);
        verifyNoInteractions(sender);
        service.notifyUserOnce(11, 1, "pantry", "临期提醒", "番茄今天到期", "pantry", "event");
        verify(sender).sendAsync(11, "pantry", "临期提醒", "番茄今天到期", "pages/pantry/index");
    }

    @Test
    void pantryOnlyTemplateIsExposedWithoutWechatCredentials() {
        SubscribeMessageService service = new SubscribeMessageService(mock(WechatClient.class),
                mock(JdbcTemplate.class), "", "", "public-template-test", "developer");
        try {
            assertThat(service.available()).isTrue();
            assertThat(service.templateIds()).containsOnlyKeys("pantry");
        } finally {
            service.shutdown();
        }
    }
}
