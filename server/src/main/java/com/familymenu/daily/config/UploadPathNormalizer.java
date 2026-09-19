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

        /**
         * 把「站内上传图」的任何形态（相对裸路径 / 相对带签名 / 绝对带签名）统一剥成
         * 库里该有的相对裸路径 {@code /uploads/xxx.png}。
         *
         * 绝对形态必须处理：小程序展示网络图片只能用完整 URL，所以它会把服务端给的相对路径
         * 自己拼上 API 域名（{@code miniapp/utils/upload.js} 的
         * {@code resolve(url.indexOf('http') === 0 ? url : `${base}${url}`)}），
         * 编辑菜谱/发帖时再把这个绝对值原样回传。只认相对前缀的话这条路径整个漏掉，
         * 带 {@code e=<过期>} 的链接就写进了库——本地签名默认关闭所以测不出来，
         * 生产上等于「所有用户图片在上传满 link-ttl（默认 7 天）后集体 404」。
         *
         * 外链一律不碰：只有 {@code /uploads/} 紧跟在 host 之后才算站内上传图。
         */
        static String stripSignature(String value) {
            if (value == null) {
                return null;
            }
            int start;
            if (value.startsWith(PREFIX)) {
                start = 0;
            } else {
                int scheme = value.indexOf("://");
                if (scheme < 0 || !(value.startsWith("http://") || value.startsWith("https://"))) {
                    return value;
                }
                int hostEnd = value.indexOf('/', scheme + 3);
                start = value.indexOf(PREFIX, scheme + 3);
                if (start < 0 || hostEnd != start) {
                    return value;
                }
            }
            String tail = value.substring(start);
            int q = tail.indexOf('?');
            if (q < 0 || !tail.substring(q).contains("k=")) {
                return tail;
            }
            return tail.substring(0, q);
        }
    }
}
