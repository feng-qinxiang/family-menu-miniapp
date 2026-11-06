package com.familymenu.daily;

import com.familymenu.daily.auth.AuthInterceptor;
import com.familymenu.daily.auth.CurrentUserArgumentResolver;
import com.familymenu.daily.config.UploadSigner;
import com.familymenu.daily.config.WebCorsConfig;
import org.junit.jupiter.api.Test;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.mock.web.MockServletContext;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.context.support.AnnotationConfigWebApplicationContext;
import org.springframework.web.servlet.config.annotation.EnableWebMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.head;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class StaticDishAssetsTests {
    @Configuration
    @EnableWebMvc
    static class AssetsConfig {
        @Bean
        WebCorsConfig webConfig() {
            return new WebCorsConfig("", "target/test-dish-uploads", 604800,
                    mock(AuthInterceptor.class), mock(CurrentUserArgumentResolver.class),
                    mock(UploadSigner.AccessInterceptor.class));
        }
    }

    @Test
    void stockPhotosArePublicCacheableAndRestrictedToTheAssetDirectory() throws Exception {
        // 使用生产资源配置，不启数据库，也不关闭正式的登录/上传签名规则。
        try (var context = new AnnotationConfigWebApplicationContext()) {
            context.setServletContext(new MockServletContext());
            context.register(AssetsConfig.class);
            context.refresh();
            MockMvc mvc = MockMvcBuilders.webAppContextSetup(context).build();
            var photos = new PathMatchingResourcePatternResolver()
                    .getResources("classpath:/static/assets/dishes/*.jpg");
            assertThat(photos).hasSize(19);
            for (var photo : photos) {
                String url = "/assets/dishes/" + photo.getFilename();
                var response = mvc.perform(get(url))
                        .andExpect(status().isOk())
                        .andExpect(content().contentType("image/jpeg"))
                        .andExpect(header().string("Cache-Control", "max-age=604800, public"))
                        .andExpect(content().bytes(photo.getContentAsByteArray()))
                        .andReturn().getResponse();
                mvc.perform(head(url)).andExpect(status().isOk()).andExpect(content().string(""));
                mvc.perform(get(url).header("If-Modified-Since", response.getHeader("Last-Modified")))
                        .andExpect(status().isNotModified());
            }
            mvc.perform(get("/assets/dishes/missing.jpg")).andExpect(status().isNotFound());
            mvc.perform(get("/assets/dishes/../../application.yml")).andExpect(status().isNotFound());
        }
    }
}
