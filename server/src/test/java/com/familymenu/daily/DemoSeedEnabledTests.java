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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 打开演示数据开关（app.seed-demo-data=true）时的行为。
 *
 * 与 {@link DemoSeedDisabledTests} 成对：那边锁住"默认关掉时不播种"，这边锁住
 * "显式打开后，联动页面（菜单/购物清单/做菜记录/库存）确实有数据可演示"。
 *
 * 为什么要单独一个类：属性是类级别的，而绝大多数测试都应该跑在默认（不播种）的库上 ——
 * 演示数据一旦变成所有测试的隐含前提，真实用户的空场景就没人测了。
 * 这也是当初"演示数据默认开启"埋下的坑：测试全绿，真实新用户第一屏却是别人家的菜单。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "app.seed-demo-data=true")
class DemoSeedEnabledTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "demo-enabled-" + System.nanoTime()))
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
    void seedDataSupportsLinkedPresentationPages() throws Exception {
        String token = guestLogin();

        assertThat(getJson("/api/recipes?source=all", token).size()).isGreaterThanOrEqualTo(12);
        assertThat(getJson("/api/daily-menu/today", token).get("items").size()).isGreaterThanOrEqualTo(2);
        assertThat(getJson("/api/shopping-list/today", token).get("items").size()).isGreaterThanOrEqualTo(4);
        assertThat(getJson("/api/cook-history", token).size()).isGreaterThanOrEqualTo(8);
        assertThat(getJson("/api/pantry", token).size()).isGreaterThanOrEqualTo(5);

        mockMvc.perform(get("/api/preference/profile").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.totalCooks").isNumber())
                .andExpect(jsonPath("$.cuisinePrefs").isArray())
                .andExpect(jsonPath("$.tagPrefs").isArray());
        mockMvc.perform(get("/api/pantry/match").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$").isArray());
        mockMvc.perform(get("/api/notifications").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());
    }
}
