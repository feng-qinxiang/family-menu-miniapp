package com.familymenu.daily.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;

/**
 * 为上传文件与运营后台补安全响应头。
 *
 * 关于 /uploads/** 的鉴权取舍：
 * 小程序 <image> 组件无法发送自定义请求头，若在此强制校验 token 会导致全部菜图/头像裂开；
 * 且图片 URL 已持久化在 recipe.cover_image 等列，签名 URL 会因过期使存量数据失效。
 * 因此采用「UUID 随机文件名 = 不可枚举的能力 URL（122 bit 熵）」+ 以下响应头加固：
 *  - X-Content-Type-Options: nosniff  阻止浏览器嗅探把 .bin 当 HTML/脚本执行
 *  - Content-Security-Policy: sandbox  让直接访问上传文件时无法执行脚本
 *  - X-Frame-Options: DENY            防被嵌入 iframe 做点击劫持
 */
@Component
public class SecurityHeadersFilter extends OncePerRequestFilter {

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
            throws ServletException, IOException {
        String path = request.getRequestURI();
        if (path != null) {
            if (path.startsWith("/uploads/")) {
                response.setHeader("X-Content-Type-Options", "nosniff");
                // 直接打开上传文件时禁止执行脚本，并禁止被嵌入
                response.setHeader("Content-Security-Policy", "sandbox; default-src 'none'");
                response.setHeader("X-Frame-Options", "DENY");
            } else if (path.startsWith("/admin")) {
                response.setHeader("X-Content-Type-Options", "nosniff");
                response.setHeader("X-Frame-Options", "DENY");
                response.setHeader("Referrer-Policy", "no-referrer");
                // 后台只加载自身静态资源，不引外部脚本
                response.setHeader("Content-Security-Policy",
                        "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; "
                                + "connect-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
            }
        }
        chain.doFilter(request, response);
    }
}
