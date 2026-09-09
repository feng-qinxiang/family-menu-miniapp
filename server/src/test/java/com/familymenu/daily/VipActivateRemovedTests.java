package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 资损漏洞回归：遗留端点 POST /api/vip/activate 必须不可用。
 * 该端点原只需登录即可免费开通会员，已删除；本测试防止它被重新加回来。
 */
@SpringBootTest
@AutoConfigureMockMvc
class VipActivateRemovedTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "vip-bypass-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("token").asText();
    }

    @Test
    void vipActivateEndpointIsGoneForLoggedInUser() throws Exception {
        String token = guestLogin();
        // 端点不存在 → 404（NoResourceFoundException 被统一处理）
        mockMvc.perform(post("/api/vip/activate")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planName\":\"annual\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void vipActivateEndpointIsGoneForAnonymous() throws Exception {
        mockMvc.perform(post("/api/vip/activate")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"planName\":\"annual\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void vipStatusReadStillWorks() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/vip/status").header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }
}
