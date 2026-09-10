package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 演示数据必须由 app.seed-demo-data 控制（生产固定 false）。
 *
 * 背景：这些数据曾经无条件地跟在登录路径上——每个真实新用户第一次进小程序，
 * 都会看到"别人家的"菜单、买菜清单、做菜记录和通知。那不是演示，是数据污染。
 * 这个测试锁住"关掉开关就真的不播种"，避免以后有人把它挂回登录路径。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "auth.dev-otp-enabled=true",
        "app.seed-demo-data=false"
})
class DemoSeedDisabledTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "no-demo-seed-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private JsonNode getJson(String path, String token) throws Exception {
        MvcResult result = mockMvc.perform(get(path).header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    @Test
    void newAccountStartsWithEmptyPersonalState() throws Exception {
        String token = guestLogin();

        // 个人状态全空：菜单 / 做菜记录 / 库存 / 通知
        assertThat(getJson("/api/daily-menu/today", token).get("items").size()).isZero();
        assertThat(getJson("/api/cook-history", token).size()).isZero();
        assertThat(getJson("/api/pantry", token).size()).isZero();
        assertThat(getJson("/api/notifications", token).get("items").size()).isZero();
    }

    @Test
    void globalRecipeLibraryStillAvailable() throws Exception {
        String token = guestLogin();
        // 关掉的是"给个人塞演示数据"，不是把菜谱库清空：公共种子菜谱仍然可见
        assertThat(getJson("/api/recipes?source=all", token).size()).isGreaterThan(0);
    }
}
