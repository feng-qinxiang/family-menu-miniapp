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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 运营管理接口的鉴权与提权防护测试。
 * 重点验证：非管理员一律 403、不能自授、不能自提权。
 * 依赖本地 MySQL（与既有测试一致）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminSecurityTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String guestLogin(String deviceId) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", deviceId))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("token").asText();
    }

    private long userIdOf(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("userId").asLong();
    }

    @Test
    void anonymousCannotListUsers() throws Exception {
        mockMvc.perform(get("/api/admin/users"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void plainUserCannotListUsers() throws Exception {
        String token = guestLogin("admin-test-plain-" + System.nanoTime());
        mockMvc.perform(get("/api/admin/users").header("X-Auth-Token", token))
                .andExpect(status().isForbidden())
                .andExpect(jsonPath("$.error").value("需要管理员权限"));
    }

    @Test
    void plainUserCannotGrantAdmin() throws Exception {
        String token = guestLogin("admin-test-grant-" + System.nanoTime());
        long targetId = userIdOf(token);
        mockMvc.perform(post("/api/admin/users/" + targetId + "/admin")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"admin\":true}"))
                .andExpect(status().isForbidden());
        // 确认没被提权
        Boolean isAdmin = jdbcTemplate.queryForObject(
                "SELECT is_admin FROM user_account WHERE id = ?", Boolean.class, targetId);
        assertThat(isAdmin).isFalse();
    }

    @Test
    void adminCannotChangeOwnAdminStatus() throws Exception {
        String token = guestLogin("admin-test-self-" + System.nanoTime());
        long myId = userIdOf(token);
        // 直接提权成管理员（模拟已由白名单/其他管理员授予）
        jdbcTemplate.update("UPDATE user_account SET is_admin = 1 WHERE id = ?", myId);
        try {
            mockMvc.perform(post("/api/admin/users/" + myId + "/admin")
                            .header("X-Auth-Token", token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"admin\":false}"))
                    .andExpect(status().isForbidden());
            Boolean stillAdmin = jdbcTemplate.queryForObject(
                    "SELECT is_admin FROM user_account WHERE id = ?", Boolean.class, myId);
            assertThat(stillAdmin).isTrue();
        } finally {
            jdbcTemplate.update("UPDATE user_account SET is_admin = 0 WHERE id = ?", myId);
        }
    }

    @Test
    void adminCanSearchAndGrantOtherUser() throws Exception {
        String adminToken = guestLogin("admin-test-actor-" + System.nanoTime());
        long adminId = userIdOf(adminToken);
        String targetToken = guestLogin("admin-test-target-" + System.nanoTime());
        long targetId = userIdOf(targetToken);
        jdbcTemplate.update("UPDATE user_account SET is_admin = 1 WHERE id = ?", adminId);
        try {
            mockMvc.perform(get("/api/admin/users").header("X-Auth-Token", adminToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.items").isArray());

            mockMvc.perform(post("/api/admin/users/" + targetId + "/admin")
                            .header("X-Auth-Token", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"admin\":true}"))
                    .andExpect(status().isOk());

            Boolean promoted = jdbcTemplate.queryForObject(
                    "SELECT is_admin FROM user_account WHERE id = ?", Boolean.class, targetId);
            assertThat(promoted).isTrue();

            // 回收：应同时吊销该用户会话
            mockMvc.perform(post("/api/admin/users/" + targetId + "/admin")
                            .header("X-Auth-Token", adminToken)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"admin\":false}"))
                    .andExpect(status().isOk());
            mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", targetToken))
                    .andExpect(status().isUnauthorized());
        } finally {
            jdbcTemplate.update("UPDATE user_account SET is_admin = 0 WHERE id IN (?, ?)", adminId, targetId);
        }
    }

    @Test
    void adminSearchDoesNotLeakFullPhoneOrOpenid() throws Exception {
        String adminToken = guestLogin("admin-test-mask-" + System.nanoTime());
        long adminId = userIdOf(adminToken);
        jdbcTemplate.update("UPDATE user_account SET is_admin = 1 WHERE id = ?", adminId);
        try {
            MvcResult result = mockMvc.perform(get("/api/admin/users?size=50")
                            .header("X-Auth-Token", adminToken))
                    .andExpect(status().isOk())
                    .andReturn();
            String body = result.getResponse().getContentAsString();
            assertThat(body).doesNotContain("\"openid\":\"guest-test");
        } finally {
            jdbcTemplate.update("UPDATE user_account SET is_admin = 0 WHERE id = ?", adminId);
        }
    }
}
