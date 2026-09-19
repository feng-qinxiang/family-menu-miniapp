package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 部署侧存活探针 /healthz。
 *
 * 钉三件事，都是"上线那天才会发现"的：
 *  1. 不带任何 token 就能 200 —— 鉴权拦截器只吃 /api/**，所以探针挂在 /healthz。
 *     哪天有人把它挪进 /api/** 或收紧白名单，uptime 监控就会集体报红，而小程序一切正常。
 *  2. 它真的打库（db=UP 来自 SELECT 1，不是写死的字符串）—— 否则库挂了探针还是绿的，等于没有。
 *  3. 响应只有 status/db 两个字段 —— 匿名端点，将来谁往里加驱动版本、URL、异常信息就是白送情报。
 */
@SpringBootTest
@AutoConfigureMockMvc
class HealthEndpointTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Test
    void healthIsPublicAndReportsRealDatabaseState() throws Exception {
        MvcResult result = mockMvc.perform(get("/healthz"))
                .andExpect(status().isOk())
                .andReturn();
        String body = result.getResponse().getContentAsString();
        JsonNode json = objectMapper.readTree(body);
        assertThat(json.get("status").asText()).isEqualTo("UP");
        assertThat(json.get("db").asText()).isEqualTo("UP");
        assertThat(result.getResponse().getContentType()).startsWith(MediaType.APPLICATION_JSON_VALUE);
    }

    @Test
    void healthDoesNotLeakInternals() throws Exception {
        MvcResult result = mockMvc.perform(get("/healthz")).andReturn();
        JsonNode json = objectMapper.readTree(result.getResponse().getContentAsString());
        assertThat(json.size()).as("匿名端点只允许 status/db 两个字段").isEqualTo(2);
        String body = result.getResponse().getContentAsString().toLowerCase();
        assertThat(body).doesNotContain("jdbc").doesNotContain("mysql").doesNotContain("exception");
    }
}
