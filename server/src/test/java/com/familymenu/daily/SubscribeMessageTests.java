package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.service.SubscribeMessageService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 订阅消息在「模板未配置」这个默认状态下的行为——这也是当前线上真实的状态，
 * 因为模板 ID 要等小程序后台审核通过才有。
 *
 * 要守住的三条：
 *   1. 没配模板 = 功能整体关闭，前端据此不显示开关（不能显示出点了没反应的开关）
 *   2. 通知开关默认关闭 —— 不打扰是默认值
 *   3. 推送是旁路：它挂在许愿/开饭这类主流程上，绝不能反过来影响站内通知与业务接口
 *
 * 依赖本地 MySQL（与既有测试一致）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class SubscribeMessageTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private SubscribeMessageService subscribeMessageService;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "subscribe-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private JsonNode json(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(StandardCharsets.UTF_8));
    }

    @Test
    void featureIsUnavailableWhenNoTemplateConfigured() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/notifications/subscribe").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.available").value(false))
                // 模板 ID 不下发：前端拿不到就不该调 wx.requestSubscribeMessage
                .andExpect(jsonPath("$.templates").isEmpty());
    }

    /** 默认必须是关的：新用户不该在不知情的情况下被推送打扰。 */
    @Test
    void switchIsOffByDefault() throws Exception {
        String token = guestLogin();
        MvcResult result = mockMvc.perform(get("/api/notifications/subscribe").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(json(result).get("enabled").asBoolean()).isFalse();
    }

    @Test
    void togglePersistsAndIsReturnedByBothEndpoints() throws Exception {
        String token = guestLogin();

        mockMvc.perform(patch("/api/notifications/subscribe")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":true}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));

        // 重新读一次：确认真的落库了，而不是只在响应里回显
        mockMvc.perform(get("/api/notifications/subscribe").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(true));

        mockMvc.perform(patch("/api/notifications/subscribe")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"enabled\":false}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));

        mockMvc.perform(get("/api/notifications/subscribe").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.enabled").value(false));
    }

    /** 缺字段必须报错而不是被当成 false：静默把开关关掉会让前端以为用户自己关的。 */
    @Test
    void toggleWithoutEnabledFieldIsRejected() throws Exception {
        String token = guestLogin();
        mockMvc.perform(patch("/api/notifications/subscribe")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    @Test
    void settingRequiresSession() throws Exception {
        mockMvc.perform(get("/api/notifications/subscribe"))
                .andExpect(status().isUnauthorized());
        mockMvc.perform(patch("/api/notifications/subscribe")
                        .header("Content-Type", MediaType.APPLICATION_JSON_VALUE)
                        .content("{\"enabled\":true}"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * 推送旁路不得干扰主流程：两个真实用户在同一家庭里，A 许愿后 B 的站内通知必须照常收到。
     *
     * 这条用例挡的是"接推送时把通知链路改坏"——推送要发起外部请求，一旦它抛异常
     * 而 NotificationService 又没兜住，站内通知就会跟着一起没了。
     */
    @Test
    void wishNotificationStillReachesFamilyMembers() throws Exception {
        String chefToken = guestLogin();
        String memberToken = guestLogin();

        // B 加入 A 的家庭，构成"两个真实用户同家"
        MvcResult invite = mockMvc.perform(get("/api/family/invite-code").header("X-Auth-Token", chefToken))
                .andExpect(status().isOk())
                .andReturn();
        String inviteCode = json(invite).get("inviteCode").asText();
        assertThat(inviteCode).isNotBlank();

        mockMvc.perform(post("/api/family/join")
                        .header("X-Auth-Token", memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("inviteCode", inviteCode))))
                .andExpect(status().isOk());

        String wishText = "订阅测试想吃红烧肉" + System.nanoTime();
        mockMvc.perform(post("/api/wishes")
                        .header("X-Auth-Token", chefToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of(
                                "date", java.time.LocalDate.now().toString(),
                                "slot", "dinner",
                                "text", wishText))))
                .andExpect(status().isOk());

        MvcResult notifications = mockMvc.perform(get("/api/notifications").header("X-Auth-Token", memberToken))
                .andExpect(status().isOk())
                .andReturn();
        boolean found = false;
        for (JsonNode item : json(notifications).get("items")) {
            if (item.get("bodyText").asText("").contains(wishText)) {
                found = true;
            }
        }
        assertThat(found).as("许愿后家庭成员应收到站内通知（推送旁路不能把它吞掉）").isTrue();
    }

    /** 直接调用推送入口也不能抛：它是被主流程调用的，异常会顺着冒到接口上。 */
    @Test
    void sendNeverThrows() {
        assertThat(subscribeMessageService.available()).isFalse();
        assertThat(subscribeMessageService.templateIds()).isEmpty();
        // 未配模板的事件：直接跳过
        subscribeMessageService.sendAsync(Long.MAX_VALUE, "wish", "标题", "正文", "pages/home/index");
        // 压根不认识的事件类型：同样跳过，不能因为拼错 kind 就炸掉调用方
        subscribeMessageService.sendAsync(Long.MAX_VALUE, "不存在的类型", "标题", "正文", "");
    }
}
