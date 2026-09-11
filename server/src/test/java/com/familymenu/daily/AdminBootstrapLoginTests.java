package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 引导登录（ADMIN_BOOTSTRAP_TOKEN + ADMIN_BOOTSTRAP_PHONE）的行为与边界。
 *
 * 背景：/admin 的常规入口是手机号验证码，而短信网关当前是 noop（发不出去），
 * 于是后台进不去。引导登录是应急入口，它必须满足三条安全约束：
 *   1. 令牌不对 → 401，不能给出任何"令牌接近正确"的线索
 *   2. 只对「本来就是管理员且手机号匹配」的账号签发会话 —— 拿令牌不能提权
 *   3. 令牌正确但账号不存在 → 403，不泄露账号是否存在以外的信息
 *
 * 各用例自己准备前置数据（不依赖执行顺序）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "admin.bootstrap-token=bootstrap-test-token-2f8a91",
        "admin.bootstrap-phone=13900000001"
})
class AdminBootstrapLoginTests {

    private static final String TOKEN = "bootstrap-test-token-2f8a91";
    private static final String PHONE = "13900000001";

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 准备该手机号对应的账号：先清掉可能残留的同号账号，再按需要插入管理员或普通账号。 */
    private void prepareAccount(boolean admin) {
        jdbcTemplate.update("DELETE FROM user_account WHERE phone_number = ?", PHONE);
        jdbcTemplate.update("""
                INSERT INTO user_account (openid, nickname, phone_number, is_admin, status)
                VALUES (?, '引导登录测试账号', ?, ?, 'ACTIVE')
                """, "bootstrap-test-" + System.nanoTime(), PHONE, admin ? 1 : 0);
    }

    private void removeAccount() {
        jdbcTemplate.update("DELETE FROM user_account WHERE phone_number = ?", PHONE);
    }

    private MvcResult bootstrap(String token) throws Exception {
        return mockMvc.perform(post("/api/admin/auth/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("token", token))))
                .andReturn();
    }

    @Test
    void wrongTokenIsRejected() throws Exception {
        prepareAccount(true);
        mockMvc.perform(post("/api/admin/auth/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"definitely-not-the-token\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void emptyTokenIsRejected() throws Exception {
        prepareAccount(true);
        mockMvc.perform(post("/api/admin/auth/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void missingBodyIsRejected() throws Exception {
        prepareAccount(true);
        mockMvc.perform(post("/api/admin/auth/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isUnauthorized());
    }

    /** 拿令牌不能提权：手机号对得上但本来不是管理员的账号，必须拒绝，且权限位不能被改动。 */
    @Test
    void tokenCannotPromoteNonAdminAccount() throws Exception {
        prepareAccount(false);
        assertThat(bootstrap(TOKEN).getResponse().getStatus()).isEqualTo(403);
        Integer isAdmin = jdbcTemplate.queryForObject(
                "SELECT is_admin FROM user_account WHERE phone_number = ?", Integer.class, PHONE);
        assertThat(isAdmin).isEqualTo(0);
    }

    @Test
    void unknownPhoneCannotBootstrap() throws Exception {
        removeAccount();
        assertThat(bootstrap(TOKEN).getResponse().getStatus()).isEqualTo(403);
    }

    /** 正常路径：令牌正确 + 账号是管理员 + 手机号匹配 → 拿到可直接访问 /api/admin/** 的会话。 */
    @Test
    void adminCanBootstrapAndUseTheSession() throws Exception {
        prepareAccount(true);

        MvcResult result = bootstrap(TOKEN);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        String sessionToken = body.get("token").asText();
        assertThat(sessionToken).isNotBlank();

        // 拿到的会话必须真的能进管理端（否则等于给了一把开不了门的钥匙）
        mockMvc.perform(get("/api/admin/me").header("X-Auth-Token", sessionToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.roleName").isNotEmpty());
    }

    /** 引导登录不需要预先携带任何会话（否则进不去后台就没意义了）。 */
    @Test
    void bootstrapDoesNotRequireExistingSession() throws Exception {
        prepareAccount(true);
        MvcResult result = bootstrap(TOKEN);
        assertThat(result.getResponse().getStatus()).isEqualTo(200);
    }

    /** 令牌必须由服务端常量时间比对：长度接近的令牌同样被拒。 */
    @Test
    void nearMissTokenIsRejected() throws Exception {
        prepareAccount(true);
        assertThat(bootstrap(TOKEN.substring(0, TOKEN.length() - 1) + "0").getResponse().getStatus())
                .isEqualTo(401);
        assertThat(bootstrap(TOKEN + "x").getResponse().getStatus()).isEqualTo(401);
    }
}
