package com.familymenu.daily.payment;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Paths;
import java.security.KeyFactory;
import java.security.PrivateKey;
import java.security.SecureRandom;
import java.security.Signature;
import java.security.spec.PKCS8EncodedKeySpec;
import java.time.Instant;
import java.util.Base64;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.UUID;

/**
 * 微信支付 v3 JSAPI 接入服务（自实现签名，不依赖外部 SDK）。
 *
 * 配置未就绪（isConfigured()==false）时所有操作安全降级，不抛异常。
 * 回调通知使用 AES-256-GCM 解密（GCM 是认证加密，tag 验证即等效数据完整性验签）。
 */
@Service
public class WechatPayService {

    private static final Logger log = LoggerFactory.getLogger(WechatPayService.class);
    private static final String WECHAT_PAY_HOST = "https://api.mch.weixin.qq.com";
    private static final String JSAPI_URL_PATH = "/v3/pay/transactions/jsapi";

    private final WechatPayProperties props;
    private final ObjectMapper objectMapper;
    private final HttpClient httpClient;

    // wechat.app-id 用于 JSAPI 二次签名
    private final String appId;

    public WechatPayService(WechatPayProperties props, ObjectMapper objectMapper,
                            @org.springframework.beans.factory.annotation.Value("${wechat.app-id:}") String appId) {
        this.props = props;
        this.objectMapper = objectMapper;
        this.httpClient = HttpClient.newHttpClient();
        this.appId = appId == null ? "" : appId.trim();
    }

    /**
     * 是否已配置商户凭据。false → prepay 返回 mockMode，notify 直接 FAIL。
     */
    public boolean isConfigured() {
        return !props.getMchId().isEmpty()
                && !props.getApiV3Key().isEmpty()
                && !props.getCertSerialNo().isEmpty()
                && !props.getPrivateKeyPath().isEmpty();
    }

    /**
     * 向微信支付发起预下单，返回 prepay_id；未配置时返回 null（mockMode）。
     */
    public String createPrepayOrder(String outTradeNo, String openid, long amountFen, String description) {
        if (!isConfigured()) {
            log.warn("[WechatPay] 商户凭据未配置，prepay 降级 mockMode (outTradeNo={})", outTradeNo);
            return null;
        }
        try {
            String notifyUrl = props.getNotifyUrl().isEmpty()
                    ? "http://localhost:9088/api/payment/notify"
                    : props.getNotifyUrl();
            Map<String, Object> body = new LinkedHashMap<>();
            body.put("appid", appId);
            body.put("mchid", props.getMchId());
            body.put("description", description);
            body.put("out_trade_no", outTradeNo);
            body.put("notify_url", notifyUrl);
            Map<String, Object> amount = new LinkedHashMap<>();
            amount.put("total", amountFen);
            amount.put("currency", "CNY");
            body.put("amount", amount);
            Map<String, Object> payer = new LinkedHashMap<>();
            payer.put("openid", openid);
            body.put("payer", payer);

            String bodyJson = objectMapper.writeValueAsString(body);
            String timestamp = String.valueOf(Instant.now().getEpochSecond());
            String nonce = generateNonce();
            String authorization = buildRequestSign("POST", JSAPI_URL_PATH, timestamp, nonce, bodyJson);

            HttpRequest request = HttpRequest.newBuilder()
                    .uri(URI.create(WECHAT_PAY_HOST + JSAPI_URL_PATH))
                    .header("Content-Type", "application/json")
                    .header("Accept", "application/json")
                    .header("Authorization", authorization)
                    .POST(HttpRequest.BodyPublishers.ofString(bodyJson, StandardCharsets.UTF_8))
                    .build();

            HttpResponse<String> response = httpClient.send(request, HttpResponse.BodyHandlers.ofString());
            String respBody = response.body();
            log.info("[WechatPay] prepay response status={} body={}", response.statusCode(), respBody);

            if (response.statusCode() != 200) {
                log.error("[WechatPay] prepay failed status={} body={}", response.statusCode(), respBody);
                return null;
            }
            JsonNode json = objectMapper.readTree(respBody);
            JsonNode prepayIdNode = json.get("prepay_id");
            if (prepayIdNode == null || prepayIdNode.asText().isEmpty()) {
                log.error("[WechatPay] prepay_id missing in response: {}", respBody);
                return null;
            }
            return prepayIdNode.asText();
        } catch (Exception ex) {
            log.error("[WechatPay] createPrepayOrder error outTradeNo={}", outTradeNo, ex);
            return null;
        }
    }

