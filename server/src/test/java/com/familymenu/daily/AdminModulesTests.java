package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 运营管理台各业务模块的端到端测试：看板、反馈工单、帖子治理、订单、审计。
 * 所有端点必须先通过管理员鉴权。
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminModulesTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "admin-mod-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private long userIdOf(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token)).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("userId").asLong();
    }

    /** 建一个临时管理员，返回 token；调用方负责在 finally 里清 is_admin。 */
    private String adminToken(long[] outUserId) throws Exception {
        String token = guestLogin();
        long id = userIdOf(token);
        jdbcTemplate.update("UPDATE user_account SET is_admin = 1 WHERE id = ?", id);
        if (outUserId != null && outUserId.length > 0) outUserId[0] = id;
        return token;
    }

    private void demote(long userId) {
        jdbcTemplate.update("UPDATE user_account SET is_admin = 0 WHERE id = ?", userId);
    }

    // ---------- 越权：所有模块端点都必须 403 ----------

    @Test
    void allAdminEndpointsRejectPlainUser() throws Exception {
        String token = guestLogin();
        String[] paths = {
                "/api/admin/dashboard", "/api/admin/feedback", "/api/admin/posts",
                "/api/admin/orders", "/api/admin/audit", "/api/admin/users", "/api/admin/imports",
                "/api/admin/recipes", "/api/admin/comments"
        };
        for (String path : paths) {
            mockMvc.perform(get(path).header("X-Auth-Token", token))
                    .andExpect(status().isForbidden());
        }
        // 写端点
        mockMvc.perform(post("/api/admin/posts/1/status").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REMOVED\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(post("/api/admin/recipes/1/status").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REMOVED\"}"))
                .andExpect(status().isForbidden());
        mockMvc.perform(delete("/api/admin/comments/1").header("X-Auth-Token", token))
                .andExpect(status().isForbidden());
    }

    // ---------- 看板 ----------

    @Test
    void dashboardReturnsCounters() throws Exception {
        long[] id = new long[1];
        String token = adminToken(id);
        try {
            mockMvc.perform(get("/api/admin/dashboard").header("X-Auth-Token", token))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.userCount").isNumber())
                    .andExpect(jsonPath("$.familyCount").isNumber())
                    .andExpect(jsonPath("$.recipeCount").isNumber())
                    .andExpect(jsonPath("$.pendingReportCount").isNumber());
        } finally {
            demote(id[0]);
        }
    }

    // ---------- 反馈工单 ----------

    @Test
    void feedbackSubmitThenAdminListAndHandle() throws Exception {
        // 用户提交反馈
        String userToken = guestLogin();
        mockMvc.perform(post("/api/feedback").header("X-Auth-Token", userToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"types\":[\"bug\"],\"content\":\"管理台测试工单\",\"contact\":\"\",\"images\":[]}"))
                .andExpect(status().isOk());

        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            MvcResult list = mockMvc.perform(get("/api/admin/feedback?status=OPEN").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").isNumber())
                    .andReturn();
            // 分页信封：{ items, total, page, size }
            JsonNode page = objectMapper.readTree(list.getResponse().getContentAsString());
            JsonNode arr = page.get("items");
            assertThat(arr.isArray()).isTrue();
            assertThat(arr.size()).isGreaterThan(0);
            assertThat(page.get("total").asLong()).isGreaterThanOrEqualTo(arr.size());

            long feedbackId = arr.get(0).get("id").asLong();
            mockMvc.perform(post("/api/admin/feedback/" + feedbackId + "/handle")
                            .header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"CLOSED\",\"reply\":\"已处理\"}"))
                    .andExpect(status().isOk());

            String status = jdbcTemplate.queryForObject(
                    "SELECT status FROM feedback_ticket WHERE id = ?", String.class, feedbackId);
            assertThat(status).isEqualTo("CLOSED");
        } finally {
            demote(id[0]);
        }
    }

    @Test
    void feedbackHandleRejectsInvalidStatus() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            mockMvc.perform(post("/api/admin/feedback/1/handle").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"BOGUS\"}"))
                    .andExpect(status().isBadRequest());
        } finally {
            demote(id[0]);
        }
    }

    // ---------- 帖子 / 菜谱治理 ----------

    @Test
    void adminCanRemoveAndRestorePost() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        // 用一条存在的帖子
        Long postId = jdbcTemplate.queryForObject(
                "SELECT id FROM community_post ORDER BY id LIMIT 1", Long.class);
        try {
            mockMvc.perform(post("/api/admin/posts/" + postId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REMOVED\"}"))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT audit_status FROM community_post WHERE id = ?", String.class, postId))
                    .isEqualTo("REMOVED");

            mockMvc.perform(post("/api/admin/posts/" + postId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPROVED\"}"))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT audit_status FROM community_post WHERE id = ?", String.class, postId))
                    .isEqualTo("APPROVED");
        } finally {
            jdbcTemplate.update("UPDATE community_post SET audit_status = 'APPROVED' WHERE id = ?", postId);
            demote(id[0]);
        }
    }

    @Test
    void removedPostIsHiddenFromPublicFeed() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        Long postId = jdbcTemplate.queryForObject(
                "SELECT id FROM community_post ORDER BY id LIMIT 1", Long.class);
        try {
            mockMvc.perform(post("/api/admin/posts/" + postId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REMOVED\"}"))
                    .andExpect(status().isOk());

            // 公开列表不应再包含该帖（解析后按 id 判断，避免字符串匹配的脆弱性）
            MvcResult feed = mockMvc.perform(get("/api/community/posts")).andExpect(status().isOk()).andReturn();
            JsonNode posts = objectMapper.readTree(feed.getResponse().getContentAsString());
            boolean present = false;
            for (JsonNode p : posts) {
                if (p.has("id") && p.get("id").asLong() == postId) {
                    present = true;
                    break;
                }
            }
            assertThat(present).as("已下架帖子不应出现在公开列表").isFalse();
        } finally {
            jdbcTemplate.update("UPDATE community_post SET audit_status = 'APPROVED' WHERE id = ?", postId);
            demote(id[0]);
        }
    }

    @Test
    void adminCanSoftDeleteComment() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            // 造一条评论
            Long postId = jdbcTemplate.queryForObject(
                    "SELECT id FROM community_post ORDER BY id LIMIT 1", Long.class);
            String userToken = guestLogin();
            MvcResult added = mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                            .header("X-Auth-Token", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"管理台下架测试评论\"}"))
                    .andExpect(status().isOk()).andReturn();
            long commentId = objectMapper.readTree(added.getResponse().getContentAsString()).get("commentId").asLong();

            mockMvc.perform(delete("/api/admin/comments/" + commentId).header("X-Auth-Token", admin))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT deleted FROM community_post_comment WHERE id = ?", Integer.class, commentId))
                    .isEqualTo(1);

            // 公开评论列表不应再包含它
            MvcResult comments = mockMvc.perform(get("/api/community/posts/" + postId + "/comments"))
                    .andExpect(status().isOk()).andReturn();
            assertThat(comments.getResponse().getContentAsString()).doesNotContain("管理台下架测试评论");
        } finally {
            demote(id[0]);
        }
    }

    /**
     * 评论审核闭环：游客（无真实微信 openid，无法机审）发的评论必须先进待审队列，
     * 只有管理员通过后才对其他人可见；驳回后再次不可见。
     */
    @Test
    void pendingCommentIsInvisibleUntilAdminApproves() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        Long postId = jdbcTemplate.queryForObject(
                "SELECT id FROM community_post ORDER BY id LIMIT 1", Long.class);
        String author = guestLogin();
        String other = guestLogin();
        String content = "待审评论-" + System.nanoTime();
        long commentId = 0;
        try {
            MvcResult added = mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                            .header("X-Auth-Token", author)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"" + content + "\"}"))
                    .andExpect(status().isOk()).andReturn();
            commentId = objectMapper.readTree(added.getResponse().getContentAsString()).get("commentId").asLong();

            assertThat(jdbcTemplate.queryForObject(
                    "SELECT audit_status FROM community_post_comment WHERE id = ?", String.class, commentId))
                    .as("游客评论应进待审队列").isEqualTo("PENDING");

            // 用 commentId 断言（避免中文字符串在 MockHttpServletResponse 里的编码干扰）
            String idToken = "\"commentId\":" + commentId;

            assertThat(mockMvc.perform(get("/api/community/posts/" + postId + "/comments")
                            .header("X-Auth-Token", other))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                    .as("待审评论对其他人不可见").doesNotContain(idToken);

            assertThat(mockMvc.perform(get("/api/admin/comments?auditStatus=PENDING")
                            .header("X-Auth-Token", admin))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                    .as("管理台待审列表应包含它").contains(idToken);

            mockMvc.perform(post("/api/admin/comments/" + commentId + "/status")
                            .header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"APPROVED\"}"))
                    .andExpect(status().isOk());
            assertThat(mockMvc.perform(get("/api/community/posts/" + postId + "/comments")
                            .header("X-Auth-Token", other))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                    .as("通过后对其他人可见").contains(idToken);

            mockMvc.perform(post("/api/admin/comments/" + commentId + "/status")
                            .header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"status\":\"REMOVED\"}"))
                    .andExpect(status().isOk());
            assertThat(mockMvc.perform(get("/api/community/posts/" + postId + "/comments")
                            .header("X-Auth-Token", other))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString())
                    .as("驳回后再次不可见").doesNotContain(idToken);
        } finally {
            if (commentId > 0) {
                jdbcTemplate.update("DELETE FROM community_post_comment WHERE id = ?", commentId);
            }
            demote(id[0]);
        }
    }

    /** 看板必须暴露待审帖子/待审评论数，否则管理员无从知道有内容卡在队列里。 */
    @Test
    void dashboardExposesPendingModerationCounts() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            mockMvc.perform(get("/api/admin/dashboard").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.pendingPostCount").isNumber())
                    .andExpect(jsonPath("$.pendingCommentCount").isNumber())
                    .andExpect(jsonPath("$.pendingImportCount").isNumber())
                    .andExpect(jsonPath("$.paidRevenueFen").isNumber());
        } finally {
            demote(id[0]);
        }
    }

    /** 订单列表支持按金额排序，且排序方向真实生效。 */
    @Test
    void ordersCanBeSortedByAmount() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            JsonNode desc = objectMapper.readTree(mockMvc.perform(
                            get("/api/admin/orders?sort=amount&order=desc&size=10").header("X-Auth-Token", admin))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("items");
            JsonNode asc = objectMapper.readTree(mockMvc.perform(
                            get("/api/admin/orders?sort=amount&order=asc&size=10").header("X-Auth-Token", admin))
                    .andExpect(status().isOk()).andReturn().getResponse().getContentAsString()).get("items");

            for (int i = 1; i < desc.size(); i++) {
                assertThat(desc.get(i).get("amountFen").asLong())
                        .as("降序：后一条不应大于前一条")
                        .isLessThanOrEqualTo(desc.get(i - 1).get("amountFen").asLong());
            }
            for (int i = 1; i < asc.size(); i++) {
                assertThat(asc.get(i).get("amountFen").asLong())
                        .as("升序：后一条不应小于前一条")
                        .isGreaterThanOrEqualTo(asc.get(i - 1).get("amountFen").asLong());
            }
            // 非法排序列必须被忽略而不是报 500（白名单兜底）
            mockMvc.perform(get("/api/admin/orders?sort=amount_fen;DROP+TABLE+x&order=desc")
                            .header("X-Auth-Token", admin))
                    .andExpect(status().isOk());
        } finally {
            demote(id[0]);
        }
    }

    /** 订单支持按日期区间筛选：未来区间应为 0 条，非法日期应 400。 */
    @Test
    void ordersSupportDateRangeFilter() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            mockMvc.perform(get("/api/admin/orders?from=2099-01-01&to=2099-12-31").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").value(0));
            mockMvc.perform(get("/api/admin/orders?from=2000-01-01&to=2099-12-31").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.total").isNumber());
            mockMvc.perform(get("/api/admin/orders?from=not-a-date").header("X-Auth-Token", admin))
                    .andExpect(status().isBadRequest());
        } finally {
            demote(id[0]);
        }
    }

    /** 批量审核评论：一次通过多条，全部生效。 */
    @Test
    void adminCanBatchApproveComments() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        Long postId = jdbcTemplate.queryForObject(
                "SELECT id FROM community_post ORDER BY id LIMIT 1", Long.class);
        String author = guestLogin();
        List<Long> created = new java.util.ArrayList<>();
        try {
            for (int i = 0; i < 2; i++) {
                MvcResult added = mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                                .header("X-Auth-Token", author)
                                .contentType(MediaType.APPLICATION_JSON)
                                .content("{\"content\":\"批量审核测试-" + i + "\"}"))
                        .andExpect(status().isOk()).andReturn();
                created.add(objectMapper.readTree(added.getResponse().getContentAsString()).get("commentId").asLong());
            }
            String body = "{\"ids\":[" + created.get(0) + "," + created.get(1) + "],\"status\":\"APPROVED\"}";
            mockMvc.perform(post("/api/admin/comments/batch-status")
                            .header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.changed").value(2));

            Integer approved = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM community_post_comment WHERE id IN (?, ?) AND audit_status = 'APPROVED'",
                    Integer.class, created.get(0), created.get(1));
            assertThat(approved).as("两条都应变成已通过").isEqualTo(2);

            // 普通用户不能调用
            mockMvc.perform(post("/api/admin/comments/batch-status")
                            .header("X-Auth-Token", guestLogin())
                            .contentType(MediaType.APPLICATION_JSON).content(body))
                    .andExpect(status().isForbidden());
        } finally {
            for (Long cid : created) {
                jdbcTemplate.update("DELETE FROM community_post_comment WHERE id = ?", cid);
            }
            demote(id[0]);
        }
    }

    /** 趋势接口：日期必须连续升序（前端 X 轴直接按它画），非管理员不可访问。 */
    @Test
    void metricsEndpointReturnsContinuousDailySeries() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            MvcResult result = mockMvc.perform(get("/api/admin/metrics?days=14").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.days").value(14))
                    .andExpect(jsonPath("$.series.length()").value(14))
                    .andReturn();
            JsonNode series = objectMapper.readTree(result.getResponse().getContentAsString()).get("series");
            for (int i = 0; i < series.size(); i++) {
                String date = series.get(i).get("date").asText();
                assertThat(date).matches("\\d{4}-\\d{2}-\\d{2}");
                if (i > 0) {
                    assertThat(date).as("日期必须严格升序").isGreaterThan(series.get(i - 1).get("date").asText());
                }
                assertThat(series.get(i).get("revenueFen").asLong()).isGreaterThanOrEqualTo(0L);
            }

            mockMvc.perform(get("/api/admin/metrics").header("X-Auth-Token", guestLogin()))
                    .andExpect(status().isForbidden());
        } finally {
            demote(id[0]);
        }
    }

    @Test
    void adminCanRemoveAndRestoreRecipe() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        Long recipeId = jdbcTemplate.queryForObject(
                "SELECT id FROM recipe WHERE status = 'ACTIVE' ORDER BY id LIMIT 1", Long.class);
        try {
            mockMvc.perform(post("/api/admin/recipes/" + recipeId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REMOVED\"}"))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT status FROM recipe WHERE id = ?", String.class, recipeId)).isEqualTo("REMOVED");
        } finally {
            jdbcTemplate.update("UPDATE recipe SET status = 'ACTIVE' WHERE id = ?", recipeId);
            demote(id[0]);
        }
    }

    @Test
    void adminCanListRecipesAndFilterByStatus() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            MvcResult list = mockMvc.perform(get("/api/admin/recipes?status=ACTIVE").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$[0].recipeId").exists())
                    .andExpect(jsonPath("$[0].title").exists())
                    .andExpect(jsonPath("$[0].status").value("ACTIVE"))
                    .andReturn();
            JsonNode items = objectMapper.readTree(
                    list.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            assertThat(items.size()).isGreaterThan(0);
            // keyword 过滤：取第一个标题的前两个字做搜索（queryParam 直传），断言命中且标题包含关键词
            String titlePrefix = items.get(0).get("title").asText();
            if (titlePrefix.length() > 2) {
                MvcResult searched = mockMvc.perform(get("/api/admin/recipes")
                                .queryParam("keyword", titlePrefix.substring(0, 2))
                                .header("X-Auth-Token", admin))
                        .andExpect(status().isOk())
                        .andReturn();
                JsonNode hits = objectMapper.readTree(
                        searched.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
                assertThat(hits.size()).isGreaterThan(0);
                assertThat(hits.get(0).get("title").asText()).contains(titlePrefix.substring(0, 2));
            }
        } finally {
            demote(id[0]);
        }
    }

    @Test
    void adminCanListAndRestoreComments() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            Long postId = postId();
            String userToken = guestLogin();
            MvcResult added = mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                            .header("X-Auth-Token", userToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"content\":\"管理台评论列表测试\"}"))
                    .andExpect(status().isOk()).andReturn();
            long commentId = objectMapper.readTree(added.getResponse().getContentAsString()).get("commentId").asLong();

            // 列表（按帖子过滤）能看到新评论，deleted=false
            MvcResult listed = mockMvc.perform(get("/api/admin/comments?postId=" + postId)
                            .header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items[0].commentId").exists())
                    .andExpect(jsonPath("$.items[0].postTitle").exists())
                    .andReturn();
            JsonNode rows = objectMapper.readTree(listed.getResponse().getContentAsString()).get("items");
            boolean found = false;
            for (JsonNode row : rows) {
                if (row.get("commentId").asLong() == commentId) {
                    assertThat(row.get("deleted").asBoolean()).isFalse();
                    found = true;
                }
            }
            assertThat(found).isTrue();

            // 软删除后列表里 deleted=true，恢复后回到 false
            mockMvc.perform(delete("/api/admin/comments/" + commentId).header("X-Auth-Token", admin))
                    .andExpect(status().isOk());
            mockMvc.perform(post("/api/admin/comments/" + commentId + "/restore").header("X-Auth-Token", admin))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT deleted FROM community_post_comment WHERE id = ?", Integer.class, commentId))
                    .isEqualTo(0);
        } finally {
            demote(id[0]);
        }
    }

    // ---------- 订单 / 会员 / 审计 ----------

    @Test
    void adminCanListOrders() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        // 自己造 4 条订单，不依赖环境里恰好有多少数据：
        // data.sql 只种 1 条，全新库（CI）里如果指望"别人留下的订单"，
        // 测试顺序一变就会假失败。
        List<String> tradeNos = new java.util.ArrayList<>();
        try {
            for (int i = 0; i < 4; i++) {
                String tradeNo = "ADMIN-LIST-" + System.nanoTime() + "-" + i;
                tradeNos.add(tradeNo);
                jdbcTemplate.update("""
                                INSERT INTO payment_order(out_trade_no, payer_user_id, plan_code, amount_fen,
                                                          duration_days, status, payment_method)
                                VALUES (?, 1, 'annual', ?, 365, 'PAID', 'MOCK')
                                """, tradeNo, 9900 + i);
            }
            MvcResult first = mockMvc.perform(get("/api/admin/orders?page=0&size=3").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items.length()").value(3))
                    .andExpect(jsonPath("$.total").isNumber())
                    .andExpect(jsonPath("$.page").value(0))
                    .andExpect(jsonPath("$.size").value(3))
                    .andReturn();
            JsonNode p0 = objectMapper.readTree(first.getResponse().getContentAsString());
            assertThat(p0.get("total").asLong()).isGreaterThanOrEqualTo(4);

            // 第二页必须是不同的一批，否则分页是假的
            MvcResult second = mockMvc.perform(get("/api/admin/orders?page=1&size=3").header("X-Auth-Token", admin))
                    .andExpect(status().isOk()).andReturn();
            JsonNode p1 = objectMapper.readTree(second.getResponse().getContentAsString());
            if (p1.get("items").size() > 0) {
                assertThat(p1.get("items").get(0).get("orderId").asLong())
                        .as("第二页首条不能与第一页首条相同")
                        .isNotEqualTo(p0.get("items").get(0).get("orderId").asLong());
            }
            assertThat(p1.get("total").asLong()).isEqualTo(p0.get("total").asLong());
        } finally {
            for (String tradeNo : tradeNos) {
                jdbcTemplate.update("DELETE FROM payment_order WHERE out_trade_no = ?", tradeNo);
            }
            demote(id[0]);
        }
    }

    @Test
    void writeActionIsAudited() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        try {
            Long postId = jdbcTemplate.queryForObject(
                    "SELECT id FROM community_post ORDER BY id LIMIT 1", Long.class);
            mockMvc.perform(post("/api/admin/posts/" + postId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPROVED\"}"))
                    .andExpect(status().isOk());

            MvcResult audit = mockMvc.perform(get("/api/admin/audit").header("X-Auth-Token", admin))
                    .andExpect(status().isOk()).andReturn();
            JsonNode page = objectMapper.readTree(audit.getResponse().getContentAsString());
            JsonNode arr = page.get("items");
            assertThat(arr.isArray()).isTrue();
            assertThat(page.get("total").asLong()).isGreaterThan(0);
            boolean found = false;
            for (JsonNode n : arr) {
                if ("SET_POST_STATUS".equals(n.get("action").asText())
                        && n.get("actorUserId").asLong() == id[0]) {
                    found = true;
                    break;
                }
            }
            assertThat(found).as("审计日志应记录本次帖子状态变更").isTrue();
        } finally {
            jdbcTemplate.update("UPDATE community_post SET audit_status = 'APPROVED' WHERE id = ?", postId());
            demote(id[0]);
        }
    }

    // ---------- 导入源审核 / 封禁 / 关单退款 ----------

    @Test
    void importAuditApproveAndReject() throws Exception {
        long[] id = new long[1];
        String admin = adminToken(id);
        jdbcTemplate.update("""
                        INSERT INTO import_source(source_type, source_url, source_text, parse_status, audit_status)
                        VALUES ('text', NULL, '模块测试导入源', 'PARSED', 'PENDING')
                        """);
        long importId = jdbcTemplate.queryForObject(
                "SELECT id FROM import_source WHERE source_text = '模块测试导入源' ORDER BY id DESC LIMIT 1", Long.class);
        try {
            mockMvc.perform(get("/api/admin/imports?auditStatus=PENDING").header("X-Auth-Token", admin))
                    .andExpect(status().isOk());

            mockMvc.perform(post("/api/admin/imports/" + importId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPROVED\"}"))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT audit_status FROM import_source WHERE id = ?", String.class, importId))
                    .isEqualTo("APPROVED");
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT reviewer_user_id FROM import_source WHERE id = ?", Long.class, importId))
                    .isEqualTo(id[0]);

            mockMvc.perform(post("/api/admin/imports/" + importId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"REJECTED\",\"note\":\"内容不合规\"}"))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT audit_status FROM import_source WHERE id = ?", String.class, importId))
                    .isEqualTo("REJECTED");

            // 非法状态
            mockMvc.perform(post("/api/admin/imports/" + importId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"BOGUS\"}"))
                    .andExpect(status().isBadRequest());
        } finally {
            jdbcTemplate.update("DELETE FROM import_source WHERE id = ?", importId);
            demote(id[0]);
        }
    }

    @Test
    void banUserRevokesSessionsImmediately() throws Exception {
        long[] adminId = new long[1];
        String admin = adminToken(adminId);
        String userToken = guestLogin();
        long userId = userIdOf(userToken);
        try {
            // 封禁后会话立即失效
            mockMvc.perform(post("/api/admin/users/" + userId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"BANNED\"}"))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT status FROM user_account WHERE id = ?", String.class, userId))
                    .isEqualTo("BANNED");
            mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", userToken))
                    .andExpect(status().isUnauthorized());

            // 管理员账号不可封禁（409）：建第二个管理员来验证
            String admin2Token = guestLogin();
            long admin2Id = userIdOf(admin2Token);
            jdbcTemplate.update("UPDATE user_account SET is_admin = 1 WHERE id = ?", admin2Id);
            try {
                mockMvc.perform(post("/api/admin/users/" + admin2Id + "/status").header("X-Auth-Token", admin)
                                .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"BANNED\"}"))
                        .andExpect(status().isConflict());
            } finally {
                jdbcTemplate.update("UPDATE user_account SET is_admin = 0 WHERE id = ?", admin2Id);
                jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", admin2Id);
                jdbcTemplate.update("DELETE FROM user_account WHERE id = ?", admin2Id);
            }

            // 解封
            mockMvc.perform(post("/api/admin/users/" + userId + "/status").header("X-Auth-Token", admin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"ACTIVE\"}"))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT status FROM user_account WHERE id = ?", String.class, userId))
                    .isEqualTo("ACTIVE");
        } finally {
            jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", userId);
            jdbcTemplate.update("DELETE FROM user_account WHERE id = ?", userId);
            demote(adminId[0]);
        }
    }

    @Test
    void orderCloseAndRefundTransitions() throws Exception {
        long[] adminId = new long[1];
        String admin = adminToken(adminId);
        String userToken = guestLogin();
        long userId = userIdOf(userToken);
        String tradeNo = "ADMIN-TEST-" + System.nanoTime();
        try {
            // PENDING → 关单
            jdbcTemplate.update("""
                            INSERT INTO payment_order(out_trade_no, payer_user_id, plan_code, amount_fen, duration_days,
                                                      status, payment_method)
                            VALUES (?, ?, 'annual', 12800, 365, 'PENDING', 'WECHAT')
                            """, tradeNo, userId);
            mockMvc.perform(post("/api/admin/orders/" + tradeNo + "/close").header("X-Auth-Token", admin))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT status FROM payment_order WHERE out_trade_no = ?", String.class, tradeNo))
                    .isEqualTo("CLOSED");
            // CLOSED 不可再退款
            mockMvc.perform(post("/api/admin/orders/" + tradeNo + "/refund").header("X-Auth-Token", admin))
                    .andExpect(status().isConflict());

            // PAID → 退款，会员有效期应被扣减
            jdbcTemplate.update("UPDATE payment_order SET status = 'PAID' WHERE out_trade_no = ?", tradeNo);
            jdbcTemplate.update("""
                            INSERT INTO user_membership(payer_user_id, current_plan, expires_at, share_scope)
                            VALUES (?, 'annual', DATE_ADD(NOW(), INTERVAL 365 DAY), 'SELF')
                            ON DUPLICATE KEY UPDATE expires_at = DATE_ADD(NOW(), INTERVAL 365 DAY)
                            """, userId);
            java.sql.Timestamp before = jdbcTemplate.queryForObject(
                    "SELECT expires_at FROM user_membership WHERE payer_user_id = ?", java.sql.Timestamp.class, userId);
            mockMvc.perform(post("/api/admin/orders/" + tradeNo + "/refund").header("X-Auth-Token", admin))
                    .andExpect(status().isOk());
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT status FROM payment_order WHERE out_trade_no = ?", String.class, tradeNo))
                    .isEqualTo("REFUNDED");
            java.sql.Timestamp after = jdbcTemplate.queryForObject(
                    "SELECT expires_at FROM user_membership WHERE payer_user_id = ?", java.sql.Timestamp.class, userId);
            assertThat(after.before(before)).as("退款后会员有效期应缩短").isTrue();
        } finally {
            jdbcTemplate.update("DELETE FROM payment_order WHERE out_trade_no = ?", tradeNo);
            jdbcTemplate.update("DELETE FROM user_membership WHERE payer_user_id = ?", userId);
            jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", userId);
            jdbcTemplate.update("DELETE FROM user_account WHERE id = ?", userId);
            demote(adminId[0]);
        }
    }

    private Long postId() {
        return jdbcTemplate.queryForObject("SELECT id FROM community_post ORDER BY id LIMIT 1", Long.class);
    }
}
