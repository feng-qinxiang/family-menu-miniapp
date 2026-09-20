package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 帖子关联的菜谱只发给「打得开这道菜的人」。
 *
 * 关联菜谱原本只是当成展示字段：`LEFT JOIN recipe r ON r.id = p.recipe_id` 之后无差别塞进响应。
 * 结果是别人家的私房菜（is_public=0 且不属于社区/公共库）会跟着帖子发到所有陌生人手里——
 * 菜名、菜系、耗时、份量全在，点进去却是 404（菜谱详情有权限校验）。
 * 这条规则要同时钉住**三条读路径**（信息流 / 帖子详情 / 我的收藏），它们各自一条 SQL，
 * 少改一条就漏一条：所以下面每条都用同一个判据走一遍。
 *
 * 反向判据同样重要：公共库的菜谱必须照旧随帖子发出，否则这个字段就白留了。
 */
@SpringBootTest
@AutoConfigureMockMvc
class CommunityPostRecipeScopeTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private JsonNode newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "postrecipe-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /** 私房菜：本家庭可见，别人打不开。 */
    private long insertPrivateRecipe(long ownerUserId, long familyId, String title) {
        jdbcTemplate.update("""
                        INSERT INTO recipe (title, source_type, owner_user_id, family_id, is_public,
                                            cuisine, taste_tags_json, time_cost, servings, rating)
                        VALUES (?, 'owned', ?, ?, 0, '家常', '[]', 10, 2, 4.5)
                        """,
                title, ownerUserId, familyId);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    /** 公共菜谱库：is_public=1、不属于任何家庭，人人都能打开。 */
    private long insertPublicRecipe(String title) {
        jdbcTemplate.update("""
                        INSERT INTO recipe (title, source_type, owner_user_id, family_id, is_public,
                                            cuisine, taste_tags_json, time_cost, servings, rating)
                        VALUES (?, 'owned', 1, NULL, 1, '家常', '[]', 10, 2, 4.5)
                        """,
                title);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    /** 直接入库并置为已过审：走接口发帖会被内容机审拦成 PENDING（游客 openid 过不了 msgSecCheck）。 */
    private long insertApprovedPost(long authorUserId, Long recipeId, String title) {
        jdbcTemplate.update("""
                        INSERT INTO community_post (recipe_id, author_user_id, title, content, tags_json, images_json, audit_status)
                        VALUES (?, ?, ?, '正文', '[]', '[]', 'APPROVED')
                        """,
                recipeId, authorUserId, title);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private JsonNode postDetail(String token, long postId) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/community/posts/" + postId)
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /** 信息流里找到指定帖子（分页里一条条翻，库是共享的，不能按位置断言）。 */
    private JsonNode feedPost(String token, long postId) throws Exception {
        for (int page = 1; page <= 20; page++) {
            MvcResult result = mockMvc.perform(get("/api/community/posts")
                            .header("X-Auth-Token", token)
                            .param("page", String.valueOf(page))
                            .param("size", "50"))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode posts = objectMapper.readTree(result.getResponse().getContentAsString());
            if (posts.isEmpty()) {
                break;
            }
            for (JsonNode node : posts) {
                if (node.get("id").asLong() == postId) {
                    return node;
                }
            }
        }
        return null;
    }

    private static boolean recipeHidden(JsonNode post) {
        JsonNode card = post.get("recipe");
        return card == null || card.isNull();
    }

    @Test
    void privateFamilyRecipeIsNotHandedOutWithOtherPeoplesPost() throws Exception {
        JsonNode owner = newGuest();
        long ownerId = owner.get("user").get("userId").asLong();
        long ownerFamily = owner.get("user").get("familyId").asLong();
        String ownerToken = owner.get("token").asText();
        String strangerToken = newGuest().get("token").asText();

        long privateRecipe = insertPrivateRecipe(ownerId, ownerFamily, "私房菜-红烧排骨-" + System.nanoTime());
        // 断言用 ASCII 标记：MockMvc 的 getContentAsString() 默认按 ISO-8859-1 解码，中文比不了
        String marker = String.valueOf(System.nanoTime());
        long post = insertApprovedPost(ownerId, privateRecipe, "今晚的私房菜 " + marker);

        // ① 帖子详情：打不开这道菜的人拿到的是 null，不是"标题在、点进去 404"
        JsonNode strangerView = postDetail(strangerToken, post);
        assertThat(recipeHidden(strangerView))
                .as("陌生人拿到了别人家私房菜的卡片（菜名/耗时/份量全在，点进去 404）")
                .isTrue();
        // 藏起来的只有那道菜的入口：帖子正文照旧是公开的
        assertThat(strangerView.get("title").asText()).contains(marker);

        // ② 信息流：同一判据（这条是另一条 SQL，改漏了会在这里红）
        JsonNode feedNode = feedPost(strangerToken, post);
        assertThat(feedNode).as("刚过审的帖子在信息流里找不到").isNotNull();
        assertThat(recipeHidden(feedNode)).as("信息流仍把别人家的私房菜卡片发出来").isTrue();

        // ③ 我的收藏：第三条 SQL
        mockMvc.perform(post("/api/community/posts/" + post + "/favorite")
                        .header("X-Auth-Token", strangerToken))
                .andExpect(status().isOk());
        MvcResult favorites = mockMvc.perform(get("/api/me/favorites")
                        .header("X-Auth-Token", strangerToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode favoriteNode = null;
        for (JsonNode node : objectMapper.readTree(favorites.getResponse().getContentAsString())) {
            if (node.get("id").asLong() == post) {
                favoriteNode = node;
            }
        }
        assertThat(favoriteNode).as("收藏列表里没有这条帖子").isNotNull();
        assertThat(recipeHidden(favoriteNode)).as("收藏列表仍把别人家的私房菜卡片发出来").isTrue();

        // ④ 反向：本家自己看得到这道菜（锁的是"别人家"，不是"这个字段"）
        JsonNode ownerView = postDetail(ownerToken, post);
        assertThat(ownerView.get("recipe").get("id").asLong()).isEqualTo(privateRecipe);
    }

    @Test
    void publicLibraryRecipeStillTravelsWithThePost() throws Exception {
        JsonNode author = newGuest();
        long authorId = author.get("user").get("userId").asLong();
        String strangerToken = newGuest().get("token").asText();

        long publicRecipe = insertPublicRecipe("公共库-番茄炒蛋-" + System.nanoTime());
        long post = insertApprovedPost(authorId, publicRecipe, "公共菜谱的作业 " + System.nanoTime());

        JsonNode strangerView = postDetail(strangerToken, post);
        assertThat(recipeHidden(strangerView))
                .as("公共菜谱是给人照着做的，不该被一起藏掉")
                .isFalse();
        assertThat(strangerView.get("recipe").get("id").asLong()).isEqualTo(publicRecipe);
    }
}