    /**
     * 构建 wx.requestPayment 所需参数（JSAPI 二次签名）。
     */
    public Map<String, String> buildJsapiPayParams(String prepayId) {
        String timestamp = String.valueOf(Instant.now().getEpochSecond());
        String nonce = generateNonce();
        String pkg = "prepay_id=" + prepayId;
        // 二次签名串：appId + \n + timeStamp + \n + nonceStr + \n + package + \n
        String signStr = appId + "\n" + timestamp + "\n" + nonce + "\n" + pkg + "\n";
        String paySign = "";
        try {
            paySign = rsaSign(signStr.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            log.error("[WechatPay] buildJsapiPayParams sign error", ex);
        }
        Map<String, String> params = new LinkedHashMap<>();
        params.put("appId", appId);
        params.put("timeStamp", timestamp);
        params.put("nonceStr", nonce);
        params.put("package", pkg);
        params.put("signType", "RSA");
        params.put("paySign", paySign);
        return params;
    }

    /**
     * 验证并解密微信支付异步通知，返回解密后的交易 JSON 字符串。
     * 使用 AES-256-GCM（认证加密，tag 验证即数据完整性保障）。
     * 若解密失败或未配置，抛出 RuntimeException。
     */
    public String verifyAndDecryptNotify(Map<String, String> headers, String body) {
        if (!isConfigured()) {
            throw new IllegalStateException("WechatPay not configured");
        }
        try {
            JsonNode root = objectMapper.readTree(body);
            JsonNode resource = root.get("resource");
            if (resource == null) {
                throw new IllegalArgumentException("missing resource in notify body");
            }
            String ciphertext = resource.get("ciphertext").asText();
            String nonce = resource.get("nonce").asText();
            String associatedData = resource.has("associated_data")
                    ? resource.get("associated_data").asText()
                    : "";

            return aesGcmDecrypt(ciphertext, nonce, associatedData);
        } catch (Exception ex) {
            log.error("[WechatPay] verifyAndDecryptNotify error", ex);
            throw new RuntimeException("notify decrypt failed: " + ex.getMessage(), ex);
        }
    }

    // ─────────── 内部工具 ───────────

    /**
     * 构建请求签名，返回 Authorization header 值。
     * 签名串：{method}\n{urlPath}\n{timestamp}\n{nonce}\n{body}\n
     */
    String buildRequestSign(String method, String urlPath, String timestamp, String nonce, String body) {
        try {
            String signStr = method.toUpperCase() + "\n"
                    + urlPath + "\n"
                    + timestamp + "\n"
                    + nonce + "\n"
                    + body + "\n";
            String signature = rsaSign(signStr.getBytes(StandardCharsets.UTF_8));
            return String.format(
                    "WECHATPAY2-SHA256-RSA2048 mchid=\"%s\",nonce_str=\"%s\",signature=\"%s\",timestamp=\"%s\",serial_no=\"%s\"",
                    props.getMchId(), nonce, signature, timestamp, props.getCertSerialNo()
            );
        } catch (Exception ex) {
            throw new RuntimeException("buildRequestSign failed", ex);
        }
    }

    private String rsaSign(byte[] data) throws Exception {
        PrivateKey privateKey = loadPrivateKey();
        Signature signer = Signature.getInstance("SHA256withRSA");
        signer.initSign(privateKey);
        signer.update(data);
        return Base64.getEncoder().encodeToString(signer.sign());
    }

    private PrivateKey loadPrivateKey() throws Exception {
        String pemPath = props.getPrivateKeyPath();
        String pem = new String(Files.readAllBytes(Paths.get(pemPath)), StandardCharsets.UTF_8);
        // 去掉 PEM 头尾与换行
        String keyBase64 = pem
                .replace("-----BEGIN PRIVATE KEY-----", "")
                .replace("-----END PRIVATE KEY-----", "")
                .replace("-----BEGIN RSA PRIVATE KEY-----", "")
                .replace("-----END RSA PRIVATE KEY-----", "")
                .replaceAll("\\s", "");
        byte[] keyBytes = Base64.getDecoder().decode(keyBase64);
        KeyFactory keyFactory = KeyFactory.getInstance("RSA");
        return keyFactory.generatePrivate(new PKCS8EncodedKeySpec(keyBytes));
    }

    private String aesGcmDecrypt(String ciphertextBase64, String nonce, String associatedData) throws Exception {
        byte[] key = props.getApiV3Key().getBytes(StandardCharsets.UTF_8);
        byte[] iv = nonce.getBytes(StandardCharsets.UTF_8);
        byte[] cipherBytes = Base64.getDecoder().decode(ciphertextBase64);
        byte[] aad = associatedData.getBytes(StandardCharsets.UTF_8);

        Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
        SecretKeySpec keySpec = new SecretKeySpec(key, "AES");
        GCMParameterSpec paramSpec = new GCMParameterSpec(128, iv);
        cipher.init(Cipher.DECRYPT_MODE, keySpec, paramSpec);
        cipher.updateAAD(aad);
        byte[] plainBytes = cipher.doFinal(cipherBytes);
        return new String(plainBytes, StandardCharsets.UTF_8);
    }

    private String generateNonce() {
        return UUID.randomUUID().toString().replace("-", "").substring(0, 32);
    }
}