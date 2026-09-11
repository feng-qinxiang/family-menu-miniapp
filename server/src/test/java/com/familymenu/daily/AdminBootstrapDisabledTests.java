package com.familymenu.daily;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 引导登录在「未配置令牌」时必须等同于端点不存在。
 *
 * 为什么单独一个测试类：引导登录是短信网关没接时进后台的唯一入口，等同后台钥匙，
 * 因此它的"关闭态"必须被钉住 —— 没配 ADMIN_BOOTSTRAP_TOKEN 时任何人都不能从这里进后台，
 * 连"这里有个后门"这件事都不该对外暴露（所以是 404 而不是 403）。
 *
 * 这里刻意不设置 admin.bootstrap-token / admin.bootstrap-phone，走配置默认值（空）。
 * 依赖本地 MySQL（与既有测试一致）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminBootstrapDisabledTests {

    @Autowired
    private MockMvc mockMvc;

    @Test
    void bootstrapIsNotFoundWhenTokenNotConfigured() throws Exception {
        mockMvc.perform(post("/api/admin/auth/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"token\":\"any-token\"}"))
                .andExpect(status().isNotFound());
    }

    @Test
    void bootstrapIsNotFoundEvenWithoutBody() throws Exception {
        mockMvc.perform(post("/api/admin/auth/bootstrap")
                        .contentType(MediaType.APPLICATION_JSON))
                .andExpect(status().isNotFound());
    }
}
