package com.familymenu.daily;

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
 * 会话安全：token 以哈希落库（明文不落库）+ 登出可吊销。
 */
@SpringBootTest
@AutoConfigureMockMvc
class SessionTokenTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "session-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    @Test
    void tokenIsStoredAsHashNotPlaintext() throws Exception {
        String token = guestLogin();
        // 明文 token 不应出现在 user_session 表里
        Integer plaintextRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM user_session WHERE token = ?", Integer.class, token);
        assertThat(plaintextRows).isZero();
        // 表里存在 64 位十六进制摘要行（不针对具体值断言，避免并发干扰）
        Integer hashedRows = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM user_session WHERE token REGEXP '^[0-9a-f]{64}$'", Integer.class);
        assertThat(hashedRows).isNotNull();
        assertThat(hashedRows).isGreaterThan(0);
    }

    @Test
    void logoutRevokesSession() throws Exception {
        String token = guestLogin();
        // 登出前可访问受保护接口
        mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/logout").header("X-Auth-Token", token))
                .andExpect(status().isOk());

        // 登出后同一 token 失效
        mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void logoutIsIdempotent() throws Exception {
        String token = guestLogin();
        mockMvc.perform(post("/api/auth/logout").header("X-Auth-Token", token))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/auth/logout").header("X-Auth-Token", token))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/auth/logout"))
                .andExpect(status().isOk());
    }
}
