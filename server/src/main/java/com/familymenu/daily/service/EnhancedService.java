package com.familymenu.daily.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.dto.ApiModels;
import com.familymenu.daily.dto.ApiModels.AddPantryItemRequest;
import com.familymenu.daily.dto.ApiModels.PantryItem;
import com.familymenu.daily.dto.ApiModels.PantryMatchResult;
import com.familymenu.daily.dto.ApiModels.PreferenceItem;
import com.familymenu.daily.dto.ApiModels.PreferenceProfile;
import com.familymenu.daily.dto.ApiModels.RecipeCard;
import com.familymenu.daily.dto.ApiModels.WeeklyMenuDay;
import com.familymenu.daily.dto.ApiModels.WeeklyMenuView;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.sql.Types;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.*;
import java.util.stream.Collectors;

@Service
public class EnhancedService {

    private static final String[] DAY_LABELS = {"周一", "周二", "周三", "周四", "周五", "周六", "周日"};
    private static final DateTimeFormatter DATE_FMT = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {};

    private final JdbcTemplate jdbcTemplate;
    private final MysqlKitchenStore kitchenStore;
    private final ObjectMapper objectMapper;

    public EnhancedService(JdbcTemplate jdbcTemplate, MysqlKitchenStore kitchenStore, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.kitchenStore = kitchenStore;
        this.objectMapper = objectMapper;
    }

    // ========== Weekly Menu ==========

    public WeeklyMenuView generateWeeklyMenu(long familyId) {
        List<RecipeCard> allRecipes = kitchenStore.listRecipes("all");
        LocalDate monday = LocalDate.now().with(DayOfWeek.MONDAY);
        if (allRecipes.isEmpty()) {
            return new WeeklyMenuView(monday.format(DATE_FMT),
                    monday.plusDays(6).format(DATE_FMT), List.of());
        }

        Map<String, List<RecipeCard>> byCuisine = new LinkedHashMap<>();
        for (RecipeCard r : allRecipes) {
            String key = r.cuisine() == null || r.cuisine().isBlank() ? "其他" : r.cuisine();
            byCuisine.computeIfAbsent(key, k -> new ArrayList<>()).add(r);
        }
        for (List<RecipeCard> list : byCuisine.values()) {
            Collections.shuffle(list);
        }
        List<String> cuisineCycle = new ArrayList<>(byCuisine.keySet());
        Collections.shuffle(cuisineCycle);

        Set<Long> usedThisWeek = new HashSet<>();
        List<WeeklyMenuDay> days = new ArrayList<>();
        int cuisineIdx = 0;

        for (int d = 0; d < 7; d++) {
            List<RecipeCard> dayRecipes = new ArrayList<>();
            for (int m = 0; m < 2; m++) {
                RecipeCard picked = null;
                for (int attempt = 0; attempt < cuisineCycle.size() && picked == null; attempt++) {
                    String cuisine = cuisineCycle.get((cuisineIdx + attempt) % cuisineCycle.size());
                    for (RecipeCard candidate : byCuisine.get(cuisine)) {
                        if (!usedThisWeek.contains(candidate.id())) {
                            picked = candidate;
                            cuisineIdx = (cuisineIdx + attempt + 1) % cuisineCycle.size();
                            break;
                        }
                    }
                }
                if (picked == null) {
                    // 菜谱不够 14 道，允许复用
                    picked = allRecipes.get((d * 2 + m) % allRecipes.size());
                }
                usedThisWeek.add(picked.id());
                dayRecipes.add(picked);
            }
            days.add(new WeeklyMenuDay(
                    monday.plusDays(d).format(DATE_FMT),
                    DAY_LABELS[d],
                    dayRecipes
            ));
        }

        return new WeeklyMenuView(
                monday.format(DATE_FMT),
                monday.plusDays(6).format(DATE_FMT),
                days
        );
    }

    // ========== Preference Learning ==========

    public PreferenceProfile getPreferenceProfile(long userId) {
        List<Map<String, Object>> cuisineRows = jdbcTemplate.queryForList("""
                SELECT r.cuisine, COUNT(*) AS cnt
                FROM cook_history ch
                JOIN recipe r ON r.id = ch.recipe_id
                WHERE ch.user_id = ?
                GROUP BY r.cuisine
                ORDER BY cnt DESC
                """, userId);

        int totalCooks = cuisineRows.stream().mapToInt(r -> ((Number) r.get("cnt")).intValue()).sum();
        List<PreferenceItem> cuisinePrefs = cuisineRows.stream()
                .map(r -> new PreferenceItem(
                        (String) r.get("cuisine"),
                        ((Number) r.get("cnt")).intValue(),
                        totalCooks > 0 ? ((Number) r.get("cnt")).doubleValue() / totalCooks : 0
                ))
                .toList();

        List<Map<String, Object>> tagRows = jdbcTemplate.queryForList("""
                SELECT r.taste_tags_json
                FROM cook_history ch
                JOIN recipe r ON r.id = ch.recipe_id
                WHERE ch.user_id = ?
                """, userId);

        Map<String, Integer> tagCounts = new HashMap<>();
        for (Map<String, Object> row : tagRows) {
            String json = (String) row.get("taste_tags_json");
            for (String tag : parseTagList(json)) {
                String t = tag.trim();
                if (!t.isEmpty()) {
                    tagCounts.merge(t, 1, Integer::sum);
                }
            }
        }
        int totalTags = tagCounts.values().stream().mapToInt(Integer::intValue).sum();
        List<PreferenceItem> tagPrefs = tagCounts.entrySet().stream()
                .sorted(Map.Entry.<String, Integer>comparingByValue().reversed())
                .limit(10)
                .map(e -> new PreferenceItem(e.getKey(), e.getValue(),
                        totalTags > 0 ? (double) e.getValue() / totalTags : 0))
                .toList();

        String favCuisine = cuisinePrefs.isEmpty() ? "暂无" : cuisinePrefs.get(0).name();

        return new PreferenceProfile(cuisinePrefs, tagPrefs, totalCooks, favCuisine);
    }

