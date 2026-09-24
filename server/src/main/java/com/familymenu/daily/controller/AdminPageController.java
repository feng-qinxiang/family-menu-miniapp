package com.familymenu.daily.controller;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.ClassPathResource;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

import java.io.IOException;
import java.nio.charset.StandardCharsets;

/**
 * 运营后台页面入口。静态资源位于 classpath:/admin/，与 C 端 static/ 隔离。
 * 页面本身不含数据，数据全部经 /api/admin/** 拉取（@RequiresAdmin 保护）。
 */
@Controller
public class AdminPageController {

    /** 引导登录令牌；留空 = 未开启。 */
    private final boolean bootstrapConfigured;

    public AdminPageController(@Value("${admin.bootstrap-token:}") String bootstrapToken,
                               @Value("${admin.bootstrap-phone:}") String bootstrapPhone) {
        this.bootstrapConfigured = bootstrapToken != null && !bootstrapToken.trim().isEmpty()
                && bootstrapPhone != null && !bootstrapPhone.trim().isEmpty();
    }

    /**
     * 三个映射都要：
     *  - "/admin"、"admin/"：手输、外链、反代改写都会带尾斜杠；只写一个时另一种会落到全局异常处理器上，
     *    浏览器里只剩一句 {"error":"接口不存在"} —— 看起来像"后台打不开"。
     *  - "/admin/index.html"：直连这个地址也要能进（否则它绕过了下面这处渲染，
     *    页面上会少了「引导令牌」这条唯一的入口）。静态资源处理器优先级低于控制器映射，这里能接住。
     *
     * 页面的 HTML 由服务端渲染一次：只替换一个「引导登录是否可用」的标记。
     * 前端原来是自己打接口探测（空令牌打 POST /api/admin/auth/bootstrap，404 才算没配），
     * 而那个端点有 5 次/分钟的限流且限流计数不看响应码：同一分钟刷新登录页 5 次，
     * 第 6 次连真正的引导登录也会吃 429 —— 唯一进得去的入口就这么没了。
     * 服务端本来就知道答案（ADMIN_BOOTSTRAP_TOKEN 配没配），直接写进页面就没有这次探测。
     */
    @GetMapping({"/admin", "/admin/", "/admin/index.html"})
    public ResponseEntity<String> adminIndex() throws IOException {
        String html;
        try (var in = new ClassPathResource("admin/index.html").getInputStream()) {
            html = new String(in.readAllBytes(), StandardCharsets.UTF_8);
        }
        return ResponseEntity.ok()
                .contentType(new MediaType(MediaType.TEXT_HTML, StandardCharsets.UTF_8))
                .body(html.replace("__ADMIN_BOOTSTRAP_AVAILABLE__", String.valueOf(bootstrapConfigured)));
    }
}
