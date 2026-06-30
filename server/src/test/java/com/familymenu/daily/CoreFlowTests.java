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

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 主链路端到端冒烟：登录 -> 菜谱 -> 今日菜单 -> 购物清单，以及手机验证码登录与反馈提交。
 * 依赖本地 MySQL（与现有 contextLoads 测试环境一致），覆盖核心可交付路径。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.dev-otp-enabled=true")
class CoreFlowTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "test-device-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("token").asText();
    }

    @Test
    void guestCanLoginAndReadDashboard() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/home/dashboard").header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    @Test
    void menuToShoppingListFlowWorks() throws Exception {
        String token = guestLogin();

        MvcResult recipesResult = mockMvc.perform(get("/api/recipes?source=all")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode recipes = objectMapper.readTree(recipesResult.getResponse().getContentAsString());
        assertThat(recipes.isArray()).isTrue();
        assertThat(recipes.size()).isGreaterThan(0);
        long recipeId = recipes.get(0).get("id").asLong();

        String addBody = objectMapper.writeValueAsString(
                java.util.Map.of("recipeId", recipeId, "mealType", "dinner"));
        mockMvc.perform(post("/api/daily-menu/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(addBody))
                .andExpect(status().isOk());

        MvcResult menuResult = mockMvc.perform(get("/api/daily-menu/today")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        String menuJson = menuResult.getResponse().getContentAsString();
        assertThat(menuJson).contains(String.valueOf(recipeId));

        mockMvc.perform(post("/api/shopping-list/today/rebuild")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/shopping-list/today")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    @Test
    void phoneOtpLoginFlowWorks() throws Exception {
        String phone = "138" + String.format("%08d", (System.nanoTime() % 100000000));
        String reqBody = objectMapper.writeValueAsString(java.util.Map.of("phone", phone));
        MvcResult otpResult = mockMvc.perform(post("/api/auth/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reqBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").isNotEmpty())
                .andReturn();
        JsonNode otp = objectMapper.readTree(otpResult.getResponse().getContentAsString());
        String devCode = otp.get("devCode").asText();
        assertThat(devCode).isNotEmpty();

        String loginBody = objectMapper.writeValueAsString(
                java.util.Map.of("phone", phone, "code", devCode));
        mockMvc.perform(post("/api/auth/otp/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void otpLoginRejectsWrongCode() throws Exception {
        String phone = "139" + String.format("%08d", (System.nanoTime() % 100000000));
        mockMvc.perform(post("/api/auth/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("phone", phone))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/otp/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                java.util.Map.of("phone", phone, "code", "000000"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void feedbackSubmissionPersistsTicket() throws Exception {
        String token = guestLogin();
        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "types", java.util.List.of("bug"),
                "content", "测试反馈内容",
                "contact", "test@example.com"));
        mockMvc.perform(post("/api/feedback")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNotEmpty());
    }

    @Test
    void familyCreateInviteJoinAndRemoveFlowWorks() throws Exception {
        String ownerToken = guestLogin();
        String body = objectMapper.writeValueAsString(java.util.Map.of("name", "测试家庭" + System.nanoTime()));
        mockMvc.perform(post("/api/family")
                        .header("X-Auth-Token", ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.familyName").isNotEmpty());

        MvcResult inviteResult = mockMvc.perform(get("/api/family/invite-code")
                        .header("X-Auth-Token", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inviteCode").isNotEmpty())
                .andReturn();
        String inviteCode = objectMapper.readTree(inviteResult.getResponse().getContentAsString()).get("inviteCode").asText();

        mockMvc.perform(get("/api/family/join-preview")
                        .param("inviteCode", inviteCode)
                        .header("X-Auth-Token", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.familyName").isNotEmpty());

        String memberToken = guestLogin();
        MvcResult joined = mockMvc.perform(post("/api/family/join")
                        .header("X-Auth-Token", memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("inviteCode", inviteCode))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members").isArray())
                .andReturn();
        JsonNode members = objectMapper.readTree(joined.getResponse().getContentAsString()).get("members");
        long targetUserId = members.get(members.size() - 1).get("userId").asLong();

        mockMvc.perform(delete("/api/family/members/{userId}", targetUserId)
                        .header("X-Auth-Token", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members").isArray());
    }

    @Test
    void notificationsCanBeListedAndMarkedRead() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/notifications")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());

        mockMvc.perform(patch("/api/notifications/read")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("ids", java.util.List.of()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));
    }

    @Test
    void demoSeedDataSupportsLinkedPresentationPages() throws Exception {
        String token = guestLogin();

        MvcResult recipesResult = mockMvc.perform(get("/api/recipes?source=all")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode recipes = objectMapper.readTree(recipesResult.getResponse().getContentAsString());
        assertThat(recipes.size()).isGreaterThanOrEqualTo(12);

        MvcResult menuResult = mockMvc.perform(get("/api/daily-menu/today")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode menu = objectMapper.readTree(menuResult.getResponse().getContentAsString());
        assertThat(menu.get("items").size()).isGreaterThanOrEqualTo(2);

        MvcResult shoppingResult = mockMvc.perform(get("/api/shopping-list/today")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode shopping = objectMapper.readTree(shoppingResult.getResponse().getContentAsString());
        assertThat(shopping.get("items").size()).isGreaterThanOrEqualTo(4);

        MvcResult historyResult = mockMvc.perform(get("/api/cook-history")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode history = objectMapper.readTree(historyResult.getResponse().getContentAsString());
        assertThat(history.size()).isGreaterThanOrEqualTo(8);

        mockMvc.perform(get("/api/preference/profile")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCooks").isNumber())
                .andExpect(jsonPath("$.cuisinePrefs").isArray())
                .andExpect(jsonPath("$.tagPrefs").isArray());

        MvcResult pantryResult = mockMvc.perform(get("/api/pantry")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode pantry = objectMapper.readTree(pantryResult.getResponse().getContentAsString());
        assertThat(pantry.size()).isGreaterThanOrEqualTo(5);

        mockMvc.perform(get("/api/pantry/match")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());

        mockMvc.perform(get("/api/notifications")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }

    @Test
    void protectedEndpointRejectsMissingToken() throws Exception {
        mockMvc.perform(post("/api/shopping-list/today/rebuild"))
                .andExpect(status().isUnauthorized());
    }
}
