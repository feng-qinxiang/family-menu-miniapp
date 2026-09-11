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

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 家庭侧只读数据接口：家庭与成员 / 今日菜单 / 购物清单 / 库存。
 *
 * 背景：这几类数据此前只存在于小程序里，运营在后台完全看不到 ——
 * 用户来问"我家的菜单怎么没了""成员怎么少了一个"只能靠猜。
 * 这里锁住三件事：非管理员一律 403、管理员能看到自己家庭的成员与计数、导出覆盖这几类。
 *
 * 注意：这些接口**只读**，测试里不要试图通过它们改用户的菜单/清单。
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminFamilyDataTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "admin-family-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8))
                .get("token").asText();
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    private JsonNode getJson(String path, String token) throws Exception {
        MvcResult result = mockMvc.perform(get(path).header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return json(result);
    }

    /** 临时管理员：返回 token，调用方负责在 finally 里 demote。 */
    private String adminToken(long[] outUserId) throws Exception {
        String token = guestLogin();
        long id = json(mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token))
                .andReturn()).get("userId").asLong();
        jdbcTemplate.update("UPDATE user_account SET is_admin = 1 WHERE id = ?", id);
        if (outUserId != null && outUserId.length > 0) outUserId[0] = id;
        return token;
    }

    private void demote(long userId) {
        jdbcTemplate.update("UPDATE user_account SET is_admin = 0 WHERE id = ?", userId);
    }

    /** 这些接口属于运营只读域，普通用户一律 403（越权会暴露别人家的菜单与库存）。 */
    @Test
    void familyDataEndpointsRejectPlainUser() throws Exception {
        String token = guestLogin();
        String[] paths = {
                "/api/admin/families", "/api/admin/families/1",
                "/api/admin/menus", "/api/admin/shopping", "/api/admin/pantry",
                "/api/admin/export/families"
        };
        for (String path : paths) {
            mockMvc.perform(get(path).header("X-Auth-Token", token))
                    .andExpect(status().isForbidden());
        }
    }

    /** 管理员能在家庭列表里找到自己刚创建的家庭，且计数与成员数一致。 */
    @Test
    void adminSeesOwnFamilyWithCounts() throws Exception {
        long[] adminId = new long[1];
        String token = adminToken(adminId);
        try {
            long familyId = jdbcTemplate.queryForObject(
                    "SELECT current_family_id FROM user_account WHERE id = ?", Long.class, adminId[0]);
            JsonNode list = getJson("/api/admin/families?keyword=&page=0&size=100", token);
            assertThat(list.get("total").asLong()).isGreaterThan(0);

            JsonNode mine = null;
            for (JsonNode item : list.get("items")) {
                if (item.get("familyId").asLong() == familyId) {
                    mine = item;
                    break;
                }
            }
            assertThat(mine).as("新账号登录时会自动建家庭，管理员应能在家庭列表里看到它").isNotNull();
            assertThat(mine.get("memberCount").asInt()).isGreaterThanOrEqualTo(1);
            assertThat(mine.get("ownerUserId").asLong()).isEqualTo(adminId[0]);
            assertThat(mine.get("ownerNickname").asText()).isNotBlank();
        } finally {
            demote(adminId[0]);
        }
    }

    /** 家庭详情的下钻结构：成员、最近菜单、购物清单、库存四个块都在（可以为空，但字段不能缺）。 */
    @Test
    void familyDetailExposesMembersAndRelatedLists() throws Exception {
        long[] adminId = new long[1];
        String token = adminToken(adminId);
        try {
            long familyId = jdbcTemplate.queryForObject(
                    "SELECT current_family_id FROM user_account WHERE id = ?", Long.class, adminId[0]);
            JsonNode detail = getJson("/api/admin/families/" + familyId, token);

            assertThat(detail.get("family").get("familyId").asLong()).isEqualTo(familyId);
            JsonNode members = detail.get("members");
            assertThat(members.isArray()).isTrue();
            assertThat(members.size()).isGreaterThanOrEqualTo(1);
            assertThat(members.get(0).get("role").asText()).isEqualTo("owner");
            assertThat(detail.get("recentMenus").isArray()).isTrue();
            assertThat(detail.get("shoppingLists").isArray()).isTrue();
            assertThat(detail.get("pantry").isArray()).isTrue();
        } finally {
            demote(adminId[0]);
        }
    }

    /** 家庭不存在时给 404，而不是静默返回空对象（前端要靠它区分"没数据"和"没这个家庭"）。 */
    @Test
    void unknownFamilyReturnsNotFound() throws Exception {
        long[] adminId = new long[1];
        String token = adminToken(adminId);
        try {
            mockMvc.perform(get("/api/admin/families/99999999").header("X-Auth-Token", token))
                    .andExpect(status().isNotFound());
        } finally {
            demote(adminId[0]);
        }
    }

    /** 三个列表接口都能按筛选条件正常返回分页信封。 */
    @Test
    void menuShoppingPantryListsArePaged() throws Exception {
        long[] adminId = new long[1];
        String token = adminToken(adminId);
        try {
            JsonNode menus = getJson("/api/admin/menus?date=&keyword=&page=0&size=10", token);
            assertThat(menus.has("total")).isTrue();
            assertThat(menus.get("items").isArray()).isTrue();

            JsonNode shopping = getJson("/api/admin/shopping?date=&status=&page=0&size=10", token);
            assertThat(shopping.has("total")).isTrue();
            assertThat(shopping.get("items").isArray()).isTrue();

            JsonNode pantry = getJson("/api/admin/pantry?keyword=&page=0&size=10", token);
            assertThat(pantry.has("total")).isTrue();
            assertThat(pantry.get("items").isArray()).isTrue();
        } finally {
            demote(adminId[0]);
        }
    }

    /** 四类数据都能导出成真正的 xlsx（不是改后缀的 CSV）。 */
    @Test
    void exportSupportsFamilyKinds() throws Exception {
        long[] adminId = new long[1];
        String token = adminToken(adminId);
        try {
            for (String kind : new String[]{"families", "menus", "shopping", "pantry"}) {
                MvcResult result = mockMvc.perform(get("/api/admin/export/" + kind).header("X-Auth-Token", token))
                        .andExpect(status().isOk())
                        .andReturn();
                assertThat(result.getResponse().getContentType())
                        .as("导出 " + kind + " 应是 Excel 文件")
                        .contains("spreadsheetml");
                assertThat(result.getResponse().getContentAsByteArray().length).isGreaterThan(500);
            }
        } finally {
            demote(adminId[0]);
        }
    }
}
