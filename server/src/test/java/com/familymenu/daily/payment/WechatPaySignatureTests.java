package com.familymenu.daily.payment;

import org.junit.jupiter.api.Test;

import java.nio.charset.StandardCharsets;
import java.security.KeyPair;
import java.security.KeyPairGenerator;
import java.security.PublicKey;
import java.security.Signature;
import java.util.Base64;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 微信支付回调验签的纯单元测试（不需要商户凭据、不连数据库）。
 * 用临时生成的 RSA 密钥对模拟"平台私钥签名 → 平台公钥验签"。
 */
class WechatPaySignatureTests {

    private final WechatPayService service =
            new WechatPayService(new WechatPayProperties(), new com.fasterxml.jackson.databind.ObjectMapper(), "");

    private static KeyPair generateKeyPair() throws Exception {
        KeyPairGenerator generator = KeyPairGenerator.getInstance("RSA");
        generator.initialize(2048);
        return generator.generateKeyPair();
    }

    private static String sign(KeyPair keyPair, String timestamp, String nonce, String body) throws Exception {
        String signStr = timestamp + "\n" + nonce + "\n" + body + "\n";
        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(keyPair.getPrivate());
        signer.update(signStr.getBytes(StandardCharsets.UTF_8));
        return Base64.getEncoder().encodeToString(signer.sign());
    }

    @Test
    void validSignaturePasses() throws Exception {
        KeyPair kp = generateKeyPair();
        String ts = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = "abc123";
        String body = "{\"id\":\"evt-1\",\"resource\":{\"ciphertext\":\"x\"}}";
        String sig = sign(kp, ts, nonce, body);

        assertThat(service.verifyWithPublicKey(kp.getPublic(), ts, nonce, body, sig)).isTrue();
    }

    @Test
    void tamperedBodyFails() throws Exception {
        KeyPair kp = generateKeyPair();
        String ts = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = "abc123";
        String body = "{\"id\":\"evt-1\"}";
        String sig = sign(kp, ts, nonce, body);

        String tampered = "{\"id\":\"evt-1\",\"amount\":{\"total\":1}}";
        assertThat(service.verifyWithPublicKey(kp.getPublic(), ts, nonce, tampered, sig)).isFalse();
    }

    @Test
    void tamperedTimestampFails() throws Exception {
        KeyPair kp = generateKeyPair();
        String ts = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = "abc123";
        String body = "{\"id\":\"evt-1\"}";
        String sig = sign(kp, ts, nonce, body);

        assertThat(service.verifyWithPublicKey(kp.getPublic(), "1", nonce, body, sig)).isFalse();
    }

    @Test
    void wrongKeyFails() throws Exception {
        KeyPair signer = generateKeyPair();
        KeyPair other = generateKeyPair();
        String ts = String.valueOf(System.currentTimeMillis() / 1000);
        String nonce = "abc123";
        String body = "{\"id\":\"evt-1\"}";
        String sig = sign(signer, ts, nonce, body);

        assertThat(service.verifyWithPublicKey(other.getPublic(), ts, nonce, body, sig)).isFalse();
    }

    @Test
    void garbageSignatureFailsClosed() throws Exception {
        KeyPair kp = generateKeyPair();
        PublicKey pub = kp.getPublic();
        assertThat(service.verifyWithPublicKey(pub, "1", "n", "b", "not-base64!!")).isFalse();
    }
}
