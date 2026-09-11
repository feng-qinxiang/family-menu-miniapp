package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.service.SubscribeMessageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 配上模板 ID 之后的订阅消息行为（模板由小程序后台申请，这里用假 ID 模拟"已配置"）。
 *
 * 微信凭据刻意清空：这条用例要证明的是"配了模板但凭据还没配"这个中间状态不会出事——
 * 运维先把模板 ID 填上、凭据还没到位时，接口不能因此报错或卡住。
 *
 * 依赖本地 MySQL（与既有测试一致）。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "wechat.subscribe.template-wish=tmpl-wish-test-001",
        "wechat.subscribe.template-meal=tmpl-meal-test-002",
        // 不依赖开发机上的环境变量，保证测试结果可复现
        "wechat.app-id=",
        "wechat.app-secret="
})
class SubscribeTemplateConfigTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SubscribeMessageService subscribeMessageService;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "subscribe-cfg-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    /** 模板 ID 必须下发给客户端：前端调 wx.requestSubscribeMessage 时要用，写死在小程序里就会两边不同步。 */
    @Test
    void templateIdsAreExposedToClient() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/notifications/subscribe").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(true))
                .andExpect(jsonPath("$.templates.wish").value("tmpl-wish-test-001"))
                .andExpect(jsonPath("$.templates.meal").value("tmpl-meal-test-002"));
    }

    @Test
    void configuredTemplatesAreVisibleToService() {
        assertThat(subscribeMessageService.available()).isTrue();
        assertThat(subscribeMessageService.templateIds()).containsEntry("meal", "tmpl-meal-test-002");
    }

    /**
     * 模板已配、凭据未配：用户打开开关后触发许愿，接口必须照常 200。
     * 推送会在缺凭据时静默跳过，绝不允许把主流程带崩或卡住。
     */
    @Test
    void pushIsSkippedGracefullyWhenWechatCredentialsMissing() throws Exception {
        String chefToken = guestLogin();
        String memberToken = guestLogin();

        MvcResult invite = mockMvc.perform(get("/api/family/invite-code").header("X-Auth-Token", chefToken))
                .andExpect(status().isOk())
                .andReturn();
        String inviteCode = json(invite).get("inviteCode").asText();

        mockMvc.perform(post("/api/family/join")
                        .header("X-Auth-Token", memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("inviteCode", inviteCode))))
                .andExpect(status().isOk());

        // 接收方把开关打开 —— 这是"最想去推送"的状态
        mockMvc.perform(patch("/api/notifications/subscribe")
                        .header("X-Auth-Token", memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));

        mockMvc.perform(post("/api/wishes")
                        .header("X-Auth-Token", chefToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "date", LocalDate.now().toString(),
                                "slot", "lunch",
                                "text", "凭据缺失也不该影响许愿 " + System.nanoTime()))))
                .andExpect(status().isOk());
    }

    /** 开饭广播同理：它同样挂着推送旁路。 */
    @Test
    void announceStillWorksWithTemplatesConfigured() throws Exception {
        String token = guestLogin();
        mockMvc.perform(post("/api/daily-menu/today/announce").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.ok").value(true));
    }
}
