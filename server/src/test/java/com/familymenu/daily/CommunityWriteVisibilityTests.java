package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.service.MysqlKitchenStore;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.server.ResponseStatusException;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 社区**写路径**的可见性闸门：点赞 / 收藏 / 评论 / 举报都得先过「这条帖你看得到吗」。
 *
 * 背景（实测，不是推理）：详情页与信息流都按 audit_status 过滤，但这四个写路径原来只查
 * 「行存在吗」（`SELECT 1 FROM community_post WHERE id = ?`），而点赞 / 收藏的响应会把帖子
 * 原样回显。于是任何人拿 id 就能读到：
 *   · 待审（PENDING）帖的标题与正文 —— id 自增，等于把审核队列整个摊开；
 *   · 已下架（REMOVED）帖的标题与正文 —— 运营下架后他人点赞仍 200 且正文照回，下架等于没下架。
 * 这里把闸门钉在写路径上，并顺带断言"拒绝不能只是回个错"：互动行、评论行、举报行都不许落库。
 *
 * 判据与 communityPostDetail 共用一处（MysqlKitchenStore#POST_VISIBLE_TO_VIEWER）：
 * APPROVED 公开 / PENDING 仅作者本人 / REMOVED 谁都看不到。
 */
@SpringBootTest
@AutoConfigureMockMvc
class CommunityWriteVisibilityTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private MysqlKitchenStore store;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "writevis-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private long createPost(String token, String title) throws Exception {
        MvcResult created = mockMvc.perform(post("/api/community/posts")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "title", title, "content", "可见性写路径自检正文"))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode node = objectMapper.readTree(created.getResponse().getContentAsString());
        assertThat(node.get("auditStatus").asText()).as("游客发帖无法机审，新帖应落待审").isEqualTo("PENDING");
        return node.get("id").asLong();
    }

    private String body(MvcResult result) throws Exception {
        return result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8);
    }

    /** 四种写操作全打一遍，返回各自的 HTTP 状态码。 */
    private int[] hitAllWritePaths(long postId, String token) throws Exception {
        int like = mockMvc.perform(post("/api/community/posts/" + postId + "/like")
                .header("X-Auth-Token", token)).andReturn().getResponse().getStatus();
        int favorite = mockMvc.perform(post("/api/community/posts/" + postId + "/favorite")
                .header("X-Auth-Token", token)).andReturn().getResponse().getStatus();
        int comment = mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                        .header("X-Auth-Token", token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"看不见的帖子不该能被评论\"}"))
                .andReturn().getResponse().getStatus();
        int report = mockMvc.perform(post("/api/community/posts/" + postId + "/report")
                        .header("X-Auth-Token", token).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"reason\":\"内容不实\"}"))
                .andReturn().getResponse().getStatus();
        return new int[]{like, favorite, comment, report};
    }

    private void assertNothingLanded(long postId) {
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM community_post_like WHERE post_id = ?", Integer.class, postId))
                .as("被拒的点赞不许落库").isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM community_post_favorite WHERE post_id = ?", Integer.class, postId))
                .as("被拒的收藏不许落库").isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM community_post_comment WHERE post_id = ?", Integer.class, postId))
                .as("被拒的评论不许落库").isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM community_post_report WHERE post_id = ?", Integer.class, postId))
                .as("被拒的举报不许落库").isZero();
        assertThat(jdbcTemplate.queryForObject(
                "SELECT like_count FROM community_post WHERE id = ?", Integer.class, postId))
                .as("点赞计数也不该被改动").isZero();
    }

    /** 待审帖：他人四个写路径都应 404 且不落库；作者本人照旧能用自己待审的帖。 */
    @Test
    void othersCannotTouchAPendingPost() throws Exception {
        String author = guestLogin();
        String other = guestLogin();
        long postId = createPost(author, "待审帖可见性 " + System.nanoTime());

        MvcResult likeAttempt = mockMvc.perform(post("/api/community/posts/" + postId + "/like")
                        .header("X-Auth-Token", other))
                .andExpect(status().isNotFound())
                .andReturn();
        assertThat(body(likeAttempt)).as("拒绝文案不能带回帖子内容").doesNotContain("待审帖可见性");

        assertThat(hitAllWritePaths(postId, other)).as("他人四个写路径都该 404").containsOnly(404);
        assertNothingLanded(postId);

        // 作者本人：待审对自己可见（信息流/详情都是这个语义），点赞与评论照旧 200
        mockMvc.perform(post("/api/community/posts/" + postId + "/like").header("X-Auth-Token", author))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                        .header("X-Auth-Token", author).contentType(MediaType.APPLICATION_JSON)
                        .content("{\"content\":\"作者自评\"}"))
                .andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM community_post_like WHERE post_id = ?", Integer.class, postId))
                .as("作者本人的点赞照旧落库").isEqualTo(1);
    }

    /** 已下架帖：谁都碰不到（含作者本人），详情与四个写路径一致地 404。 */
    @Test
    void removedPostIsUntouchableForEveryoneIncludingItsAuthor() throws Exception {
        String author = guestLogin();
        String other = guestLogin();
        long postId = createPost(author, "下架帖可见性 " + System.nanoTime());

        // 作者删自己的帖 → 与运营下架同走 REMOVED
        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .delete("/api/community/posts/" + postId).header("X-Auth-Token", author))
                .andExpect(status().isOk());
        assertThat(jdbcTemplate.queryForObject(
                "SELECT audit_status FROM community_post WHERE id = ?", String.class, postId))
                .isEqualTo("REMOVED");

        mockMvc.perform(get("/api/community/posts/" + postId).header("X-Auth-Token", other))
                .andExpect(status().isNotFound());
        assertThat(hitAllWritePaths(postId, other)).as("下架帖对他人四个写路径都该 404").containsOnly(404);
        assertThat(hitAllWritePaths(postId, author)).as("下架帖对作者本人也一视同仁").containsOnly(404);
        assertNothingLanded(postId);
    }

    /**
     * 信息流分页的边界值不该把 SQL 打成 1064。
     * 原实现 `int offset = (page-1)*size; int fetch = offset + size;` 在 page=42949673, size=50 时
     * 溢出成负数 → `LIMIT -50` → BadSqlGrammarException → 500（实测；page=42949672 还正常）。
     */
    @Test
    void hugePageNumberDoesNotBreakTheFeed() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/community/posts?page=42949673&size=50").header("X-Auth-Token", token))
                .andExpect(status().isOk());
        mockMvc.perform(get("/api/community/posts?page=2147483647&size=50").header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    /**
     * 详情读路径：作者本人看自己的待审帖是 200 且带正文（与信息流同一语义），
     * 他人与匿名一律 404 且不回显正文。
     * 这条是把 2026-09-23 交接单 #1 的期望钉住：小程序端「发帖 → 审核中 → 点进详情」是提审时
     * 审核员最容易走的动线，断在这里等于 UGC 闭环没合上。
     */
    @Test
    void authorCanReadOwnPendingPostDetail() throws Exception {
        String author = guestLogin();
        String other = guestLogin();
        String title = "待审详情 " + System.nanoTime();
        long postId = createPost(author, title);

        MvcResult asAuthor = mockMvc.perform(get("/api/community/posts/" + postId).header("X-Auth-Token", author))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode node = objectMapper.readTree(body(asAuthor));
        assertThat(node.get("id").asLong()).isEqualTo(postId);
        assertThat(node.get("auditStatus").asText()).as("作者看到的仍是待审态，前端据此打角标").isEqualTo("PENDING");
        assertThat(node.get("mine").asBoolean()).as("作者本人").isTrue();
        assertThat(body(asAuthor)).as("作者本人拿得到正文").contains("可见性写路径自检正文");

        MvcResult asOther = mockMvc.perform(get("/api/community/posts/" + postId).header("X-Auth-Token", other))
                .andExpect(status().isNotFound())
                .andReturn();
        assertThat(body(asOther)).as("他人的 404 不回显标题").doesNotContain(title);

        mockMvc.perform(get("/api/community/posts/" + postId))
                .andExpect(status().isNotFound());
    }

    /**
     * 「可见性闸门放行、取行却落空」时不许回 200 空 body。
     *
     * communityPostDetail 的判据取自 communityPostInfo（不连 user_account），取行走
     * loadCommunityPostById（内连 user_account），而 community_post.author_user_id 没有外键
     * （schema.sql 只建了 idx_post_author）。两个判据打架时原实现 `return null` → Spring 序列化成
     * 200 + 空 body：客户端拿不到错误文案，只能把空响应当「帖子不存在或已删除」渲染
     * （miniapp 侧 loadErrorDesc 为空时才显示这句 + 「重新加载」按钮，实测截图
     * artifacts/launch-2026-09-23/miniapp/74b-post-detail-report.png 正是这一支）。
     * 这里人为造出「作者账号行缺失」的可达状态，断言它落成带文案的 404 而不是空 200。
     */
    @Test
    void visiblePostWithoutItsAuthorRowIsNotFoundNotEmptyTwoHundred() throws Exception {
        String author = guestLogin();
        long postId = createPost(author, "作者行缺失 " + System.nanoTime());

        long danglingAuthorId = 990_000_000L + (System.nanoTime() % 10_000);
        jdbcTemplate.update("UPDATE community_post SET author_user_id = ? WHERE id = ?", danglingAuthorId, postId);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM user_account WHERE id = ?", Integer.class, danglingAuthorId))
                .as("前提：这个作者 id 确实没有账号行").isZero();

        assertThatThrownBy(() -> store.communityPostDetail(postId, danglingAuthorId, 0L))
                .as("读不出行就是不可见，必须 404 且带文案")
                .isInstanceOf(ResponseStatusException.class)
                .hasMessageContaining("community post not found");
    }
}
