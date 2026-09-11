package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 菜谱库口径：公共菜谱库 vs 自家菜谱。
 *
 * 背景：平台自带的公共菜谱库（recipe.is_public = 1，data.sql 内置）和用户自建菜谱的
 * source_type 都是 owned，只按 sourceType 分类会把公共菜谱混进小程序的「自建」页 ——
 * 用户会看到一堆"自己没建过"的菜凭空出现在自家菜谱里（后台的数量也对不上）。
 * 所以后端在 RecipeCard 上给出 mine 字段，前端「自建」只认 mine = true。
 * 这个测试锁住这个字段的语义，避免以后有人把它改回按 sourceType 判断。
 */
@SpringBootTest
@AutoConfigureMockMvc
class RecipeLibraryScopeTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "recipe-scope-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("token").asText();
    }

    private JsonNode getJson(String path, String token) throws Exception {
        MvcResult result = mockMvc.perform(get(path).header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    /** 新账号没有任何自建菜谱：列表里所有 owned 菜谱都必须标记为"不是我的"。 */
    @Test
    void publicLibraryRecipesAreNotMarkedAsMine() throws Exception {
        String token = guestLogin();
        JsonNode list = getJson("/api/recipes?source=all", token);
        assertThat(list.size()).as("公共菜谱库必须对所有人可见（关的是演示数据，不是菜谱库）").isGreaterThan(0);

        int ownedCount = 0;
        for (JsonNode recipe : list) {
            if (!"owned".equals(recipe.path("sourceType").asText())) continue;
            ownedCount++;
            assertThat(recipe.path("mine").asBoolean())
                    .as("公共菜谱 #" + recipe.path("id").asLong() + " 不该被当成用户自建")
                    .isFalse();
        }
        assertThat(ownedCount).as("公共菜谱库里应有 owned 类型的菜谱").isGreaterThan(0);
    }

    /** 自己创建的菜谱必须标记 mine = true，否则前端「自建」页会看不到它。 */
    @Test
    void ownRecipeIsMarkedAsMine() throws Exception {
        String token = guestLogin();
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "自建口径测试菜谱 " + System.nanoTime());
        body.put("cuisine", "家常");
        body.put("tasteTags", List.of("清淡"));
        body.put("steps", List.of("切菜", "下锅"));
        body.put("ingredients", List.of(Map.of("name", "番茄", "amount", "2", "unit", "个")));
        MvcResult created = mockMvc.perform(post("/api/recipes")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andExpect(status().isOk())
                .andReturn();
        long recipeId = objectMapper.readTree(created.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("id").asLong();

        boolean found = false;
        for (JsonNode recipe : getJson("/api/recipes?source=all", token)) {
            if (recipe.path("id").asLong() != recipeId) continue;
            found = true;
            assertThat(recipe.path("mine").asBoolean()).isTrue();
        }
        assertThat(found).as("刚创建的菜谱应能在列表里看到").isTrue();
    }
}
