package com.familymenu.daily.controller;

import org.springframework.stereotype.Controller;
import org.springframework.web.bind.annotation.GetMapping;

/**
 * 运营后台页面入口。静态资源位于 classpath:/admin/，与 C 端 static/ 隔离。
 * 页面本身不含数据，数据全部经 /api/admin/** 拉取（@RequiresAdmin 保护）。
 */
@Controller
public class AdminPageController {

    @GetMapping("/admin")
    public String adminIndex() {
        return "forward:/admin/index.html";
    }
}
