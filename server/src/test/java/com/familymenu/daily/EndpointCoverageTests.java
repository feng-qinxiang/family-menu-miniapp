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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 补齐此前完全没有测试覆盖的端点，每个端点一条正常路径。
 *
 * 为什么需要：这些接口都是小程序里真实按钮的落点，没有测试时改一处 SQL 就可能静默写坏数据，
 * 而肉眼看代码看不出来（历史上就出现过"补齐 schema 缺失列，否则全新部署全 500"的问题）。
 * 覆盖清单（原先 0 覆盖）：
 *   菜谱写（POST/PUT /api/recipes）、菜谱详情
 *   家庭成员（POST /api/family/members）、家庭资料
 *   库存写（POST/DELETE /api/pantry）
 *   菜单项状态流转、开饭广播、移出今日菜单
 *   购物清单写（POST/PATCH/DELETE items）
 *   社区写（发帖 / 收藏 / 举报）、我的收藏、举报列表鉴权
 *   导入预览
 *
 * 依赖本地 MySQL（与既有测试一致）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class EndpointCoverageTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "coverage-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private MvcResult postJson(String url, String token, Object body) throws Exception {
        return mockMvc.perform(post(url)
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    /** 造一道自有菜谱，作为菜单/购物清单/社区用例的数据源。 */
    private long createRecipe(String token) throws Exception {
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("title", "测试菜谱 " + System.nanoTime());
        body.put("cuisine", "家常");
        body.put("tasteTags", List.of("清淡"));
        body.put("steps", List.of("切菜", "下锅"));
        body.put("ingredients", List.of(Map.of("name", "番茄", "amount", "2", "unit", "个")));
        MvcResult result = postJson("/api/recipes", token, body);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        return json(result).get("id").asLong();
    }

    // ==================== 菜谱 ====================

    @Test
    void createUpdateAndReadRecipe() throws Exception {
        String token = guestLogin();
        long recipeId = createRecipe(token);

        mockMvc.perform(get("/api/recipes/" + recipeId).header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(recipeId));

        MvcResult updated = mockMvc.perform(put("/api/recipes/" + recipeId)
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "title", "改过的名字",
                                "tasteTags", List.of("微辣"),
                                "steps", List.of("重新写的一步"),
                                "ingredients", List.of(Map.of("name", "鸡蛋", "amount", "3", "unit", "个"))))))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(json(updated).get("title").asText()).isEqualTo("改过的名字");
    }

    @Test
    void recipeFilterEndpointWorks() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/recipes/filter?source=all").header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    // ==================== 家庭 ====================

    @Test
    void familyProfileAndAddMember() throws Exception {
        String token = guestLogin();

        mockMvc.perform(get("/api/family/profile").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members").isArray());

        mockMvc.perform(post("/api/family/members")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "nickname", "新成员" + System.nanoTime(),
                                "role", "member",
                                "avoidTags", List.of("花生")))))
                .andExpect(status().isOk());

        MvcResult profile = mockMvc.perform(get("/api/family/profile").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(json(profile).get("members").size()).isGreaterThanOrEqualTo(2);
    }

    // ==================== 库存 ====================

    @Test
    void pantryAddListDelete() throws Exception {
        String token = guestLogin();
        String name = "库存测试食材" + System.nanoTime();

        MvcResult added = postJson("/api/pantry", token, Map.of(
                "ingredientName", name, "amount", "1", "unit", "份"));
        assertThat(added.getResponse().getStatus()).isEqualTo(200);

        MvcResult list = mockMvc.perform(get("/api/pantry").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode items = json(list);
        long itemId = -1;
        for (JsonNode item : items) {
            if (name.equals(item.get("ingredientName").asText())) {
                itemId = item.get("id").asLong();
            }
        }
        assertThat(itemId).isPositive();

        mockMvc.perform(delete("/api/pantry/" + itemId).header("X-Auth-Token", token))
                .andExpect(status().isOk());

        MvcResult after = mockMvc.perform(get("/api/pantry").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        for (JsonNode item : json(after)) {
            assertThat(item.get("id").asLong()).isNotEqualTo(itemId);
        }
    }

    // ==================== 今日菜单 / 购物清单 ====================

    @Test
    void menuItemStatusFlowAndAnnounce() throws Exception {
        String token = guestLogin();
        long recipeId = createRecipe(token);

        MvcResult added = postJson("/api/daily-menu/today/items", token,
                Map.of("recipeId", recipeId, "mealType", "dinner"));
        assertThat(added.getResponse().getStatus()).isEqualTo(200);

        // 状态流转要落在具体菜单项上，itemId 从今日菜单读
        JsonNode menu = json(mockMvc.perform(get("/api/daily-menu/today").header("X-Auth-Token", token))
                .andExpect(status().isOk()).andReturn());
        long itemId = -1;
        for (JsonNode item : menu.get("items")) {
            if (item.get("recipeId").asLong() == recipeId) {
                itemId = item.get("itemId").asLong();
            }
        }
        assertThat(itemId).isPositive();

        mockMvc.perform(patch("/api/daily-menu/today/items/" + itemId + "/status")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"status\":\"done\"}"))
                .andExpect(status().isOk());

        // 开饭广播：给家里其他人发站内通知
        mockMvc.perform(post("/api/daily-menu/today/announce").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));

        mockMvc.perform(delete("/api/daily-menu/today/items/" + recipeId).header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    @Test
    void shoppingItemAddToggleAndDelete() throws Exception {
        String token = guestLogin();
        String name = "清单测试食材" + System.nanoTime();

        MvcResult added = postJson("/api/shopping-list/today/items", token,
                Map.of("ingredientName", name, "amount", "2", "unit", "斤"));
        assertThat(added.getResponse().getStatus()).isEqualTo(200);

        JsonNode list = json(mockMvc.perform(get("/api/shopping-list/today").header("X-Auth-Token", token))
                .andExpect(status().isOk()).andReturn());
        long itemId = -1;
        for (JsonNode item : list.get("items")) {
            if (name.equals(item.get("ingredientName").asText())) {
                itemId = item.get("itemId").asLong();
            }
        }
        assertThat(itemId).isPositive();

        mockMvc.perform(patch("/api/shopping-list/today/items/" + itemId)
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purchased\":true}"))
                .andExpect(status().isOk());

        mockMvc.perform(delete("/api/shopping-list/today/items/" + itemId).header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    @Test
    void rebuildShoppingListWorks() throws Exception {
        String token = guestLogin();
        long recipeId = createRecipe(token);
        postJson("/api/daily-menu/today/items", token, Map.of("recipeId", recipeId, "mealType", "lunch"));

        mockMvc.perform(post("/api/shopping-list/today/rebuild").header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    // ==================== 社区写入 ====================

    @Test
    void communityPostCreateFavoriteAndListFavorites() throws Exception {
        String token = guestLogin();

        MvcResult created = postJson("/api/community/posts", token, Map.of(
                "title", "测试帖子 " + System.nanoTime(),
                "content", "这是一条用于覆盖接口的测试内容",
                "tags", List.of("测试")));
        assertThat(created.getResponse().getStatus()).isEqualTo(200);
        long postId = json(created).get("id").asLong();
        assertThat(postId).isPositive();

        mockMvc.perform(post("/api/community/posts/" + postId + "/favorite")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk());

        MvcResult favorites = mockMvc.perform(get("/api/me/favorites").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        boolean found = false;
        for (JsonNode post : json(favorites)) {
            if (post.get("id").asLong() == postId) {
                found = true;
            }
        }
        assertThat(found).isTrue();
    }

    @Test
    void communityReportCanBeSubmitted() throws Exception {
        String token = guestLogin();
        MvcResult created = postJson("/api/community/posts", token, Map.of(
                "title", "被举报的测试帖子 " + System.nanoTime(),
                "content", "用于覆盖举报接口"));
        long postId = json(created).get("id").asLong();

        mockMvc.perform(post("/api/community/posts/" + postId + "/report")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "reason", "内容不实",
                                "description", "接口覆盖测试"))))
                .andExpect(status().isOk());
    }

    /** 举报队列是运营功能，普通用户不得读取（越权会暴露他人举报内容）。 */
    @Test
    void reportQueueIsAdminOnly() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/admin/reports").header("X-Auth-Token", token))
                .andExpect(status().isForbidden());
    }

    @Test
    void communityLikeToggles() throws Exception {
        String token = guestLogin();
        MvcResult created = postJson("/api/community/posts", token, Map.of(
                "title", "点赞测试帖子 " + System.nanoTime(),
                "content", "用于覆盖点赞接口"));
        long postId = json(created).get("id").asLong();

        mockMvc.perform(post("/api/community/posts/" + postId + "/like")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    @Test
    void communityCommentCanBeAdded() throws Exception {
        String token = guestLogin();
        MvcResult created = postJson("/api/community/posts", token, Map.of(
                "title", "评论测试帖子 " + System.nanoTime(),
                "content", "用于覆盖评论接口"));
        long postId = json(created).get("id").asLong();

        mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"覆盖测试评论\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/community/posts/" + postId + "/comments")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    // ==================== 导入 ====================

    @Test
    void importPreviewParsesText() throws Exception {
        String token = guestLogin();
        MvcResult result = postJson("/api/import/preview", token, Map.of(
                "rawText", "番茄炒蛋\n\n食材：\n鸡蛋 2 个\n番茄 3 个\n\n步骤：\n1. 鸡蛋打散\n2. 番茄切块\n3. 下锅翻炒"));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    // ==================== 做菜记录写入 ====================

    @Test
    void cookHistoryCanBeAdded() throws Exception {
        String token = guestLogin();
        long recipeId = createRecipe(token);

        MvcResult result = postJson("/api/cook-history", token, Map.of(
                "recipeId", recipeId,
                "score", 5,
                "remark", "覆盖测试：记录一次做菜"));
        assertThat(result.getResponse().getStatus()).isEqualTo(200);

        mockMvc.perform(get("/api/cook-history").header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }
}
