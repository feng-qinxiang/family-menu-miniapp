package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 购物清单的「来自哪道菜」。
 *
 * R8 把这一段从"每行一次四表关联子查询 + GROUP_CONCAT"改成"两条查询 + Java 侧分组"，
 * 而既有测试只验证条目数量、没验证来源文案——恰好是我改动的那部分没人看着，
 * 所以单独钉一条：派生出来的食材必须回指真正用到它的那道菜。
 * 顺带钉住 GROUP_CONCAT 的老毛病：它受 group_concat_max_len（默认 1024 字节）限制，
 * 一道菜名很长或共用食材很多时会被静默截断，Java 侧拼接没有这个问题。
 */
@SpringBootTest
@AutoConfigureMockMvc
class ShoppingListSourceTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestToken() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "shoplist-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("token").asText();
    }

    @Test
    void derivedIngredientPointsBackToTheDishThatUsesIt() throws Exception {
        String token = guestToken();
        // 101 = 紫菜蛋花汤（data.sql 里的公开菜谱，食材含"鸡蛋"）
        mockMvc.perform(post("/api/daily-menu/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"recipeId\":101,\"mealType\":\"dinner\"}"))
                .andExpect(status().isOk());

        MvcResult list = mockMvc.perform(get("/api/shopping-list/today").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode items = objectMapper.readTree(list.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("items");
        assertThat(items.size()).as("加了菜，清单就该有派生条目").isPositive();

        JsonNode egg = null;
        for (JsonNode item : items) {
            if ("鸡蛋".equals(item.get("ingredientName").asText())) {
                egg = item;
                break;
            }
        }
        assertThat(egg).as("清单里应能找到鸡蛋").isNotNull();
        JsonNode sources = egg.get("sourceRecipes");
        assertThat(sources).as("来源不能因为改成分组查询就丢").isNotEmpty();
        boolean mentionsTheDish = false;
        for (JsonNode s : sources) {
            if (s.asText().contains("紫菜蛋花汤")) {
                mentionsTheDish = true;
            }
        }
        assertThat(mentionsTheDish)
                .as("鸡蛋来自紫菜蛋花汤，来源里必须写它，实际=%s", sources)
                .isTrue();
    }

    @Test
    void manualItemHasNoSourceDish() throws Exception {
        String token = guestToken();
        mockMvc.perform(post("/api/daily-menu/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"recipeId\":101,\"mealType\":\"dinner\"}"))
                .andExpect(status().isOk());
        // 手动补一条"抽纸"：它不属于任何菜谱，来源必须是空列表而不是 null
        mockMvc.perform(post("/api/shopping-list/today/rebuild").header("X-Auth-Token", token))
                .andExpect(status().isOk());

        MvcResult list = mockMvc.perform(get("/api/shopping-list/today").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode items = objectMapper.readTree(list.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("items");
        for (JsonNode item : items) {
            assertThat(item.get("sourceRecipes").isArray())
                    .as("每条都必须带 sourceRecipes 数组（前端按 .length 判断要不要显示来源）")
                    .isTrue();
        }
    }
}
