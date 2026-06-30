package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 支付与会员开通端到端：下单、模拟开通、幂等、有效期叠加、共享判定、越权购买、金额防篡改。
 * 依赖本地 MySQL（与 CoreFlowTests 同环境）。Docker 不可用，故用真实库直连替代 Testcontainers。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.dev-otp-enabled=true")
class PaymentFlowTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "pay-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private String createOrder(String token, String planCode) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/payment/orders")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("planCode", planCode))))
                .andExpect(status().isOk())
                .andReturn();
        return json(result).get("outTradeNo").asText();
    }

    @Test
    void plansAreServerAuthoritative() throws Exception {
        MvcResult result = mockMvc.perform(get("/api/payment/plans"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode plans = json(result);
        assertThat(plans.isArray()).isTrue();
        assertThat(plans.size()).isGreaterThanOrEqualTo(2);
        // 金额以分返回，年卡时长 365 天
        JsonNode annual = null;
        for (JsonNode p : plans) {
            if ("annual".equals(p.get("planCode").asText())) {
                annual = p;
            }
        }
        assertThat(annual).isNotNull();
        assertThat(annual.get("amountFen").asLong()).isEqualTo(9900L);
        assertThat(annual.get("durationDays").asInt()).isEqualTo(365);
    }

    @Test
    void orderAmountComesFromServerNotClient() throws Exception {
        String token = guestLogin();
        // 前端即便传入伪造金额字段也被忽略，金额一律取后端目录
        MvcResult result = mockMvc.perform(post("/api/payment/orders")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                Map.of("planCode", "annual", "amountFen", 1, "durationDays", 99999))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode order = json(result);
        assertThat(order.get("amountFen").asLong()).isEqualTo(9900L);
        assertThat(order.get("durationDays").asInt()).isEqualTo(365);
        assertThat(order.get("status").asText()).isEqualTo("PENDING");
    }

    @Test
    void unknownPlanCodeRejected() throws Exception {
        String token = guestLogin();
        mockMvc.perform(post("/api/payment/orders")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("planCode", "free-forever"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void mockPayActivatesMembership() throws Exception {
        String token = guestLogin();
        // 开通前非会员
        MvcResult before = mockMvc.perform(get("/api/vip/status").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(json(before).get("vip").asBoolean()).isFalse();

        String outTradeNo = createOrder(token, "monthly");
        MvcResult pay = mockMvc.perform(post("/api/payment/mock-pay")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("outTradeNo", outTradeNo))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode payResult = json(pay);
        assertThat(payResult.get("status").asText()).isEqualTo("PAID");
        assertThat(payResult.get("vipStatus").get("vip").asBoolean()).isTrue();

        // 开通后 vip 判定为真
        MvcResult after = mockMvc.perform(get("/api/vip/status").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(json(after).get("vip").asBoolean()).isTrue();
    }

    @Test
    void mockPayIsIdempotent() throws Exception {
        String token = guestLogin();
        String outTradeNo = createOrder(token, "monthly");
        String payload = objectMapper.writeValueAsString(Map.of("outTradeNo", outTradeNo));

        mockMvc.perform(post("/api/payment/mock-pay").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk());
        // 记录首次开通后的到期日
        long expiresAfterFirst = membershipExpiresEpoch(token);

        // 重复支付同一订单：状态仍 PAID，有效期不再叠加
        mockMvc.perform(post("/api/payment/mock-pay").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON).content(payload))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.status").value("PAID"));
        long expiresAfterSecond = membershipExpiresEpoch(token);

        assertThat(expiresAfterSecond).isEqualTo(expiresAfterFirst);
    }

    @Test
    void renewalStacksValidityPeriod() throws Exception {
        String token = guestLogin();
        // 第一单月卡开通
        String first = createOrder(token, "monthly");
        mockMvc.perform(post("/api/payment/mock-pay").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("outTradeNo", first))))
                .andExpect(status().isOk());
        long expiresAfterFirst = membershipExpiresEpoch(token);

        // 第二单月卡续费：到期日应在第一单基础上再叠加约 30 天
        String second = createOrder(token, "monthly");
        mockMvc.perform(post("/api/payment/mock-pay").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("outTradeNo", second))))
                .andExpect(status().isOk());
        long expiresAfterSecond = membershipExpiresEpoch(token);

        long deltaDays = (expiresAfterSecond - expiresAfterFirst) / 86_400L;
        assertThat(deltaDays).isBetween(28L, 31L);
    }

    @Test
    void cannotPayAnotherUsersOrder() throws Exception {
        String buyer = guestLogin();
        String outTradeNo = createOrder(buyer, "annual");

        String attacker = guestLogin();
        mockMvc.perform(post("/api/payment/mock-pay")
                        .header("X-Auth-Token", attacker)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("outTradeNo", outTradeNo))))
                .andExpect(status().isForbidden());
    }

    @Test
    void shareScopeRequiresMembershipAndToggles() throws Exception {
        String token = guestLogin();
        // 无会员时设置共享范围被拒
        mockMvc.perform(post("/api/payment/share-scope")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("shareScope", "SELF"))))
                .andExpect(status().isNotFound());

        // 开通后可切换
        String outTradeNo = createOrder(token, "monthly");
        mockMvc.perform(post("/api/payment/mock-pay").header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("outTradeNo", outTradeNo))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/payment/share-scope")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("shareScope", "SELF"))))
                .andExpect(status().isOk());

        // 切回 SELF 后本人仍享有会员（购买者本人恒享有，不受 share_scope 影响）
        MvcResult status = mockMvc.perform(get("/api/vip/status").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(json(status).get("vip").asBoolean()).isTrue();
    }

    @Test
    void unpaidOrderDoesNotActivate() throws Exception {
        String token = guestLogin();
        createOrder(token, "annual");
        // 仅下单未支付，不得开通
        MvcResult status = mockMvc.perform(get("/api/vip/status").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(json(status).get("vip").asBoolean()).isFalse();
    }

    /**
     * T4-1: 商户未配置时 prepay 返回 mockMode=true，不需要任何 WeChat 凭据即可通过。
     */
    @Test
    void prepayReturnsMockModeWhenNotConfigured() throws Exception {
        String token = guestLogin();
        String outTradeNo = createOrder(token, "monthly");

        MvcResult result = mockMvc.perform(post("/api/payment/orders/" + outTradeNo + "/prepay")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isOk())
                .andReturn();

        JsonNode resp = json(result);
        // 测试环境未配置 WECHAT_MCH_ID 等，期望 mockMode=true
        assertThat(resp.get("mockMode").asBoolean()).isTrue();
    }

    /**
     * T4-2: 无签名直接 POST /api/payment/notify → 商户未配置时返回 {code:"FAIL"} 或非 2xx。
     */
    @Test
    void notifyRequiresMchConfigured() throws Exception {
        // 发送一个没有签名的空通知体
        MvcResult result = mockMvc.perform(post("/api/payment/notify")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"id\":\"test\",\"resource\":{\"algorithm\":\"AEAD_AES_256_GCM\",\"ciphertext\":\"invalid\",\"nonce\":\"abc\"}}"))
                .andReturn();

        // 商户未配置时 WechatPayService.verifyAndDecryptNotify 抛出异常 → controller catch → {code:FAIL}
        // 或 HTTP 非 200
        int status = result.getResponse().getStatus();
        String body = result.getResponse().getContentAsString();
        boolean failResponse = status != 200 || body.contains("FAIL");
        assertThat(failResponse).isTrue();
    }

    // 读取本人会员到期日的 epoch 秒，用于断言幂等不叠加、续费叠加。
    private long membershipExpiresEpoch(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/payment/membership")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return json(result).get("expiresAtEpoch").asLong();
    }
}
