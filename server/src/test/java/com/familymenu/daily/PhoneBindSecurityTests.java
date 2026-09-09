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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 账号接管漏洞回归：PATCH /api/auth/me 绑定手机号必须携带验证码。
 * 漏洞原状：可直接把任意手机号绑到自己账号，随后攻击者用该手机号 OTP 登录即进入受害者账号。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.dev-otp-enabled=true")
class PhoneBindSecurityTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "phone-bind-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private String uniquePhone() {
        // 测试用 1 开头 11 位；用时间戳后 10 位保证不冲突
        String tail = String.valueOf(System.nanoTime());
        return "1" + tail.substring(Math.max(0, tail.length() - 10));
    }

    private void requestOtp(String phone) throws Exception {
        mockMvc.perform(post("/api/auth/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void bindPhoneWithoutCodeIsRejected() throws Exception {
        String token = guestLogin();
        String phone = uniquePhone();
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\"}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void bindPhoneWithWrongCodeIsRejected() throws Exception {
        String token = guestLogin();
        String phone = uniquePhone();
        requestOtp(phone);
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\",\"phoneCode\":\"000000\"}"))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void bindPhoneWithValidCodeSucceeds() throws Exception {
        String token = guestLogin();
        String phone = uniquePhone();
        requestOtp(phone);
        // dev 模式固定验证码 246810
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\",\"phoneCode\":\"246810\"}"))
                .andExpect(status().isOk());
    }

    @Test
    void cannotBindPhoneAlreadyOwnedByAnotherAccount() throws Exception {
        String phone = uniquePhone();
        // 第一个账号绑定该手机号
        String tokenA = guestLogin();
        requestOtp(phone);
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", tokenA)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\",\"phoneCode\":\"246810\"}"))
                .andExpect(status().isOk());

        // 第二个账号尝试绑定同一手机号 → 409
        String tokenB = guestLogin();
        requestOtp(phone);
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", tokenB)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\",\"phoneCode\":\"246810\"}"))
                .andExpect(status().isConflict());
    }

    @Test
    void resubmittingSamePhoneWithoutCodeIsAllowed() throws Exception {
        // 前端保存资料时会原样回传已有手机号，这种情况不该被拦
        String token = guestLogin();
        String phone = uniquePhone();
        requestOtp(phone);
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"" + phone + "\",\"phoneCode\":\"246810\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"改个名\",\"phone\":\"" + phone + "\"}"))
                .andExpect(status().isOk());
    }
}
