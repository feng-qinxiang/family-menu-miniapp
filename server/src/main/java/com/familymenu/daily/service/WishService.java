package com.familymenu.daily.service;

import com.familymenu.daily.dto.ApiModels.AddWishRequest;
import com.familymenu.daily.dto.ApiModels.WishItem;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Timestamp;
import java.time.LocalDate;
import java.util.List;
import java.util.Locale;

/**
 * 许愿池：家庭共享，按 (date, slot) 分槽存取（见 家庭点菜-核心方案 §5）。
 * 家庭成员皆可读写自家许愿；删除限本家范围内。
 */
@Service
public class WishService {

    private final JdbcTemplate jdbcTemplate;

    public WishService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public List<WishItem> listWishes(long familyId, String date, String slot) {
        LocalDate wishDate = parseDate(date);
        String normalizedSlot = normalizeSlot(slot);
        return jdbcTemplate.query("""
                        SELECT id, text, author_name, recipe_id, wish_date, slot, created_at
                        FROM family_wish
                        WHERE family_id = ? AND wish_date = ? AND slot = ?
                        ORDER BY id ASC
                        """,
                (rs, rowNum) -> mapRow(rs),
                familyId, wishDate, normalizedSlot
        );
    }

    @Transactional
    public WishItem addWish(AuthUser user, AddWishRequest request) {
        LocalDate wishDate = parseDate(request.date());
        String slot = normalizeSlot(request.slot());
        String text = request.text() == null ? "" : request.text().trim();
        Long recipeId = request.recipeId();
        String authorName = user.nickname() == null ? "我" : user.nickname();

        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO family_wish(family_id, user_id, wish_date, slot, text, recipe_id, author_name) "
                            + "VALUES (?, ?, ?, ?, ?, ?, ?)",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, user.familyId());
            ps.setLong(2, user.userId());
            ps.setObject(3, wishDate);
            ps.setString(4, slot);
            ps.setString(5, text);
            if (recipeId == null) {
                ps.setNull(6, java.sql.Types.BIGINT);
            } else {
                ps.setLong(6, recipeId);
            }
            ps.setString(7, authorName);
            return ps;
        }, keyHolder);

        Number key = keyHolder.getKey();
        long id = key == null ? 0L : key.longValue();
        return new WishItem(
                String.valueOf(id),
                text,
                authorName,
                recipeId,
                wishDate.toString(),
                slot,
                System.currentTimeMillis()
        );
    }

    @Transactional
    public void removeWish(long familyId, String wishId) {
        Long id = parseId(wishId);
        if (id == null) {
            return; // 客户端临时 id（如 "w-123"）尚未落库，静默忽略
        }
        jdbcTemplate.update(
                "DELETE FROM family_wish WHERE id = ? AND family_id = ?",
                id, familyId
        );
    }

    private WishItem mapRow(java.sql.ResultSet rs) throws java.sql.SQLException {
        long id = rs.getLong("id");
        Object recipeIdObj = rs.getObject("recipe_id");
        Long recipeId = recipeIdObj == null ? null : ((Number) recipeIdObj).longValue();
        Timestamp createdAt = rs.getTimestamp("created_at");
        long at = createdAt == null ? System.currentTimeMillis() : createdAt.getTime();
        return new WishItem(
                String.valueOf(id),
                rs.getString("text"),
                rs.getString("author_name"),
                recipeId,
                rs.getDate("wish_date").toLocalDate().toString(),
                rs.getString("slot"),
                at
        );
    }

    private LocalDate parseDate(String date) {
        if (date == null || date.isBlank()) {
            return LocalDate.now();
        }
        try {
            return LocalDate.parse(date.trim());
        } catch (Exception ex) {
            return LocalDate.now();
        }
    }

    private String normalizeSlot(String slot) {
        if (slot == null || slot.isBlank()) {
            return "dinner";
        }
        String normalized = slot.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "breakfast", "lunch", "dinner", "snack" -> normalized;
            default -> "dinner";
        };
    }

    private Long parseId(String wishId) {
        if (wishId == null || wishId.isBlank()) {
            return null;
        }
        try {
            return Long.parseLong(wishId.trim());
        } catch (NumberFormatException ex) {
            return null;
        }
    }
}