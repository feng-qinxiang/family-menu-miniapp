package com.familymenu.daily;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 短信网关没配置时的行为。
 *
 * 这个类**不能**开 dev OTP：要的就是"网关发不出去 + dev 模式也关着"这个组合。
 * 以前这种组合下接口照样返回 200「验证码已发送」，用户等一条永远不来的短信，
 * 而验证码只以哈希形式落库，谁也查不到——本地开发直接卡死在这里。
 */
@SpringBootTest
@AutoConfigureMockMvc
class SmsGatewayMisconfigTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void otpRequestFailsLoudlyInsteadOfPretendingToSend() throws Exception {
        mockMvc.perform(post("/api/auth/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"13900001111\"}"))
                .andExpect(status().isServiceUnavailable())
                .andExpect(jsonPath("$.error").value(org.hamcrest.Matchers.containsString("AUTH_DEV_OTP_ENABLED")));
    }

    @Test
    void adminOtpRequestAlsoFailsLoudly() throws Exception {
        mockMvc.perform(post("/api/admin/auth/otp")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"phone\":\"13900001111\"}"))
                .andExpect(status().isServiceUnavailable());
    }
}
