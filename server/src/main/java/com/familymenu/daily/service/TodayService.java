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
    public DailyMenuView addMenuItem(long familyId, String addedByName, AddMenuItemRequest request) {
        lockFamilyMenuWrites(familyId);
        long menuId = ensureTodayMenu(familyId);
        if (request == null || request.recipeId() == null) {
            return loadMenuView(menuId, familyId);
        }
        // 只允许加入本家庭可见的菜谱（community / 本家庭 / 公共种子菜谱），防跨家庭串菜
        Boolean visible = jdbcTemplate.query(
                "SELECT 1 FROM recipe WHERE id = ? AND status = 'ACTIVE' " +
                        "AND (source_type = 'community' OR family_id = ? OR is_public = 1 OR family_id IS NULL)",
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
                "INSERT INTO daily_menu_item(daily_menu_id, recipe_id, meal_type, status, added_by_name) VALUES (?, ?, ?, 'todo', ?)",
                menuId,
                request.recipeId(),
                mealType,
                addedByName
        );
        rebuildShoppingList(familyId);
        return loadMenuView(menuId, familyId);
    }

    /** 菜单项状态流转：todo（待做）→ cooking（烧着）→ done（上桌）。itemId 限定在本家庭今日菜单内。 */
    @Transactional
    public DailyMenuView updateItemStatus(long familyId, long itemId, String status) {
        lockFamilyMenuWrites(familyId);
        long menuId = ensureTodayMenu(familyId);
        jdbcTemplate.update("""
                        UPDATE daily_menu_item dmi
                        JOIN daily_menu dm ON dm.id = dmi.daily_menu_id
                        SET dmi.status = ?
                        WHERE dmi.id = ? AND dm.id = ? AND dm.family_id = ?
                        """,
                normalizeStatus(status), itemId, menuId, familyId
        );
        return loadMenuView(menuId, familyId);
    }

    @Transactional
    public DailyMenuView removeMenuItem(long familyId, long recipeId) {
        lockFamilyMenuWrites(familyId);
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
        lockFamilyMenuWrites(familyId);
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
        lockFamilyMenuWrites(familyId);
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
        lockFamilyMenuWrites(familyId);
        long menuId = ensureTodayMenu(familyId);
        long shoppingListId = ensureShoppingList(menuId, familyId);
        String name = request == null || request.ingredientName() == null ? "" : request.ingredientName().trim();
        if (name.isBlank()) {
            return loadShoppingListView(shoppingListId, menuId, familyId);
        }
        String amount = request.amount() == null ? "" : request.amount().trim();
        String unit = request.unit() == null ? "" : request.unit().trim();
        // 同名食材去重：菜谱缺料「一键加购」可重复点击，重复 INSERT 会累积多行。
        // 已有同名行则只在原用量为空时补全用量，不再新增行。
        Long existingId = jdbcTemplate.query(
                "SELECT id FROM shopping_list_item WHERE shopping_list_id = ? AND ingredient_name = ? LIMIT 1",
                rs -> rs.next() ? rs.getLong("id") : null,
                shoppingListId, name
        );
        if (existingId != null) {
            if (!amount.isBlank()) {
                jdbcTemplate.update(
                        "UPDATE shopping_list_item SET amount = ?, unit = ? WHERE id = ? AND (amount IS NULL OR amount = '')",
                        amount, unit, existingId
                );
            }
            return loadShoppingListView(shoppingListId, menuId, familyId);
        }
        jdbcTemplate.update(
                "INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, 0, 1)",
                shoppingListId, name, amount, unit
        );
        return loadShoppingListView(shoppingListId, menuId, familyId);
    }

    @Transactional
    public ShoppingListView deleteShoppingItem(long familyId, long itemId) {
        lockFamilyMenuWrites(familyId);
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

    /**
     * 家庭级菜单写锁：把「同一家人同时点菜 / 改单 / 勾清单」串行化。
     *
     * 为什么要有（实测数据，不是推理）：菜单域的写方法都是「先 ensureXxx（查不到就插一条）再改行」，
     * 而 ensure 的插入撞唯一键时靠 catch 后**回读**兜底。问题在于这个回读发生在**同一个事务**里：
     * 并发时所有请求都在自己的快照上看不到当天菜单，于是都去插入；赢的那个提交后，
     * 输的四个拿到的快照仍是插入之前的，回读依然"查无此菜单" → DuplicateKeyException 逃出 catch
     * → 全局处理器兜成 **409「记录已存在，请勿重复操作」**，而那道菜根本没进菜单。
     *
     * 量法：`MenuWriteRaceTests#fiveFamilyMembersOrderAtOnceNobodyGets5xxAndAllDishesStay`
     * （5 个家人同时点菜）。把这把锁拿掉重跑，5 个请求里 **4 个 409、只有 1 个成功**；
     * 锁在时 5/5 都是 200，菜单恰好一行、5 道菜一道不少。
     * 修法就是这条 `FOR UPDATE`：同一家庭的写请求排队，后来者拿到锁时赢家已经提交，
     * 它的第一次菜单读取就看得见那条已存在的菜单，走的是"直接用"，而不是"重复插入再回读"。
     * （`uk_family_menu_date` / `uk_shopping_menu` 保留了——它们是最后一道防线，不是这里的对策。）
     *
     * ponytail: 粗粒度——同一家庭的写请求排队。菜单域每次写入都是毫秒级、单家庭并发量极低，
     * 真到了瓶颈再按 (family_id, menu_date) 拆细。另一个更根本的修法是让 ensureXxx 自己变成
     * 「INSERT ... ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)」一条语句取 id（不依赖回读，
     * 也就不怕快照陈旧）；眼下这把锁已经把三条写路径全覆盖，先不做。
     *
     * 锁对象选 family 行：粒度正好是「一家人」，这一行永远存在（拿不到就是 familyId 已经不对，
     * 直接 400 而不是发一个永远拿不到的锁），SELECT ... FOR UPDATE 随事务提交/回滚自动释放，
     * 不像 GET_LOCK 那样要担心连接归还池时漏放。全库只有这一处用 family 行做锁
     * （另一处 FOR UPDATE 在 payment_order 上，与菜单域无交集），所以不存在锁序交叉。
     *
     * ⚠ 必须在事务里调（本类比它加锁的写方法都带 @Transactional，就是这个前提）；
     * 在自动提交下 FOR UPDATE 加完立刻放，等于没加。
     * ⚠ 同一个事务里重复调是安全的（addMenuItem 会带着锁再调 rebuildShoppingList）。
     */
    private void lockFamilyMenuWrites(long familyId) {
        Long locked = jdbcTemplate.query(
                "SELECT id FROM family WHERE id = ? FOR UPDATE",
                rs -> rs.next() ? rs.getLong(1) : null,
                familyId
        );
        if (locked == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.BAD_REQUEST, "家庭不存在，请重新进入家庭后再试");
        }
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
            // ⚠ 这个回读**只有在事务快照能看到赢家提交的前提下才有效**——同类写法曾在这里出过事
            // （并发点菜 4/5 拿到 409），所以写路径一律先走 lockFamilyMenuWrites 串行化。
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
        try {
            jdbcTemplate.update(connection -> {
                PreparedStatement ps = connection.prepareStatement(
                        "INSERT INTO shopping_list(family_id, daily_menu_id, status) VALUES (?, ?, 'OPEN')",
                        Statement.RETURN_GENERATED_KEYS
                );
                ps.setLong(1, familyId);
                ps.setLong(2, menuId);
                return ps;
            }, keyHolder);
        } catch (DuplicateKeyException ignored) {
            // 同一家庭的两个成员同一天首次打开清单会撞 uk_shopping_menu。
            // 与 ensureTodayMenu 一样回读已存在的那条，而不是把 500 抛给用户。
            // 同样注意：回读有效的前提是快照够新，所以写路径都先拿 lockFamilyMenuWrites。
            Long existing = findShoppingListId(menuId);
            if (existing != null) {
                return existing;
            }
            throw ignored;
        }
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("shopping list create failed");
        }
        return key.longValue();
    }

    private Long findShoppingListId(long menuId) {
        return jdbcTemplate.query("""
                        SELECT id
                        FROM shopping_list
                        WHERE daily_menu_id = ?
                        LIMIT 1
                        """,
                rs -> rs.next() ? rs.getLong("id") : null,
                menuId
        );
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
                        SELECT dmi.id AS item_id, dmi.recipe_id, dmi.meal_type, dmi.status AS item_status, dmi.added_by_name,
                               r.id, r.title, r.source_type, r.cuisine, r.taste_tags_json,
                               r.time_cost, r.servings, r.rating, r.source_url, r.summary, r.cover_image
                        FROM daily_menu_item dmi
                        JOIN recipe r ON r.id = dmi.recipe_id
                        WHERE dmi.daily_menu_id = ?
                        ORDER BY dmi.id ASC
                        """,
                (rs, rowNum) -> new DailyMenuItemView(
                        rs.getLong("item_id"),
                        rs.getLong("recipe_id"),
                        rs.getString("meal_type"),
                        rs.getString("item_status"),
                        rs.getString("added_by_name"),
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
                                rs.getString("cover_image"),
                                null,
                                null
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
        // 原来是一条 SQL 里带相关子查询：清单有 N 行就把"daily_menu_item × recipe × recipe_ingredient × shopping_list"
        // 这个四表连接跑 N 遍（EXPLAIN 里是 N 个 DEPENDENT SUBQUERY）。改成两条查询 + Java 侧分组。
        List<ShoppingListItemView> items = jdbcTemplate.query("""
                        SELECT sli.id, sli.ingredient_name, sli.amount, sli.unit, sli.purchased
                        FROM shopping_list_item sli
                        WHERE sli.shopping_list_id = ?
                        ORDER BY sli.purchased ASC, sli.ingredient_name ASC
                        """,
                (rs, rowNum) -> new ShoppingListItemView(
                        rs.getLong("id"),
                        rs.getString("ingredient_name"),
                        rs.getString("amount"),
                        rs.getString("unit"),
                        rs.getBoolean("purchased"),
                        new ArrayList<>()   // 来源在下面第二步填进去
                ),
                shoppingListId
        );
        if (items.isEmpty()) {
            return List.of();
        }
        // 把每条食材回溯到今日菜单中使用它的菜谱（手动补充的食材匹配不到，留空）
        Map<String, List<String>> titlesByIngredient = new HashMap<>();
        jdbcTemplate.query("""
                        SELECT DISTINCT ri.ingredient_name, r.title
                        FROM shopping_list sl
                        JOIN daily_menu_item dmi ON dmi.daily_menu_id = sl.daily_menu_id
                        JOIN recipe r ON r.id = dmi.recipe_id
                        JOIN recipe_ingredient ri ON ri.recipe_id = r.id
                        WHERE sl.id = ?
                        """,
                rs -> {
                    String name = rs.getString("ingredient_name");
                    // 原来 GROUP_CONCAT(... ORDER BY r.title) 按菜名排；Java 侧保持同一顺序，
                    // 免得清单上"来自哪道菜"的顺序在两个版本之间跳
                    titlesByIngredient.computeIfAbsent(name, k -> new ArrayList<>()).add(rs.getString("title"));
                },
                shoppingListId
        );
        List<ShoppingListItemView> out = new ArrayList<>(items.size());
        for (ShoppingListItemView item : items) {
            List<String> titles = new ArrayList<>(titlesByIngredient.getOrDefault(item.ingredientName(), List.of()));
            // 原来 GROUP_CONCAT(... ORDER BY r.title) 按菜名排；Java 侧保持同一顺序，
            // 免得清单上"来自哪道菜"的顺序在两个版本之间跳
            titles.sort(java.util.Comparator.naturalOrder());
            out.add(withSources(item, titles));
        }
        return out;
    }

    /** 视图记录是不可变的，分组结果只能这样回填——比原来塞子查询便宜得多（一次查询 + 内存拼装）。 */
    private static ShoppingListItemView withSources(ShoppingListItemView item, List<String> titles) {
        return new ShoppingListItemView(item.itemId(), item.ingredientName(), item.amount(), item.unit(),
                item.purchased(), titles);
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
        // 这里只要"名字/单位/买没买"三样，原来却走 loadShoppingItems（连带把"来自哪道菜"
        // 的菜谱回溯也跑一遍）。重建清单每次都要读它一次，白付一次四表连接。
        jdbcTemplate.query(
                "SELECT ingredient_name, unit, purchased FROM shopping_list_item WHERE shopping_list_id = ?",
                (org.springframework.jdbc.core.RowCallbackHandler) rs -> {
                    result.put(normalizeIngredientKey(rs.getString("ingredient_name"), rs.getString("unit")),
                            rs.getBoolean("purchased"));
                },
                shoppingListId
        );
        return result;
    }

    private String normalizeStatus(String status) {
        if (status == null || status.isBlank()) {
            return "todo";
        }
        String normalized = status.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "todo", "cooking", "done" -> normalized;
            default -> "todo";
        };
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
