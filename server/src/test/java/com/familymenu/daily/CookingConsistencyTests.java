package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

@SpringBootTest(properties = "app.seed-demo-data=false")
@AutoConfigureMockMvc
class CookingConsistencyTests {
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;

    private String token;
    private long userId;
    private long familyId;
    private long recipeId;
    private final List<Long> recipes = new ArrayList<>();

    @BeforeEach
    void setup() throws Exception {
        JsonNode guest = json.readTree(mvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "cooking-check-" + UUID.randomUUID()))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        token = guest.get("token").asText();
        userId = guest.get("user").get("userId").asLong();
        familyId = guest.get("user").get("familyId").asLong();
        recipeId = insertRecipe();
        ingredient("鸡蛋", "个", "2");
    }

    private long insertRecipe() {
        jdbc.update("""
                INSERT INTO recipe(title, source_type, owner_user_id, family_id, cuisine, taste_tags_json, servings)
                VALUES ('完成一致性测试', 'family', ?, ?, '家常', '[]', 4)
                """, userId, familyId);
        long id = jdbc.queryForObject("SELECT MAX(id) FROM recipe WHERE owner_user_id = ?", Long.class, userId);
        recipes.add(id);
        return id;
    }

    private void ingredient(String name, String unit, String amount) {
        jdbc.update("INSERT INTO recipe_ingredient(recipe_id, ingredient_name, unit, amount) VALUES (?, ?, ?, ?)",
                recipeId, name, unit, amount);
    }

    private void stock(String name, String unit, String amount) {
        jdbc.update("INSERT INTO pantry_item(family_id, user_id, ingredient_name, unit, amount) VALUES (?, ?, ?, ?, ?)",
                familyId, userId, name, unit, amount);
    }

    private double eggAmount() {
        return jdbc.queryForObject("SELECT COALESCE(SUM(amount + 0), 0) FROM pantry_item WHERE family_id = ? AND ingredient_name = '鸡蛋'",
                Double.class, familyId);
    }

    private JsonNode cook(Map<String, Object> body) throws Exception {
        return json.readTree(mvc.perform(post("/api/cook-history").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private List<JsonNode> together(Callable<JsonNode> first, Callable<JsonNode> second) throws Exception {
        var pool = Executors.newFixedThreadPool(2);
        var barrier = new CyclicBarrier(2);
        try {
            var a = pool.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return first.call(); });
            var b = pool.submit(() -> { barrier.await(10, TimeUnit.SECONDS); return second.call(); });
            return List.of(a.get(30, TimeUnit.SECONDS), b.get(30, TimeUnit.SECONDS));
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void actualServingsScaleStockAndOldClientsStillUseTheStandardAmount() throws Exception {
        stock("鸡蛋", "个", "20");
        cook(Map.of("recipeId", recipeId, "servings", 8, "completionId", "eight"));
        assertThat(eggAmount()).isEqualTo(16);
        cook(Map.of("recipeId", recipeId, "servings", 2, "completionId", "two"));
        assertThat(eggAmount()).isEqualTo(15);
        cook(Map.of("recipeId", recipeId, "completionId", "standard"));
        assertThat(eggAmount()).isEqualTo(13);
        JsonNode legacy = cook(Map.of("recipeId", recipeId));
        assertThat(cook(Map.of("recipeId", recipeId)).get("id")).isEqualTo(legacy.get("id"));
        assertThat(eggAmount()).isEqualTo(11);
    }

    @Test
    void scoredRetriesIncludingConcurrentAndLateRetriesDeductAndRateOnlyOnce() throws Exception {
        stock("鸡蛋", "个", "20");
        Map<String, Object> body = Map.of("recipeId", recipeId, "servings", 8, "score", 5, "completionId", "same-completion");
        List<JsonNode> responses = together(() -> cook(body), () -> cook(body));
        assertThat(responses.get(0).get("id")).isEqualTo(responses.get(1).get("id"));
        assertThat(eggAmount()).isEqualTo(16);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cook_history WHERE recipe_id = ?", Integer.class, recipeId)).isEqualTo(1);
        jdbc.update("UPDATE cook_history SET cooked_at = NOW() - INTERVAL 2 MINUTE WHERE recipe_id = ?", recipeId);
        JsonNode late = cook(body);
        assertThat(late.get("id")).isEqualTo(responses.get(0).get("id"));
        assertThat(late.get("pantryDeducted").asInt()).isZero();
        assertThat(eggAmount()).isEqualTo(16);
        cook(Map.of("recipeId", recipeId, "servings", 8, "score", 1, "completionId", "another-completion"));
        assertThat(eggAmount()).isEqualTo(12);
        assertThat(jdbc.queryForObject("SELECT rating FROM recipe WHERE id = ?", Double.class, recipeId)).isEqualTo(3);
    }

    @Test
    void differentCompletionIdsRepresentTwoRealCooksWithinOneMinute() throws Exception {
        stock("鸡蛋", "个", "20");
        together(() -> cook(Map.of("recipeId", recipeId, "servings", 8, "score", 5, "completionId", "first")),
                () -> cook(Map.of("recipeId", recipeId, "servings", 8, "score", 1, "completionId", "second")));
        assertThat(eggAmount()).isEqualTo(12);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cook_history WHERE recipe_id = ?", Integer.class, recipeId)).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT rating FROM recipe WHERE id = ?", Double.class, recipeId)).isEqualTo(3);
    }

    @Test
    void differentRecipesConsumeSharedStockFromTheLatestCommittedAmount() throws Exception {
        stock("鸡蛋", "个", "20");
        long other = insertRecipe();
        jdbc.update("INSERT INTO recipe_ingredient(recipe_id, ingredient_name, unit, amount) VALUES (?, '鸡蛋', '个', '2')", other);
        together(() -> cook(Map.of("recipeId", recipeId, "servings", 8, "completionId", "dish-one")),
                () -> cook(Map.of("recipeId", other, "servings", 8, "completionId", "dish-two")));
        assertThat(eggAmount()).isEqualTo(12);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cook_history WHERE family_id = ?", Integer.class, familyId)).isEqualTo(2);
    }

    @Test
    void completionIdCannotBeReusedForAnotherRecipe() throws Exception {
        cook(Map.of("recipeId", recipeId, "completionId", "same-action"));
        mvc.perform(post("/api/cook-history").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("recipeId", insertRecipe(), "completionId", "same-action"))))
                .andExpect(status().isConflict());
    }

    private JsonNode add(String meal) throws Exception {
        return json.readTree(mvc.perform(post("/api/daily-menu/today/items").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json.writeValueAsString(Map.of("recipeId", recipeId, "mealType", meal))))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
    }

    private long itemId(JsonNode menu, String meal) {
        for (JsonNode item : menu.get("items")) {
            if (meal.equals(item.get("mealType").asText())) return item.get("itemId").asLong();
        }
        throw new AssertionError("missing meal " + meal);
    }

    private void mark(long itemId, String state) throws Exception {
        mvc.perform(patch("/api/daily-menu/today/items/" + itemId + "/status").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(Map.of("status", state))))
                .andExpect(status().isOk());
    }

    @Test
    void mealsKeepSeparateIdsAndStatesAndRemovingDinnerKeepsLunch() throws Exception {
        long lunch = itemId(add("lunch"), "lunch");
        mark(lunch, "done");
        long dinner = itemId(add("dinner"), "dinner");
        mark(dinner, "cooking");
        assertThat(itemId(add("lunch"), "lunch")).isEqualTo(lunch);
        JsonNode menu = add("dinner");
        assertThat(itemId(menu, "dinner")).isEqualTo(dinner);
        assertThat(menu.get("items").size()).isEqualTo(2);
        assertThat(jdbc.queryForObject("SELECT status FROM daily_menu_item WHERE id = ?", String.class, lunch)).isEqualTo("done");
        assertThat(jdbc.queryForObject("SELECT status FROM daily_menu_item WHERE id = ?", String.class, dinner)).isEqualTo("cooking");
        assertThat(shoppingEggs()).isEqualTo(4);
        mvc.perform(delete("/api/daily-menu/today/items/" + recipeId).param("mealType", "dinner").header("X-Auth-Token", token))
                .andExpect(status().isOk());
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM daily_menu_item WHERE id = ?", Integer.class, lunch)).isEqualTo(1);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM daily_menu_item WHERE id = ?", Integer.class, dinner)).isZero();
        assertThat(shoppingEggs()).isEqualTo(2);
    }

    private double shoppingEggs() {
        return jdbc.queryForObject("""
                SELECT SUM(sli.amount + 0) FROM shopping_list_item sli
                JOIN shopping_list sl ON sl.id = sli.shopping_list_id
                WHERE sl.family_id = ? AND sli.ingredient_name = '鸡蛋'
                """, Double.class, familyId);
    }

    @Test
    void simultaneousSameMealAddsOneItemAndKeepsItsStateOnRetry() throws Exception {
        List<JsonNode> menus = together(() -> add("dinner"), () -> add("dinner"));
        long item = itemId(menus.get(0), "dinner");
        assertThat(itemId(menus.get(1), "dinner")).isEqualTo(item);
        mark(item, "done");
        assertThat(itemId(add("dinner"), "dinner")).isEqualTo(item);
        assertThat(jdbc.queryForObject("SELECT status FROM daily_menu_item WHERE id = ?", String.class, item)).isEqualTo("done");
    }

    private JsonNode match() throws Exception {
        JsonNode matches = json.readTree(mvc.perform(get("/api/pantry/match").header("X-Auth-Token", token))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        for (JsonNode row : matches) if (row.get("recipe").get("id").asLong() == recipeId) return row;
        throw new AssertionError("recipe missing from matches");
    }

    @Test
    void matchingRequiresEnoughStockAggregatesRowsAndRepeatedIngredients() throws Exception {
        ingredient("测试米", "g", "1");
        stock("测试米", "g", "2");
        stock("鸡蛋", "个", "1");
        assertThat(match().get("matchRate").asDouble()).isEqualTo(0.5);
        stock("鸡蛋", "个", "1");
        assertThat(match().get("matchRate").asDouble()).isEqualTo(1);
        ingredient("鸡 蛋", "个", "2");
        assertThat(match().get("matchedCount").asInt()).isEqualTo(1);
        stock(" 鸡蛋 ", "个", "2");
        assertThat(match().get("matchRate").asDouble()).isEqualTo(1);
    }

    @Test
    void invalidCompletionInputsAreRejectedBeforeAnyWrite() throws Exception {
        for (Map<String, Object> invalid : List.<Map<String, Object>>of(
                Map.of("score", 0), Map.of("score", 6), Map.of("servings", 0), Map.of("servings", 100),
                Map.of("completionId", "bad space"), Map.of("completionId", ""),
                Map.of("completionId", "a".repeat(65)), Map.of("remark", "a".repeat(256)))) {
            var body = new java.util.HashMap<>(invalid);
            body.put("recipeId", recipeId);
            mvc.perform(post("/api/cook-history").header("X-Auth-Token", token)
                            .contentType(MediaType.APPLICATION_JSON).content(json.writeValueAsString(body)))
                    .andExpect(status().isBadRequest());
        }
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM cook_history WHERE recipe_id = ?", Integer.class, recipeId)).isZero();
    }

    @AfterEach
    void cleanup() {
        jdbc.update("DELETE FROM cook_history WHERE family_id = ?", familyId);
        jdbc.update("DELETE FROM pantry_item WHERE family_id = ?", familyId);
        jdbc.update("DELETE sli FROM shopping_list_item sli JOIN shopping_list sl ON sl.id = sli.shopping_list_id WHERE sl.family_id = ?", familyId);
        jdbc.update("DELETE FROM shopping_list WHERE family_id = ?", familyId);
        jdbc.update("DELETE dmi FROM daily_menu_item dmi JOIN daily_menu dm ON dm.id = dmi.daily_menu_id WHERE dm.family_id = ?", familyId);
        for (long id : recipes) {
            jdbc.update("DELETE FROM recipe_ingredient WHERE recipe_id = ?", id);
            jdbc.update("DELETE FROM recipe WHERE id = ?", id);
        }
    }
}
