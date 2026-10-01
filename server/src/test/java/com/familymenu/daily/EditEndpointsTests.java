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

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.HashMap;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 编辑类接口：PUT /api/pantry/{id}、PUT /api/wishes/{id}、PUT /api/admin/pantry/{id}。
 *
 * 重点守两件事：
 *   1. 归属：小程序侧按家庭级校验（别家的 → 404）；管理端跨家庭，靠权限（USER_MANAGE）把关。
 *   2. 幂等写：原值写回仍然 200——不能把「UPDATE 影响 0 行」当成「不存在」。
 *
 * 依赖本地 MySQL（与既有测试一致）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class EditEndpointsTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "edit-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private long userIdOf(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token)).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("userId").asLong();
    }

    /** 造一个指定角色的临时管理员（写法同 AdminRbacTests）；调用方在 finally 里 cleanup。 */
    private String adminWithRole(String role, long[] outUserId) throws Exception {
        String token = guestLogin();
        long id = userIdOf(token);
        jdbcTemplate.update("UPDATE user_account SET is_admin = 1, admin_role = ? WHERE id = ?", role, id);
        outUserId[0] = id;
        return token;
    }

    private void cleanup(long userId) {
        jdbcTemplate.update("UPDATE user_account SET is_admin = 0, admin_role = NULL WHERE id = ?", userId);
        jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", userId);
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private MvcResult send(org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder req,
                           String token, Object body) throws Exception {
        return mockMvc.perform(req.header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(body)))
                .andReturn();
    }

    private static Map<String, Object> pantryBody(String name, String amount, String unit, String expiresAt) {
        Map<String, Object> body = new HashMap<>();   // HashMap：要能放 null
        body.put("ingredientName", name);
        body.put("amount", amount);
        body.put("unit", unit);
        body.put("expiresAt", expiresAt);
        return body;
    }

    private long addPantry(String token, String name) throws Exception {
        MvcResult added = send(post("/api/pantry"), token, pantryBody(name, "3", "个", "2030-01-15"));
        assertThat(added.getResponse().getStatus()).isEqualTo(200);
        return json(added).get("id").asLong();
    }

    private Map<String, Object> pantryRow(long id) {
        return jdbcTemplate.queryForMap(
                "SELECT ingredient_name, amount, unit, DATE_FORMAT(expires_at, '%Y-%m-%d') AS expires_at "
                        + "FROM pantry_item WHERE id = ?", id);
    }

    // ==================== PUT /api/pantry/{id} ====================

    @Test
    void pantryUpdateChangesFieldsAndWritingSameValuesIsStill200() throws Exception {
        String token = guestLogin();
        long id = addPantry(token, "编辑前" + System.nanoTime());
        String newName = "编辑后" + System.nanoTime();

        MvcResult updated = send(put("/api/pantry/" + id), token, pantryBody(newName, "5", "枚", "2030-02-01"));
        assertThat(updated.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = json(updated);
        assertThat(body.get("id").asLong()).isEqualTo(id);
        assertThat(body.get("ingredientName").asText()).isEqualTo(newName);
        assertThat(body.get("amount").asText()).isEqualTo("5");
        assertThat(body.get("unit").asText()).isEqualTo("枚");
        assertThat(body.get("expiresAt").asText()).isEqualTo("2030-02-01");

        Map<String, Object> row = pantryRow(id);
        assertThat(row.get("ingredient_name")).isEqualTo(newName);
        assertThat(row.get("amount")).isEqualTo("5");
        assertThat(row.get("unit")).isEqualTo("枚");
        assertThat(row.get("expires_at")).isEqualTo("2030-02-01");

        // 原值原样写回：守「UPDATE 行数 == 0 → 404」的陷阱
        MvcResult again = send(put("/api/pantry/" + id), token, pantryBody(newName, "5", "枚", "2030-02-01"));
        assertThat(again.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(again).get("ingredientName").asText()).isEqualTo(newName);
    }

    @Test
    void pantryUpdateWithBlankExpiresAtClearsDate() throws Exception {
        String token = guestLogin();
        long id = addPantry(token, "清保质期" + System.nanoTime());
        assertThat(pantryRow(id).get("expires_at")).isEqualTo("2030-01-15");

        MvcResult updated = send(put("/api/pantry/" + id), token, pantryBody("清保质期", "3", "个", ""));
        assertThat(updated.getResponse().getStatus()).isEqualTo(200);
        assertThat(json(updated).get("expiresAt").isNull()).isTrue();
        assertThat(pantryRow(id).get("expires_at")).isNull();
    }

    @Test
    void pantryUpdateOtherFamilyOrMissingIs404() throws Exception {
        String owner = guestLogin();
        String other = guestLogin();
        String name = "别家的库存" + System.nanoTime();
        long id = addPantry(owner, name);

        MvcResult cross = send(put("/api/pantry/" + id), other, pantryBody("被改了", "1", "个", null));
        assertThat(cross.getResponse().getStatus()).isEqualTo(404);
        assertThat(pantryRow(id).get("ingredient_name")).isEqualTo(name);

        MvcResult missing = send(put("/api/pantry/99999999"), owner, pantryBody("不存在", "1", "个", null));
        assertThat(missing.getResponse().getStatus()).isEqualTo(404);
    }

    // ==================== PUT /api/wishes/{id} ====================

    private String addWish(String token, String text) throws Exception {
        MvcResult added = send(post("/api/wishes"), token, Map.of(
                "date", LocalDate.now().toString(), "slot", "dinner", "text", text));
        assertThat(added.getResponse().getStatus()).isEqualTo(200);
        return json(added).get("id").asText();
    }

    @Test
    void wishUpdateChangesTextAndKeepsByAtKeys() throws Exception {
        String token = guestLogin();
        String wishId = addWish(token, "想吃红烧肉" + System.nanoTime());
        String newText = "改成想吃糖醋排骨" + System.nanoTime();

        MvcResult updated = send(put("/api/wishes/" + wishId), token, Map.of("text", newText));
        assertThat(updated.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = json(updated);
        assertThat(body.get("id").asText()).isEqualTo(wishId);
        assertThat(body.get("text").asText()).isEqualTo(newText);
        assertThat(body.has("by")).as("响应键应为 by（与 listWishes 一致）").isTrue();
        assertThat(body.has("at")).as("响应键应为 at（与 listWishes 一致）").isTrue();
        assertThat(body.has("authorName")).isFalse();
        assertThat(jdbcTemplate.queryForObject("SELECT text FROM family_wish WHERE id = ?",
                String.class, Long.parseLong(wishId))).isEqualTo(newText);
    }

    @Test
    void wishUpdateTempIdIs400AndOtherFamilyIs404() throws Exception {
        String owner = guestLogin();
        String other = guestLogin();
        String text = "别家心愿" + System.nanoTime();
        String wishId = addWish(owner, text);

        MvcResult temp = send(put("/api/wishes/w-123"), owner, Map.of("text", "临时 id"));
        assertThat(temp.getResponse().getStatus()).isEqualTo(400);

        MvcResult cross = send(put("/api/wishes/" + wishId), other, Map.of("text", "被改了"));
        assertThat(cross.getResponse().getStatus()).isEqualTo(404);
        assertThat(jdbcTemplate.queryForObject("SELECT text FROM family_wish WHERE id = ?",
                String.class, Long.parseLong(wishId))).isEqualTo(text);
    }

    // ==================== PUT /api/admin/pantry/{id} ====================

    @Test
    void adminWithUserManageCanEditAnyFamilysPantryAndIsAudited() throws Exception {
        String owner = guestLogin();
        long id = addPantry(owner, "运营修正前" + System.nanoTime());
        Long familyId = jdbcTemplate.queryForObject("SELECT family_id FROM pantry_item WHERE id = ?", Long.class, id);
        long[] adminId = new long[1];
        String admin = adminWithRole("SUPER", adminId);
        try {
            String newName = "运营修正后" + System.nanoTime();
            MvcResult updated = send(put("/api/admin/pantry/" + id), admin, pantryBody(newName, "2 个", "个", ""));
            assertThat(updated.getResponse().getStatus()).isEqualTo(200);
            JsonNode body = json(updated);
            // 与 GET /api/admin/pantry 同形
            assertThat(body.get("id").asLong()).isEqualTo(id);
            assertThat(body.get("familyId").asLong()).isEqualTo(familyId);
            assertThat(body.has("familyName")).isTrue();
            assertThat(body.has("addedAt")).isTrue();
            assertThat(body.get("ingredientName").asText()).isEqualTo(newName);
            assertThat(body.get("amount").asText()).isEqualTo("2 个");
            assertThat(body.get("expiresAt").isNull()).isTrue();
            assertThat(pantryRow(id).get("ingredient_name")).isEqualTo(newName);
            assertThat(pantryRow(id).get("expires_at")).isNull();

            // 原值写回仍 200（幂等写）
            MvcResult again = send(put("/api/admin/pantry/" + id), admin, pantryBody(newName, "2 个", "个", null));
            assertThat(again.getResponse().getStatus()).isEqualTo(200);

            // 走了审计
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM admin_audit_log WHERE actor_user_id = ? AND action = 'UPDATE_PANTRY' "
                            + "AND target_type = 'pantry_item' AND target_id = ?",
                    Long.class, adminId[0], String.valueOf(id))).isEqualTo(2L);

            // 不存在 → 404
            MvcResult missing = send(put("/api/admin/pantry/99999999"), admin, pantryBody("x", "1", "个", null));
            assertThat(missing.getResponse().getStatus()).isEqualTo(404);
        } finally {
            cleanup(adminId[0]);
        }
    }

    @Test
    void supportWithOnlyUserViewIsForbiddenToEditPantry() throws Exception {
        String owner = guestLogin();
        String name = "客服改不动" + System.nanoTime();
        long id = addPantry(owner, name);
        long[] supportId = new long[1];
        String support = adminWithRole("SUPPORT", supportId);
        try {
            // 能读
            mockMvc.perform(get("/api/admin/pantry").header("X-Auth-Token", support))
                    .andExpect(status().isOk());
            // 不能写
            mockMvc.perform(put("/api/admin/pantry/" + id)
                            .header("X-Auth-Token", support)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(pantryBody("被客服改了", "1", "个", null))))
                    .andExpect(status().isForbidden());
            assertThat(pantryRow(id).get("ingredient_name")).isEqualTo(name);
        } finally {
            cleanup(supportId[0]);
        }
    }

    @Test
    void adminPantryEditRejectsBlankNameUnparseableAmountAndBadDate() throws Exception {
        String owner = guestLogin();
        String name = "校验用库存" + System.nanoTime();
        long id = addPantry(owner, name);
        long[] adminId = new long[1];
        String admin = adminWithRole("SUPER", adminId);
        try {
            assertThat(send(put("/api/admin/pantry/" + id), admin, pantryBody("   ", "1", "个", null))
                    .getResponse().getStatus()).isEqualTo(400);
            // 解析不出数字 → 做菜永远扣不到 → 400 并说明原因
            MvcResult vague = send(put("/api/admin/pantry/" + id), admin, pantryBody(name, "适量", "", null));
            assertThat(vague.getResponse().getStatus()).isEqualTo(400);
            assertThat(vague.getResponse().getContentAsString(StandardCharsets.UTF_8)).contains("扣减");
            assertThat(send(put("/api/admin/pantry/" + id), admin, pantryBody(name, "1", "个", "2030/01/01"))
                    .getResponse().getStatus()).isEqualTo(400);
            // 空 amount 放行（= 未填）
            assertThat(send(put("/api/admin/pantry/" + id), admin, pantryBody(name, "", "", null))
                    .getResponse().getStatus()).isEqualTo(200);
            assertThat(pantryRow(id).get("amount")).isEqualTo("");
        } finally {
            cleanup(adminId[0]);
        }
    }

    @Test
    void adminCanEditOtherFieldsOfARowWhoseExistingAmountIsFreeText() throws Exception {
        // 小程序侧允许「适量」；这种已有行只改保质期，不能被数量校验拦住
        String owner = guestLogin();
        String name = "自由文本数量" + System.nanoTime();
        MvcResult added = send(post("/api/pantry"), owner, pantryBody(name, "适量", "", null));
        assertThat(added.getResponse().getStatus()).isEqualTo(200);
        long id = json(added).get("id").asLong();
        long[] adminId = new long[1];
        String admin = adminWithRole("SUPER", adminId);
        try {
            assertThat(send(put("/api/admin/pantry/" + id), admin, pantryBody(name, "适量", "", "2030-02-02"))
                    .getResponse().getStatus()).isEqualTo(200);
            assertThat(pantryRow(id).get("expires_at")).isEqualTo("2030-02-02");
            assertThat(pantryRow(id).get("amount")).isEqualTo("适量");
        } finally {
            cleanup(adminId[0]);
        }
    }
}
