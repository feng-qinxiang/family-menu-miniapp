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
 * 「这道菜大家晒的」读路径：GET /api/community/posts?recipeId=N（菜谱详情页用）。
 *
 * 新读路径最容易犯的错不是 SQL 写错，而是**把别的路径的语义搬漏**，所以这里逐条钉：
 *  ① 只返回这道菜的帖子（不串味、不带全站信息流）；
 *  ② 审核语义与信息流一致：APPROVED 公开、PENDING 只有作者本人看得见；
 *  ③ 关联菜谱的可见性规则照旧（别人家的私房菜不随帖子发出去）——这条在
 *     CommunityPostRecipeScopeTests 里被点名过「少改一条就漏一条」，本路径是第四条；
 *  ④ recipeId 缺失/非法（0、负数）时回到普通信息流，不能变成"查了个空"。
 */
@SpringBootTest
@AutoConfigureMockMvc
class CommunityPostsByRecipeTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private JsonNode newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "byrecipe-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private long insertPublicRecipe(String title) {
        jdbcTemplate.update("""
                        INSERT INTO recipe (title, source_type, owner_user_id, family_id, is_public,
                                            cuisine, taste_tags_json, time_cost, servings, rating)
                        VALUES (?, 'owned', 1, NULL, 1, '家常', '[]', 10, 2, 4.5)
                        """,
                title);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private long insertPrivateRecipe(long ownerUserId, long familyId, String title) {
        jdbcTemplate.update("""
                        INSERT INTO recipe (title, source_type, owner_user_id, family_id, is_public,
                                            cuisine, taste_tags_json, time_cost, servings, rating)
                        VALUES (?, 'owned', ?, ?, 0, '家常', '[]', 10, 2, 4.5)
                        """,
                title, ownerUserId, familyId);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private long insertPost(long authorUserId, Long recipeId, String title, String auditStatus) {
        jdbcTemplate.update("""
                        INSERT INTO community_post (recipe_id, author_user_id, title, content, tags_json, images_json, audit_status)
                        VALUES (?, ?, ?, '正文', '[]', '[]', ?)
                        """,
                recipeId, authorUserId, title, auditStatus);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private JsonNode dishWorks(String token, long recipeId, Integer size) throws Exception {
        var request = get("/api/community/posts").header("X-Auth-Token", token).param("recipeId", String.valueOf(recipeId));
        if (size != null) {
            request = request.param("size", String.valueOf(size));
        }
        MvcResult result = mockMvc.perform(request).andExpect(status().isOk()).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private static boolean containsPost(JsonNode posts, long postId) {
        for (JsonNode node : posts) {
            if (node.get("id").asLong() == postId) {
                return true;
            }
        }
        return false;
    }

    @Test
    void onlyThisDishPostsComeBack() throws Exception {
        JsonNode author = newGuest();
        long authorId = author.get("user").get("userId").asLong();
        String token = author.get("token").asText();

        long dishA = insertPublicRecipe("按菜取帖-A-" + System.nanoTime());
        long dishB = insertPublicRecipe("按菜取帖-B-" + System.nanoTime());
        // 断言用 ASCII 标记：MockMvc 的 getContentAsString() 默认按 ISO-8859-1 解码，中文比不了
        String markerA = "workA" + System.nanoTime();
        long postA = insertPost(authorId, dishA, markerA, "APPROVED");
        long postB = insertPost(authorId, dishB, "workB" + System.nanoTime(), "APPROVED");
        long loosePost = insertPost(authorId, null, "loose" + System.nanoTime(), "APPROVED");

        JsonNode works = dishWorks(token, dishA, null);
        assertThat(containsPost(works, postA)).as("这道菜自己的帖子没返回").isTrue();
        assertThat(containsPost(works, postB)).as("别的菜的帖子串到这道菜下面了").isFalse();
        assertThat(containsPost(works, loosePost)).as("没关联菜谱的帖子串进「这道菜」了").isFalse();
        assertThat(works).as("按菜取帖一次返回太多（详情页只铺一屏）").hasSizeLessThanOrEqualTo(50);

        // size 越界仍被夹紧，不能靠 ?size=999999 把整张表拖走
        JsonNode clamped = dishWorks(token, dishA, 999999);
        assertThat(clamped.size()).isLessThanOrEqualTo(50);
    }

    @Test
    void pendingWorkIsVisibleToItsAuthorOnly() throws Exception {
        JsonNode author = newGuest();
        long authorId = author.get("user").get("userId").asLong();
        String authorToken = author.get("token").asText();
        String strangerToken = newGuest().get("token").asText();

        long dish = insertPublicRecipe("按菜取帖-待审-" + System.nanoTime());
        long pending = insertPost(authorId, dish, "pending" + System.nanoTime(), "PENDING");

        assertThat(containsPost(dishWorks(authorToken, dish, null), pending))
                .as("自己刚发的帖子（还没过机审）在自己看的菜谱页上不见了").isTrue();
        assertThat(containsPost(dishWorks(strangerToken, dish, null), pending))
                .as("待审帖子泄漏给了陌生人").isFalse();
    }

    @Test
    void privateRecipeStaysHiddenOnTheDishPage() throws Exception {
        JsonNode owner = newGuest();
        long ownerId = owner.get("user").get("userId").asLong();
        long ownerFamily = owner.get("user").get("familyId").asLong();
        String strangerToken = newGuest().get("token").asText();
        String ownerToken = owner.get("token").asText();

        long privateRecipe = insertPrivateRecipe(ownerId, ownerFamily, "按菜取帖-私房-" + System.nanoTime());
        long post = insertPost(ownerId, privateRecipe, "private" + System.nanoTime(), "APPROVED");

        JsonNode strangerView = dishWorks(strangerToken, privateRecipe, null);
        JsonNode strangerPost = null;
        for (JsonNode node : strangerView) {
            if (node.get("id").asLong() == post) {
                strangerPost = node;
            }
        }
        assertThat(strangerPost).as("陌生人按菜谱 id 就查不到这条帖子了吗？").isNotNull();
        assertThat(strangerPost.get("recipe") == null || strangerPost.get("recipe").isNull())
                .as("第四条读路径漏了菜谱可见性：别人家的私房菜卡片跟着帖子发出来了")
                .isTrue();

        // 反向：本家自己看得到这道菜（锁的是"别人家"，不是"这个字段"）
        JsonNode ownerView = dishWorks(ownerToken, privateRecipe, null);
        JsonNode ownerPost = null;
        for (JsonNode node : ownerView) {
            if (node.get("id").asLong() == post) {
                ownerPost = node;
            }
        }
        assertThat(ownerPost).isNotNull();
        assertThat(ownerPost.get("recipe").get("id").asLong()).isEqualTo(privateRecipe);
    }

    @Test
    void missingOrInvalidRecipeIdFallsBackToTheFeed() throws Exception {
        JsonNode author = newGuest();
        long authorId = author.get("user").get("userId").asLong();
        String token = author.get("token").asText();
        long dish = insertPublicRecipe("按菜取帖-回退-" + System.nanoTime());
        long post = insertPost(authorId, dish, "fallback" + System.nanoTime(), "APPROVED");

        // recipeId=0 是"没选菜"的哨兵值，必须回到全站信息流，而不是查成空列表
        MvcResult zero = mockMvc.perform(get("/api/community/posts")
                        .header("X-Auth-Token", token)
                        .param("recipeId", "0")
                        .param("size", "50"))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(containsPost(objectMapper.readTree(zero.getResponse().getContentAsString()), post))
                .as("recipeId=0 被当成一次按菜过滤，信息流变成了空列表").isTrue();
    }
}
