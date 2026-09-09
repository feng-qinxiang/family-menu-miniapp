package com.familymenu.daily;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 模拟支付默认禁用验证：不设置 wechat.pay.mock-pay-enabled（默认 false）时，
 * mock-pay 必须返回 403，防止任何登录用户免费开通会员（资损防线）。
 * 与 PaymentFlowTests 分离是因为需要不同的 Spring 配置上下文。
 */
@SpringBootTest
@AutoConfigureMockMvc
class MockPayDisabledTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void mockPayForbiddenByDefault() throws Exception {
        // 游客登录拿 token
        MvcResult login = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "mockpay-disabled-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        String token = objectMapper.readTree(login.getResponse().getContentAsString())
                .get("token").asText();

        // 正常下单仍允许（下单本身无资损）
        MvcResult order = mockMvc.perform(post("/api/payment/orders")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("planCode", "monthly"))))
                .andExpect(status().isOk())
                .andReturn();
        String outTradeNo = objectMapper.readTree(order.getResponse().getContentAsString())
                .get("outTradeNo").asText();

        // mock-pay 默认禁用 → 403，会员不会被开通
        mockMvc.perform(post("/api/payment/mock-pay")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("outTradeNo", outTradeNo))))
                .andExpect(status().isForbidden());
    }
}
