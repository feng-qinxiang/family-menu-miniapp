package com.familymenu.daily.config;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 入站图片路径归一的形状测试。
 *
 * 为什么单独钉：生产上小程序回传的是**绝对**签名链接（它展示网络图必须用完整 URL，
 * 于是自己把服务端给的相对路径拼上了 API 域名），而旧实现只认 {@code /uploads/} 开头，
 * 绝对形态整个漏网——带 {@code e=<过期>} 的链接直接进库，7 天后所有用户图片集体 404。
 * 本地签名默认关着，所以这条只在生产成立的路径必须用单测钉住，不能指望手点。
 */
class UploadPathNormalizerTests {

    private static final String BARE = "/uploads/3f9a.png";

    @Test
    void stripsSignatureFromRelativePath() {
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer.stripSignature(BARE + "?e=1700000000&k=abc"))
                .isEqualTo(BARE);
    }

    @Test
    void stripsSignatureFromAbsolutePath() {
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer
                .stripSignature("https://api.family.example.com" + BARE + "?e=1700000000&k=abc"))
                .isEqualTo(BARE);
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer
                .stripSignature("http://127.0.0.1:9088" + BARE + "?e=1700000000&k=abc"))
                .isEqualTo(BARE);
    }

    @Test
    void normalizesUnsignedAbsolutePathSoDbNeverStoresAHost() {
        // 库里存绝对地址等于把域名焊进每一行数据：换域名/上 CDN 时集体失效
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer
                .stripSignature("https://api.family.example.com" + BARE))
                .isEqualTo(BARE);
    }

    @Test
    void leavesBareRelativePathAlone() {
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer.stripSignature(BARE)).isEqualTo(BARE);
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer.stripSignature(null)).isNull();
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer.stripSignature("红烧肉")).isEqualTo("红烧肉");
    }

    @Test
    void neverTouchesExternalImages() {
        String ext = "https://cdn.other.com/photos/a.png?e=1&k=2";
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer.stripSignature(ext)).isEqualTo(ext);
        // /uploads/ 不在路径首位 = 不是本站上传目录，不能剥
        String lookalike = "https://cdn.other.com/assets/uploads/a.png";
        assertThat(UploadPathNormalizer.UploadPathStringDeserializer.stripSignature(lookalike)).isEqualTo(lookalike);
    }
}
