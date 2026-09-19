package com.familymenu.daily.config;

import com.familymenu.daily.auth.AuthInterceptor;
import com.familymenu.daily.auth.CurrentUserArgumentResolver;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.CacheControl;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.servlet.config.annotation.CorsRegistry;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.ResourceHandlerRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.List;

@Configuration
public class WebCorsConfig implements WebMvcConfigurer {

    private final String[] allowedOrigins;
    private final String uploadDir;
    private final AuthInterceptor authInterceptor;
    private final CurrentUserArgumentResolver currentUserArgumentResolver;
    private final UploadSigner.AccessInterceptor uploadAccessInterceptor;

    public WebCorsConfig(@Value("${cors.allowed-origins:}") String allowedOriginsCsv,
                         @Value("${upload.dir:uploads}") String uploadDir,
                         AuthInterceptor authInterceptor,
                         CurrentUserArgumentResolver currentUserArgumentResolver,
                         UploadSigner.AccessInterceptor uploadAccessInterceptor) {
        if (allowedOriginsCsv == null || allowedOriginsCsv.isBlank()) {
            this.allowedOrigins = new String[0];
        } else {
            String[] parts = allowedOriginsCsv.split(",");
            for (int i = 0; i < parts.length; i++) {
                parts[i] = parts[i].trim();
            }
            this.allowedOrigins = parts;
        }
        this.uploadDir = uploadDir;
        this.authInterceptor = authInterceptor;
        this.currentUserArgumentResolver = currentUserArgumentResolver;
        this.uploadAccessInterceptor = uploadAccessInterceptor;
    }

    @Override
    public void addCorsMappings(CorsRegistry registry) {
        if (allowedOrigins.length == 0) {
            return;
        }
        registry.addMapping("/api/**")
                .allowedOrigins(allowedOrigins)
                .allowedMethods("GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS")
                .allowedHeaders("Content-Type", "X-Auth-Token", "X-Device-Id", "Accept")
                .allowCredentials(false)
                .maxAge(3600);
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(authInterceptor)
                .addPathPatterns("/api/**")
                .excludePathPatterns("/api/auth/guest", "/api/auth/login");
        // 上传文件读取闸门（未启用签名时直接放行，本地零配置不受影响）
        registry.addInterceptor(uploadAccessInterceptor)
                .addPathPatterns("/uploads/**");
    }

    @Override
    public void addArgumentResolvers(List<HandlerMethodArgumentResolver> resolvers) {
        resolvers.add(currentUserArgumentResolver);
    }

    @Override
    public void addResourceHandlers(ResourceHandlerRegistry registry) {
        Path uploadRoot = Paths.get(uploadDir).toAbsolutePath().normalize();
        // 目录必须先存在：Path#toUri() 只在"确实是已存在的目录"时才补结尾斜杠，
        // 而首次部署时 uploads/ 还没建，location 会少了结尾 "/"，Spring 把它当文件而非目录，
        // 结果用户上传的封面能存进去却永久 404。这里既建目录也显式补斜杠。
        try {
            Files.createDirectories(uploadRoot);
        } catch (IOException ex) {
            throw new IllegalStateException("上传目录不可用: " + uploadRoot, ex);
        }
        String location = uploadRoot.toUri().toString();
        if (!location.endsWith("/")) {
            location = location + "/";
        }
        registry.addResourceHandler("/uploads/**").addResourceLocations(location);
        // 运营后台静态资源（classpath:/admin/），与 C 端 static/ 隔离。
        //
        // 必须显式设 no-cache：这里注册的自定义处理器**不会**继承
        // spring.web.resources.cache.cachecontrol 那套配置（那只作用于默认处理器），
        // 默认只发 Last-Modified，浏览器会按启发式缓存直接用旧副本 ——
        // 结果就是「新 HTML + 旧 CSS」，页面上新加的图标没有宽高约束被撑成巨图。
        // no-cache 不是不缓存，而是每次回服务器校验，没变照样 304，代价极小。
        registry.addResourceHandler("/admin/**")
                .addResourceLocations("classpath:/admin/")
                .setCacheControl(CacheControl.noCache().mustRevalidate());
    }
}
