package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;
import org.springframework.test.web.servlet.MvcResult;

import java.io.BufferedReader;
import java.io.InputStreamReader;
import java.nio.charset.StandardCharsets;
import java.util.List;
import java.util.stream.Collectors;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 上线加固项的回归测试：社区信息流分页、无家庭会话的显式 400、
 * 导入审核队列索引、生产配置不留凭据默认值。
 * 这些行为此前分别表现为"一次拉全表"、"500 + 前端只显示加载失败"、
 * "后台待审列表全表扫"、"漏注入环境变量时静默连到别处"。
 */
@SpringBootTest
@AutoConfigureMockMvc
class LaunchHardeningTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 新游客账号：一次请求同时拿到 token 与 userId（user_session 没有自增 id 可排序）。 */
    private JsonNode newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "hardening-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void communityFeedPaginatesAndClampsPageSize() throws Exception {
        int total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM community_post WHERE audit_status = 'APPROVED'", Integer.class);

        MvcResult first = mockMvc.perform(get("/api/community/posts").param("size", "1"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode page1 = objectMapper.readTree(first.getResponse().getContentAsString());
        assertThat(page1.isArray()).isTrue();
        assertThat(page1).hasSizeLessThanOrEqualTo(1);

        MvcResult huge = mockMvc.perform(get("/api/community/posts").param("size", "999999"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode clamped = objectMapper.readTree(huge.getResponse().getContentAsString());
        // 夹紧到 50：帖子量远小于 50 时返回全量，重点是绝不能把 size 当免上限开关
        assertThat(clamped.size()).isLessThanOrEqualTo(Math.max(total, 0));
        assertThat(clamped.size()).isLessThanOrEqualTo(50);

        // 页与页之间不重不漏：第 1 页的 id 不该出现在第 2 页
        MvcResult second = mockMvc.perform(get("/api/community/posts")
                        .param("page", "2").param("size", "1"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode page2 = objectMapper.readTree(second.getResponse().getContentAsString());
        if (!page1.isEmpty() && !page2.isEmpty()) {
            assertThat(page1.get(0).get("id").asLong()).isNotEqualTo(page2.get(0).get("id").asLong());
        }

        mockMvc.perform(get("/api/community/posts").param("page", "9999").param("size", "10"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
    }

    /**
     * 账号不属于任何家庭时，家庭维度的读写端点必须是 4xx，绝不能是 500。
     *
     * 实测语义：AuthInterceptor 会先判会话无效并返回 401（家庭归属在 family_member，
     * 不在 user_account），控制器里的 requireFamily 只是纵深防御的第二层。
     * 断言只锁"不出 5xx + 带可读 error 文案"，不锁具体状态码，避免把实现细节当契约。
     */
    @Test
    void familylessAccountNeverGets500OnFamilyScopedEndpoints() throws Exception {
        JsonNode guest = newGuest();
        long userId = guest.get("user").get("userId").asLong();
        String token = guest.get("token").asText();
        jdbcTemplate.update("DELETE FROM family_member WHERE user_id = ?", userId);
        assertThat(jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM family_member WHERE user_id = ?", Integer.class, userId)).isZero();

        expectClientError("GET /api/wishes", get("/api/wishes"), token);
        expectClientError("GET /api/pantry", get("/api/pantry"), token);
        expectClientError("GET /api/pantry/match", get("/api/pantry/match"), token);
        expectClientError("POST /api/wishes", post("/api/wishes")
                .contentType("application/json")
                .content("{\"recipeId\":1,\"slot\":\"dinner\"}"), token);
    }

    private void expectClientError(String what, MockHttpServletRequestBuilder req, String token) throws Exception {
        mockMvc.perform(req.header("X-Auth-Token", token))
                .andExpect(result -> {
                    int code = result.getResponse().getStatus();
                    assertThat(code)
                            .as(what + " 对无家庭账号应返回 4xx（实际 " + code + "），绝不能是 500")
                            .isBetween(400, 499);
                    assertThat(result.getResponse().getContentAsString())
                            .as(what + " 应带可读 error 文案")
                            .contains("error");
                });
    }

    @Test
    void importSourceAuditQueueIsIndexed() {
        // 1) 新库：schema.sql 必须自己声明这个复合索引，否则新部署照样全表扫
        String schema;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new ClassPathResource("schema.sql").getInputStream(), StandardCharsets.UTF_8))) {
            schema = r.lines().collect(Collectors.joining("\n"));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        int from = schema.indexOf("CREATE TABLE IF NOT EXISTS import_source");
        assertThat(from).as("schema.sql 里应能找到 import_source 建表语句").isGreaterThan(-1);
        String ddl = schema.substring(from, schema.indexOf(");", from));
        assertThat(ddl)
                .as("后台「导入审核」按 audit_status 过滤、按 id 翻页，建表就要带这个索引")
                .contains("KEY idx_import_source_audit (audit_status, id)");

        // 2) 存量库：迁移脚本执行后，索引列序必须是 (audit_status, id)
        List<String> columns = jdbcTemplate.queryForList(
                "SELECT column_name FROM information_schema.statistics WHERE table_schema = DATABASE() "
                        + "AND table_name = 'import_source' AND index_name = 'idx_import_source_audit' "
                        + "ORDER BY seq_in_index",
                String.class);
        assertThat(columns).containsExactly("audit_status", "id");
    }

    /**
     * 「按今日菜单重新整理清单」的确认文案承诺两件事：手动条目保留、自动条目重算。
     * 原文案说反了（称手动条目会被覆盖）。这里直接查库断言 is_manual 标志的真实语义。
     */
    @Test
    void rebuildingShoppingListKeepsManualItemsAndRecomputesAutoOnes() throws Exception {
        JsonNode guest = newGuest();
        String token = guest.get("token").asText();
        long familyId = guest.get("user").get("familyId").asLong();

        mockMvc.perform(post("/api/daily-menu/today/items").header("X-Auth-Token", token)
                        .contentType("application/json")
                        .content("{\"recipeId\":1,\"mealType\":\"dinner\"}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/shopping-list/today/items").header("X-Auth-Token", token)
                        .contentType("application/json")
                        .content("{\"ingredientName\":\"走查-厨房纸\",\"amount\":\"1\",\"unit\":\"包\"}"))
                .andExpect(status().isOk());

        Integer manualBefore = manualCount(familyId);
        Integer autoBefore = autoCount(familyId);
        assertThat(autoBefore).as("菜单应已派生出自动条目").isPositive();

        mockMvc.perform(post("/api/shopping-list/today/rebuild").header("X-Auth-Token", token))
                .andExpect(status().isOk());

        assertThat(manualCount(familyId)).as("重建只删 is_manual=0，手动条目必须留下").isEqualTo(manualBefore);
        assertThat(autoCount(familyId)).as("自动条目仍在（被重算而非清空）").isPositive();
    }

    private int manualCount(long familyId) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM shopping_list_item i JOIN shopping_list l ON l.id = i.shopping_list_id "
                        + "WHERE l.family_id = ? AND i.is_manual = 1",
                Integer.class, familyId);
        return n == null ? 0 : n;
    }

    private int autoCount(long familyId) {
        Integer n = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM shopping_list_item i JOIN shopping_list l ON l.id = i.shopping_list_id "
                        + "WHERE l.family_id = ? AND i.is_manual = 0",
                Integer.class, familyId);
        return n == null ? 0 : n;
    }

    @Test
    void prodProfileLeavesNoCredentialDefaults() throws Exception {
        String yaml;
        try (BufferedReader r = new BufferedReader(new InputStreamReader(
                new ClassPathResource("application-prod.yml").getInputStream(), StandardCharsets.UTF_8))) {
            yaml = r.lines().collect(Collectors.joining("\n"));
        }
        assertThat(yaml)
                .as("生产数据源必须无默认值：漏注入时要启动失败，而不是带着 root/123456 连到别处")
                .contains("${DB_USERNAME}")
                .doesNotContain("${DB_USERNAME:");
        assertThat(yaml).doesNotContain("${DB_PASSWORD:").doesNotContain("${DB_HOST:");
    }
}
