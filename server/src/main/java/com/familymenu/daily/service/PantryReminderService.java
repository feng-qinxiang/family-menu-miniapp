package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/** 临期食材按家庭汇总，消息中心可查看；微信推送复用已配置模板和用户订阅开关。 */
@Service
@EnableScheduling
@ConditionalOnProperty(name = "app.pantry-reminders.enabled", havingValue = "true", matchIfMissing = true)
public class PantryReminderService {
    private static final Logger log = LoggerFactory.getLogger(PantryReminderService.class);
    private static final Pattern QUANTITY = Pattern.compile("^[+-]?(?:\\d+(?:\\.\\d*)?|\\.\\d+)");
    private final JdbcTemplate jdbcTemplate;
    private final NotificationService notifications;

    public PantryReminderService(JdbcTemplate jdbcTemplate, NotificationService notifications) {
        this.jdbcTemplate = jdbcTemplate;
        this.notifications = notifications;
    }

    @Scheduled(cron = "${app.pantry-reminders.cron:0 0 9 * * *}", zone = "Asia/Shanghai")
    public void checkExpiry() {
        try {
            sendFor(LocalDate.now(ZoneId.of("Asia/Shanghai")));
        } catch (Exception ex) {
            log.warn("Pantry expiry check failed: {}", ex.getClass().getSimpleName());
        }
    }

    record DueStock(long familyId, String name, String amount, LocalDate expiresAt) {}

    void sendFor(LocalDate today) {
        List<DueStock> due = jdbcTemplate.query("""
                SELECT family_id, ingredient_name, amount, expires_at FROM pantry_item
                WHERE expires_at BETWEEN ? AND ?
                ORDER BY family_id, expires_at, id
                """, (rs, row) -> new DueStock(rs.getLong("family_id"), rs.getString("ingredient_name"),
                rs.getString("amount"), rs.getDate("expires_at").toLocalDate()), today, today.plusDays(3));
        Map<Long, List<DueStock>> families = due.stream().filter(stock -> hasStock(stock.amount()))
                .collect(Collectors.groupingBy(DueStock::familyId, LinkedHashMap::new, Collectors.toList()));
        for (Map.Entry<Long, List<DueStock>> family : families.entrySet()) {
            List<DueStock> items = family.getValue();
            String title = items.size() + " 项食材快到期了";
            String body = items.stream().limit(3).map(stock -> {
                long days = ChronoUnit.DAYS.between(today, stock.expiresAt());
                String name = stock.name().length() > 40 ? stock.name().substring(0, 39) + "…" : stock.name();
                return name + (days == 0 ? "今天到期" : "剩 " + days + " 天");
            }).collect(Collectors.joining("；")) + (items.size() > 3 ? "等共 " + items.size() + " 项" : "")
                    + "。先检查新鲜度，再安排做菜。";
            List<Long> recipients = jdbcTemplate.queryForList(
                    "SELECT user_id FROM family_member WHERE family_id = ? AND member_status = 'ACTIVE'",
                    Long.class, family.getKey());
            for (Long userId : recipients) {
                try {
                    notifications.notifyUserOnce(userId, family.getKey(), "pantry", title, body, "pantry",
                            "pantry:" + family.getKey() + ":" + today);
                } catch (Exception ex) {
                    log.warn("Pantry reminder write failed: family={} user={} error={}",
                            family.getKey(), userId, ex.getClass().getSimpleName());
                }
            }
        }
    }

    private static boolean hasStock(String amount) {
        Matcher number = QUANTITY.matcher(amount == null ? "" : amount.trim().replace(",", ""));
        return !number.find() || Double.parseDouble(number.group()) > 0;
    }
}
