package com.familymenu.daily.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.dto.ApiModels.AddMenuItemRequest;
import com.familymenu.daily.dto.ApiModels.AddShoppingItemRequest;
import com.familymenu.daily.dto.ApiModels.DailyMenuItemView;
import com.familymenu.daily.dto.ApiModels.DailyMenuView;
import com.familymenu.daily.dto.ApiModels.RecipeCard;
import com.familymenu.daily.dto.ApiModels.ShoppingListItemView;
import com.familymenu.daily.dto.ApiModels.ShoppingListView;
import com.familymenu.daily.dto.ApiModels.TogglePurchasedRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.sql.PreparedStatement;
import java.sql.Statement;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

@Service
public class TodayService {

    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;

    public TodayService(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
    }

    public DailyMenuView getTodayMenu(long familyId) {
        long menuId = ensureTodayMenu(familyId);
        return loadMenuView(menuId, familyId);
    }

    @Transactional
    public DailyMenuView addMenuItem(long familyId, AddMenuItemRequest request) {
        long menuId = ensureTodayMenu(familyId);
        if (request == null || request.recipeId() == null) {
            return loadMenuView(menuId, familyId);
        }
        // 只允许加入本家庭可见的菜谱（community / 本家庭 / 种子演示数据），防跨家庭串菜
        Boolean visible = jdbcTemplate.query(
                "SELECT 1 FROM recipe WHERE id = ? AND status = 'ACTIVE' " +
                        "AND (source_type = 'community' OR family_id = ? OR family_id = 1 OR family_id IS NULL)",
                rs -> rs.next() ? Boolean.TRUE : null,
                request.recipeId(), familyId
        );
        if (!Boolean.TRUE.equals(visible)) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "recipe not found");
        }
        String mealType = normalizeMealType(request.mealType());
        jdbcTemplate.update("DELETE FROM daily_menu_item WHERE daily_menu_id = ? AND recipe_id = ?", menuId, request.recipeId());
        jdbcTemplate.update(
                "INSERT INTO daily_menu_item(daily_menu_id, recipe_id, meal_type) VALUES (?, ?, ?)",
                menuId,
                request.recipeId(),
                mealType
        );
        rebuildShoppingList(familyId);
        return loadMenuView(menuId, familyId);
    }

    @Transactional
    public DailyMenuView removeMenuItem(long familyId, long recipeId) {
        long menuId = ensureTodayMenu(familyId);
        jdbcTemplate.update("DELETE FROM daily_menu_item WHERE daily_menu_id = ? AND recipe_id = ?", menuId, recipeId);
        rebuildShoppingList(familyId);
        return loadMenuView(menuId, familyId);
    }

    public ShoppingListView getShoppingList(long familyId) {
        long menuId = ensureTodayMenu(familyId);
        long shoppingListId = ensureShoppingList(menuId, familyId);
        return loadShoppingListView(shoppingListId, menuId, familyId);
    }

    @Transactional
    public ShoppingListView rebuildShoppingList(long familyId) {
        long menuId = ensureTodayMenu(familyId);
        long shoppingListId = ensureShoppingList(menuId, familyId);
        Map<String, Boolean> previousPurchased = loadPreviousPurchasedMap(shoppingListId);
        jdbcTemplate.update(
                "DELETE FROM shopping_list_item WHERE shopping_list_id = ? AND is_manual = 0",
                shoppingListId
        );
        List<DailyMenuItemView> menuItems = loadMenuItems(menuId);
        Map<Long, List<IngredientRow>> ingredientsByRecipe = loadIngredientsByRecipeIds(
                menuItems.stream().map(item -> item.recipe().id()).distinct().toList()
        );
        Map<String, AggregatedIngredient> aggregated = new LinkedHashMap<>();
        for (DailyMenuItemView menuItem : menuItems) {
            RecipeCard recipe = menuItem.recipe();
            List<IngredientRow> ingredients = ingredientsByRecipe.getOrDefault(recipe.id(), List.of());
            for (IngredientRow ingredient : ingredients) {
                String key = normalizeIngredientKey(ingredient.ingredientName(), ingredient.unit());
                AggregatedIngredient current = aggregated.getOrDefault(key, new AggregatedIngredient(ingredient.ingredientName(), ingredient.unit()));
                current.merge(ingredient.amount());
                aggregated.put(key, current);
            }
        }
        List<AggregatedIngredient> ordered = new ArrayList<>(aggregated.values());
        ordered.sort(Comparator.comparing(AggregatedIngredient::ingredientName, String.CASE_INSENSITIVE_ORDER));
        for (AggregatedIngredient ingredient : ordered) {
            boolean purchased = previousPurchased.getOrDefault(normalizeIngredientKey(ingredient.ingredientName(), ingredient.unit()), false);
            jdbcTemplate.update(
                    """
                    INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual)
                    VALUES (?, ?, ?, ?, ?, 0)
                    """,
                    shoppingListId,
                    ingredient.ingredientName(),
                    ingredient.amount(),
                    ingredient.unit(),
                    purchased
            );
        }
        return loadShoppingListView(shoppingListId, menuId, familyId);
    }

    @Transactional
    public ShoppingListView togglePurchased(long familyId, long itemId, TogglePurchasedRequest request) {
        long menuId = ensureTodayMenu(familyId);
        long shoppingListId = ensureShoppingList(menuId, familyId);
        jdbcTemplate.update(
                """
                UPDATE shopping_list_item sli
                JOIN shopping_list sl ON sl.id = sli.shopping_list_id
                SET sli.purchased = ?
                WHERE sli.id = ? AND sl.family_id = ?
                """,
                request != null && request.purchased(),
                itemId,
                familyId
        );
        return loadShoppingListView(shoppingListId, menuId, familyId);
    }

    @Transactional
    public ShoppingListView addShoppingItem(long familyId, AddShoppingItemRequest request) {
        long menuId = ensureTodayMenu(familyId);
        long shoppingListId = ensureShoppingList(menuId, familyId);
        String name = request == null || request.ingredientName() == null ? "" : request.ingredientName().trim();
        if (name.isBlank()) {
            return loadShoppingListView(shoppingListId, menuId, familyId);
        }
        String amount = request.amount() == null ? "" : request.amount().trim();
        String unit = request.unit() == null ? "" : request.unit().trim();
        jdbcTemplate.update(
                "INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, 0, 1)",
                shoppingListId, name, amount, unit
        );
        return loadShoppingListView(shoppingListId, menuId, familyId);
    }

    @Transactional
    public ShoppingListView deleteShoppingItem(long familyId, long itemId) {
        long menuId = ensureTodayMenu(familyId);
        long shoppingListId = ensureShoppingList(menuId, familyId);
        jdbcTemplate.update(
                """
                DELETE sli FROM shopping_list_item sli
                JOIN shopping_list sl ON sl.id = sli.shopping_list_id
                WHERE sli.id = ? AND sl.family_id = ?
                """,
                itemId, familyId
        );
        return loadShoppingListView(shoppingListId, menuId, familyId);
    }

    private long ensureTodayMenu(long familyId) {
        Long menuId = jdbcTemplate.query("""
                        SELECT id
                        FROM daily_menu
                        WHERE family_id = ? AND menu_date = CURRENT_DATE()
                        LIMIT 1
                        """,
                rs -> rs.next() ? rs.getLong("id") : null,
                familyId
        );
        if (menuId != null) {
            return menuId;
        }
        try {
            GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
            jdbcTemplate.update(connection -> {
                PreparedStatement ps = connection.prepareStatement(
                        "INSERT INTO daily_menu(family_id, menu_date, status) VALUES (?, CURRENT_DATE(), 'DRAFT')",
                        Statement.RETURN_GENERATED_KEYS
                );
                ps.setLong(1, familyId);
                return ps;
            }, keyHolder);
            Number key = keyHolder.getKey();
            if (key == null) {
                throw new IllegalStateException("daily menu create failed");
            }
            return key.longValue();
        } catch (DuplicateKeyException ignored) {
            Long existingMenuId = findTodayMenuId(familyId);
            if (existingMenuId != null) {
                return existingMenuId;
            }
            throw ignored;
        }
    }

    private Long findTodayMenuId(long familyId) {
        return jdbcTemplate.query("""
                        SELECT id
                        FROM daily_menu
                        WHERE family_id = ? AND menu_date = CURRENT_DATE()
                        LIMIT 1
                        """,
                rs -> rs.next() ? rs.getLong("id") : null,
                familyId
        );
    }

    private long ensureShoppingList(long menuId, long familyId) {
        Long shoppingListId = jdbcTemplate.query("""
                        SELECT id
                        FROM shopping_list
                        WHERE daily_menu_id = ?
                        LIMIT 1
                        """,
                rs -> rs.next() ? rs.getLong("id") : null,
                menuId
        );
        if (shoppingListId != null) {
            return shoppingListId;
        }
        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement(
                    "INSERT INTO shopping_list(family_id, daily_menu_id, status) VALUES (?, ?, 'OPEN')",
                    Statement.RETURN_GENERATED_KEYS
            );
            ps.setLong(1, familyId);
            ps.setLong(2, menuId);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("shopping list create failed");
        }
        return key.longValue();
    }

    private DailyMenuView loadMenuView(long menuId, long familyId) {
        return jdbcTemplate.queryForObject("""
                        SELECT id, menu_date, family_id, status
                        FROM daily_menu
                        WHERE id = ?
                        """,
                (rs, rowNum) -> new DailyMenuView(
                        rs.getLong("id"),
                        rs.getDate("menu_date").toLocalDate(),
                        rs.getLong("family_id"),
                        rs.getString("status"),
                        loadMenuItems(menuId)
                ),
                menuId
        );
    }

    private List<DailyMenuItemView> loadMenuItems(long menuId) {
        return jdbcTemplate.query("""
                        SELECT dmi.recipe_id, dmi.meal_type, r.id, r.title, r.source_type, r.cuisine, r.taste_tags_json,
                               r.time_cost, r.servings, r.rating, r.source_url, r.summary, r.cover_image
                        FROM daily_menu_item dmi
                        JOIN recipe r ON r.id = dmi.recipe_id
                        WHERE dmi.daily_menu_id = ?
                        ORDER BY dmi.id ASC
                        """,
                (rs, rowNum) -> new DailyMenuItemView(
                        rs.getLong("recipe_id"),
                        rs.getString("meal_type"),
                        new RecipeCard(
                                rs.getLong("id"),
                                rs.getString("title"),
                                rs.getString("source_type"),
                                rs.getString("cuisine"),
                                readStringList(rs.getString("taste_tags_json")),
                                rs.getInt("time_cost"),
                                rs.getInt("servings"),
                                rs.getDouble("rating"),
                                rs.getString("source_url"),
                                rs.getString("summary"),
                                rs.getString("cover_image")
                        )
                ),
                menuId
        );
    }

    private ShoppingListView loadShoppingListView(long shoppingListId, long menuId, long familyId) {
        return jdbcTemplate.queryForObject("""
                        SELECT id, daily_menu_id, family_id, status
                        FROM shopping_list
                        WHERE id = ?
                        """,
                (rs, rowNum) -> new ShoppingListView(
                        rs.getLong("id"),
                        rs.getLong("daily_menu_id"),
                        rs.getLong("family_id"),
                        rs.getString("status"),
                        loadShoppingItems(shoppingListId)
                ),
                shoppingListId
        );
    }

    private List<ShoppingListItemView> loadShoppingItems(long shoppingListId) {
        return jdbcTemplate.query("""
                        SELECT id, ingredient_name, amount, unit, purchased
                        FROM shopping_list_item
                        WHERE shopping_list_id = ?
                        ORDER BY purchased ASC, ingredient_name ASC
                        """,
                (rs, rowNum) -> new ShoppingListItemView(
                        rs.getLong("id"),
                        rs.getString("ingredient_name"),
                        rs.getString("amount"),
                        rs.getString("unit"),
                        rs.getBoolean("purchased")
                ),
                shoppingListId
        );
    }

    private List<IngredientRow> loadRecipeIngredients(long recipeId) {
        return jdbcTemplate.query("""
                        SELECT ingredient_name, amount, unit
                        FROM recipe_ingredient
                        WHERE recipe_id = ?
                        ORDER BY id ASC
                        """,
                (rs, rowNum) -> new IngredientRow(
                        rs.getString("ingredient_name"),
                        rs.getString("amount"),
                        rs.getString("unit")
                ),
                recipeId
        );
    }

    private Map<Long, List<IngredientRow>> loadIngredientsByRecipeIds(List<Long> recipeIds) {
        if (recipeIds == null || recipeIds.isEmpty()) {
            return Map.of();
        }
        StringBuilder placeholders = new StringBuilder();
        for (int i = 0; i < recipeIds.size(); i++) {
            if (i > 0) placeholders.append(',');
            placeholders.append('?');
        }
        Map<Long, List<IngredientRow>> result = new HashMap<>();
        jdbcTemplate.query(
                "SELECT recipe_id, ingredient_name, amount, unit FROM recipe_ingredient "
                        + "WHERE recipe_id IN (" + placeholders + ") ORDER BY recipe_id, id ASC",
                rs -> {
                    long rid = rs.getLong("recipe_id");
                    result.computeIfAbsent(rid, k -> new ArrayList<>())
                            .add(new IngredientRow(
                                    rs.getString("ingredient_name"),
                                    rs.getString("amount"),
                                    rs.getString("unit")
                            ));
                },
                recipeIds.toArray()
        );
        return result;
    }

    private Map<String, Boolean> loadPreviousPurchasedMap(long shoppingListId) {
        Map<String, Boolean> result = new HashMap<>();
        List<ShoppingListItemView> items = loadShoppingItems(shoppingListId);
        for (ShoppingListItemView item : items) {
            result.put(normalizeIngredientKey(item.ingredientName(), item.unit()), item.purchased());
        }
        return result;
    }

    private String normalizeMealType(String mealType) {
        if (mealType == null || mealType.isBlank()) {
            return "dinner";
        }
        String normalized = mealType.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "breakfast", "lunch", "dinner", "snack" -> normalized;
            default -> "dinner";
        };
    }

    private String normalizeIngredientKey(String ingredientName, String unit) {
        return (ingredientName == null ? "" : ingredientName.trim().toLowerCase(Locale.ROOT)) + "|" + (unit == null ? "" : unit.trim().toLowerCase(Locale.ROOT));
    }

    private List<String> readStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception ex) {
            return List.of();
        }
    }

    private record IngredientRow(String ingredientName, String amount, String unit) {
    }

    private static final class AggregatedIngredient {
        private final String ingredientName;
        private final String unit;
        private BigDecimal numericAmount;
        private String fallbackAmount = "";

        private AggregatedIngredient(String ingredientName, String unit) {
            this.ingredientName = ingredientName;
            this.unit = unit == null ? "" : unit;
        }

        private void merge(String amount) {
            BigDecimal parsed = parseAmount(amount);
            if (parsed != null) {
                numericAmount = numericAmount == null ? parsed : numericAmount.add(parsed);
                return;
            }
            if (fallbackAmount == null || fallbackAmount.isBlank()) {
                fallbackAmount = amount == null ? "" : amount;
            }
        }

        private String amount() {
            if (numericAmount != null) {
                return numericAmount.stripTrailingZeros().toPlainString();
            }
            return fallbackAmount == null ? "" : fallbackAmount;
        }

        private String ingredientName() {
            return ingredientName;
        }

        private String unit() {
            return unit;
        }

        private BigDecimal parseAmount(String amount) {
            if (amount == null) {
                return null;
            }
            String cleaned = amount.trim();
            if (cleaned.isEmpty()) {
                return null;
            }
            try {
                return new BigDecimal(cleaned);
            } catch (NumberFormatException ex) {
                return null;
            }
        }
    }
}
