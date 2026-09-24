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
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

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
    // ponytail: 周菜单按 (familyId, 周一) 缓存一份，本周内 GET/POST 结果稳定；重启丢失为已知上限，升级路径为落库 weekly_menu 表
    private final Map<Long, WeeklyMenuView> weeklyMenuCache = new HashMap<>();

    public EnhancedService(JdbcTemplate jdbcTemplate, MysqlKitchenStore kitchenStore, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.kitchenStore = kitchenStore;
        this.objectMapper = objectMapper;
    }

    // ========== Weekly Menu ==========

    public WeeklyMenuView generateWeeklyMenu(long familyId, long userId) {
        synchronized (weeklyMenuCache) {
            WeeklyMenuView cached = weeklyMenuCache.get(familyId);
            if (cached != null && cached.weekStart().equals(mondayOfThisWeek())) {
                return cached;
            }
            WeeklyMenuView generated = doGenerateWeeklyMenu(familyId, userId);
            // 顺手清掉上一周的缓存，避免缓存随家庭数无限增长（每项都含整周菜谱）
            String thisWeek = mondayOfThisWeek();
            weeklyMenuCache.entrySet().removeIf(e -> !thisWeek.equals(e.getValue().weekStart()));
            weeklyMenuCache.put(familyId, generated);
            return generated;
        }
    }

    private String mondayOfThisWeek() {
        return LocalDate.now().with(DayOfWeek.MONDAY).format(DATE_FMT);
    }

    private WeeklyMenuView doGenerateWeeklyMenu(long familyId, long userId) {
        List<RecipeCard> allRecipes = kitchenStore.listRecipes("all", userId, familyId);
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
        int deleted = jdbcTemplate.update(
                "DELETE FROM pantry_item WHERE id = ? AND family_id = ?", itemId, familyId);
        if (deleted == 0) {
            // 与 deleteCommunityPost / 读路径同一套语义：条目不存在 / 不是本家的 / 已经删过，都算 404。
            // 修前这里的 0 行结果被静默吞掉，接口照样回 200 ——
            // 于是「删别人家的库存」和「删不存在的 id」在客户端看起来都是成功，前端只能靠刷新列表猜。
            // 注意 SQL 本身一直带 family_id 过滤，越权删不掉数据；错的只是响应契约。
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "库存条目不存在");
        }
    }

    /**
     * 冰箱里「能做什么」：判定口径与 {@link PantryDeduction}（真正扣库存的那套）**逐字一致**——
     * 名称与单位都归一后完全相等、两边用量都要能解析出数字，不做同义词/包含式匹配。
     *
     * 为什么必须一致：这一份数字会被冰箱页当成权威数据展示（`3/3` → 「食材都有，直接开火」），
     * 也会驱动首页推荐排序。原来这里用 {@code IngredientMatcher}（同义词 + 双向子串 + 不看单位），
     * 实测同一台冰箱同一道菜：这里给 `3/3 不缺`，做完菜只扣得动 1 行（`紫菜 包` 对不上 `紫菜 8g`、
     * 冰箱里的 `葱` 不等于菜谱要的 `香葱`）——页面说"食材都有"，开火后冰箱几乎没动。
     */
    public List<PantryMatchResult> matchRecipesWithPantry(long familyId, long userId) {
        List<PantryItem> pantry = listPantry(familyId);
        if (pantry.isEmpty()) {
            return List.of();
        }
        // 用量写「适量/少许」的行不入索引：扣减侧不会动它们，这里也就不该说"有"
        Set<String> pantryKeys = pantry.stream()
                .filter(p -> PantryDeduction.parseAmount(p.amount()) != null)
                .map(p -> stockKey(p.ingredientName(), p.unit()))
                .collect(Collectors.toSet());
        if (pantryKeys.isEmpty()) {
            return List.of();
        }

        List<RecipeCard> recipes = kitchenStore.listRecipes("all", userId, familyId);
        if (recipes.isEmpty()) {
            return List.of();
        }

        Map<Long, RecipeCard> byId = recipes.stream()
                .collect(Collectors.toMap(RecipeCard::id, r -> r, (a, b) -> a, LinkedHashMap::new));

        Map<Long, List<String[]>> ingredientsByRecipe = new HashMap<>();
        jdbcTemplate.query("""
                SELECT recipe_id, ingredient_name, unit, amount
                FROM recipe_ingredient
                WHERE recipe_id IN (%s)
                """.formatted(buildPlaceholders(byId.size())),
                rs -> {
                    long rid = rs.getLong("recipe_id");
                    ingredientsByRecipe.computeIfAbsent(rid, k -> new ArrayList<>())
                            .add(new String[]{rs.getString("ingredient_name"), rs.getString("unit"),
                                    rs.getString("amount")});
                },
                byId.keySet().toArray());

        List<PantryMatchResult> results = new ArrayList<>();
        for (Map.Entry<Long, RecipeCard> entry : byId.entrySet()) {
            List<String[]> ingredients = ingredientsByRecipe.get(entry.getKey());
            if (ingredients == null || ingredients.isEmpty()) {
                continue;
            }
            int matched = 0;
            List<String> missing = new ArrayList<>();
            for (String[] ing : ingredients) {
                String name = ing[0];
                // 与 PantryDeduction.plan 同一判据：名称|单位都对得上，且菜谱这侧用量可解析
                if (PantryDeduction.parseAmount(ing[2]) != null
                        && pantryKeys.contains(stockKey(name, ing[1]))) {
                    matched++;
                } else if (name != null && !name.isBlank()) {
                    missing.add(name);
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

    /** 冰箱与菜谱共用的索引键：名称 + 单位都归一，与 PantryDeduction 的 key 写法一致。 */
    private static String stockKey(String name, String unit) {
        return PantryDeduction.normalize(name) + "|" + PantryDeduction.normalize(unit);
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