    private List<String> parseTagList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception ex) {
            return List.of();
        }
    }

    // ========== Pantry ==========

    public List<PantryItem> listPantry(long familyId) {
        return jdbcTemplate.query("""
                SELECT id, ingredient_name, amount, unit,
                       DATE_FORMAT(expires_at, '%Y-%m-%d') AS expires_at,
                       DATE_FORMAT(created_at, '%Y-%m-%d') AS added_at
                FROM pantry_item WHERE family_id = ? ORDER BY created_at DESC
                """, (rs, n) -> new PantryItem(
                rs.getLong("id"),
                rs.getString("ingredient_name"),
                rs.getString("amount"),
                rs.getString("unit"),
                rs.getString("expires_at"),
                rs.getString("added_at")
        ), familyId);
    }

    @Transactional
    public PantryItem addPantryItem(long familyId, AddPantryItemRequest req) {
        GeneratedKeyHolder keyHolder = new GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO pantry_item (family_id, ingredient_name, amount, unit, expires_at)
                    VALUES (?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, familyId);
            ps.setString(2, req.ingredientName());
            ps.setString(3, req.amount() == null ? "" : req.amount());
            ps.setString(4, req.unit() == null ? "" : req.unit());
            if (req.expiresAt() != null && !req.expiresAt().isBlank()) {
                ps.setString(5, req.expiresAt());
            } else {
                ps.setNull(5, Types.DATE);
            }
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("pantry insert failed");
        }
        return new PantryItem(key.longValue(), req.ingredientName(), req.amount(), req.unit(),
                req.expiresAt(), LocalDate.now().format(DATE_FMT));
    }

    @Transactional
    public void deletePantryItem(long familyId, long itemId) {
        jdbcTemplate.update("DELETE FROM pantry_item WHERE id = ? AND family_id = ?", itemId, familyId);
    }

    public List<PantryMatchResult> matchRecipesWithPantry(long familyId) {
        List<PantryItem> pantry = listPantry(familyId);
        if (pantry.isEmpty()) {
            return List.of();
        }
        Set<String> pantryCanon = pantry.stream()
                .map(p -> IngredientMatcher.canonical(p.ingredientName()))
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toSet());
        if (pantryCanon.isEmpty()) {
            return List.of();
        }

        List<RecipeCard> recipes = kitchenStore.listRecipes("all");
        if (recipes.isEmpty()) {
            return List.of();
        }

        Map<Long, RecipeCard> byId = recipes.stream()
                .collect(Collectors.toMap(RecipeCard::id, r -> r, (a, b) -> a, LinkedHashMap::new));

        Map<Long, List<String>> ingredientsByRecipe = new HashMap<>();
        jdbcTemplate.query("""
                SELECT recipe_id, ingredient_name
                FROM recipe_ingredient
                WHERE recipe_id IN (%s)
                """.formatted(buildPlaceholders(byId.size())),
                rs -> {
                    long rid = rs.getLong("recipe_id");
                    String name = rs.getString("ingredient_name");
                    ingredientsByRecipe.computeIfAbsent(rid, k -> new ArrayList<>()).add(name);
                },
                byId.keySet().toArray());

        List<PantryMatchResult> results = new ArrayList<>();
        for (Map.Entry<Long, RecipeCard> entry : byId.entrySet()) {
            List<String> ingredients = ingredientsByRecipe.get(entry.getKey());
            if (ingredients == null || ingredients.isEmpty()) {
                continue;
            }
            int matched = 0;
            List<String> missing = new ArrayList<>();
            for (String ing : ingredients) {
                if (IngredientMatcher.matches(ing, pantryCanon)) {
                    matched++;
                } else if (ing != null && !ing.isBlank()) {
                    missing.add(ing);
                }
            }
            if (matched > 0) {
                double rate = (double) matched / ingredients.size();
                results.add(new PantryMatchResult(entry.getValue(), matched, ingredients.size(), rate, missing));
            }
        }

        results.sort(Comparator.comparingDouble(PantryMatchResult::matchRate).reversed());
        return results.stream().limit(10).toList();
    }

    private String buildPlaceholders(int n) {
        if (n <= 0) {
            return "NULL";
        }
        StringBuilder sb = new StringBuilder();
        for (int i = 0; i < n; i++) {
            if (i > 0) sb.append(',');
            sb.append('?');
        }
        return sb.toString();
    }
}
