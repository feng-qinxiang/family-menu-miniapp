package com.familymenu.daily.config;

import com.fasterxml.jackson.core.JsonParser;
import com.fasterxml.jackson.databind.DeserializationContext;
import com.fasterxml.jackson.databind.module.SimpleModule;
import com.fasterxml.jackson.databind.deser.std.StringDeserializer;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.io.IOException;

/**
 * 入站图片路径归一。
 *
 * 为什么要：响应里的 {@code /uploads/xxx.png} 会被签成
 * {@code /uploads/xxx.png?e=<过期>&k=<签名>} 供小程序展示；而小程序把"看到的值"原样回传
 * （改菜谱时把封面、发帖时把配图列表再 POST 回来）。若不剥掉签名，带过期的链接就写进了库，
 * 到期后图片永久 404，而且签名串会在一次次编辑中叠加。
 *
 * 放在 Jackson 入口而不是各个写库处：图片字段散落在菜谱封面、步骤图、头像、帖子配图、
 * 反馈截图等多处，逐处清洗必漏。命中条件很窄（站内上传路径且带 k= 参数），其余字符串原样返回。
 */
@Configuration
public class UploadPathNormalizer {

    @Bean
    public SimpleModule uploadPathModule() {
        SimpleModule module = new SimpleModule("uploadPathNormalizer");
        module.addDeserializer(String.class, new UploadPathStringDeserializer());
        return module;
    }

    static class UploadPathStringDeserializer extends StringDeserializer {

        private static final String PREFIX = "/uploads/";

        @Override
        public String deserialize(JsonParser p, DeserializationContext ctxt) throws IOException {
            String value = super.deserialize(p, ctxt);
            return stripSignature(value);
        }

        private static String stripSignature(String value) {
            if (value == null || !value.startsWith(PREFIX)) {
                return value;
            }
            int q = value.indexOf('?');
            if (q < 0 || !value.contains("k=")) {
                return value;
            }
            return value.substring(0, q);
        }
    }
}
