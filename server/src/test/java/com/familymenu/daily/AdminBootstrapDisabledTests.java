package com.familymenu.daily;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.assertj.core.api.Assertions.assertThat;

/**
 * 引导登录在「未配置令牌」时必须等同于端点不存在。
 *
 * 为什么单独一个测试类：引导登录是短信网关没接时进后台的唯一入口，等同后台钥匙，
 * 因此它的"关闭态"必须被钉住 —— 没配 ADMIN_BOOTSTRAP_TOKEN 时任何人都不能从这里进后台，
 * 连"这里有个后门"这件事都不该对外暴露（所以是 404 而不是 403）。
 *
 * 这里刻意不设置 admin.bootstrap-token / admin.bootstrap-phone，走配置默认值（空）。
 * 依赖本地 MySQL（与既有测试一致）。
 *
 * properties 里显式置空是必须的：OS 环境变量在 Spring 的优先级里高于 application.properties，
 * 所以本地照着文档导出过 ADMIN_BOOTSTRAP_TOKEN 的人（或 CI 里配了这个变量）跑测试时，
 * 令牌会被自动配上，这两条断言就变成"期望 404 实得 401"的假红。
 * 只有 @SpringBootTest(properties=…) / @TestPropertySource 这一层压得住环境变量。
 */
@SpringBootTest(properties = {"admin.bootstrap-token=", "admin.bootstrap-phone="})
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

    /**
     * 登录页的「引导令牌」入口由服务端渲染，没配就整条不显示。
     *
     * 前端原来是自己打这个 404 接口探测（有 5 次/分钟的限流，且空令牌探测会在控制台留一条 401）。
     * 这里钉住两端：页面上的标记必须是替换后的值，占位符不许原样发出去。
     */
    @Test
    void loginPageDoesNotAdvertiseBootstrapWhenNotConfigured() throws Exception {
        String html = mockMvc.perform(get("/admin/"))
                .andExpect(status().isOk())
                .andReturn().getResponse().getContentAsString();
        assertThat(html).contains("data-bootstrap-login=\"false\"");
        assertThat(html).as("占位符没被替换，前端会把它当成字符串读")
                .doesNotContain("__ADMIN_BOOTSTRAP_AVAILABLE__");
    }
}
