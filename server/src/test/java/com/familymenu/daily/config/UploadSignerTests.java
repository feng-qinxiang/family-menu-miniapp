package com.familymenu.daily.config;

import org.junit.jupiter.api.Test;

import java.time.Instant;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 上传链接签名的「同一周期内 URL 必须稳定」契约。
 *
 * 为什么单独钉：签名串是 URL 的一部分，而小程序/浏览器都按**完整 URL** 建图片缓存键。
 * 旧实现 {@code exp = now + ttl} 每算一次都不一样，等于每次接口响应都换一个新链接，
 * 缓存永远 miss——同一张菜图每进一屏重下一遍。改成按 TTL 分桶后才有缓存可言，
 * 而「分桶」这件事一旦被改回 now+ttl 就静默退化（功能上没坏，只是图片又开始反复下载），
 * 所以钉在这里。
 */
class UploadSignerTests {

    private static final long TTL = 3600L;

    @Test
    void expiryIsBucketedSoTheSameUrlStaysByteIdentical() {
        UploadSigner signer = new UploadSigner("test-secret", TTL, "");
        String first = signer.sign("/uploads/abc.png");
        String second = signer.sign("/uploads/abc.png");

        assertThat(second).as("同一张图两次签名必须给出完全相同的链接，否则缓存无从命中")
                .isEqualTo(first);

        long exp = expOf(first);
        long now = Instant.now().getEpochSecond();
        assertThat(exp % TTL).as("exp 落在 TTL 边界上（分桶）而不是 now+TTL").isZero();
        assertThat(exp - now).as("剩余有效期仍要 ≥ 一个 TTL，不能刚发出去就快到期")
                .isGreaterThanOrEqualTo(TTL - 1).isLessThanOrEqualTo(2 * TTL);
    }

    @Test
    void signedUrlPassesItsOwnGate() {
        UploadSigner signer = new UploadSigner("test-secret", TTL, "");
        String signed = signer.sign("/uploads/abc.png");
        String query = signed.substring(signed.indexOf('?') + 1);
        String exp = queryParam(query, "e");
        String sig = queryParam(query, "k");

        assertThat(signer.accepts("/uploads/abc.png", exp, sig)).isTrue();
        assertThat(signer.accepts("/uploads/other.png", exp, sig))
                .as("换路径必须失配：签名覆盖 path|exp").isFalse();
    }

    @Test
    void signingStaysOffForLocalDevButFailsProdWithoutSecret() {
        UploadSigner off = new UploadSigner("", TTL, "");
        assertThat(off.sign("/uploads/abc.png")).isEqualTo("/uploads/abc.png");
        assertThat(off.enabled()).isFalse();
        assertThat(off.accepts("/uploads/abc.png", null, null)).as("关闭时闸门放行").isTrue();

        org.junit.jupiter.api.Assertions.assertThrows(IllegalStateException.class,
                () -> new UploadSigner("", TTL, "prod"),
                "生产环境缺密钥必须启动失败，不能静默退回公开链接");
    }

    private static long expOf(String signedUrl) {
        return Long.parseLong(queryParam(signedUrl.substring(signedUrl.indexOf('?') + 1), "e"));
    }

    private static String queryParam(String query, String name) {
        for (String pair : query.split("&")) {
            int eq = pair.indexOf('=');
            if (eq > 0 && pair.substring(0, eq).equals(name)) {
                return pair.substring(eq + 1);
            }
        }
        throw new AssertionError("签名链接缺少参数 " + name + "：" + query);
    }
}
