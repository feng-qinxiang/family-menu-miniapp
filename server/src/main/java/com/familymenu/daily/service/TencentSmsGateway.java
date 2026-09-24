package com.familymenu.daily.service;

import com.familymenu.daily.config.WechatHttp;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;

/**
 * 腾讯云短信（SendSms 2021-01-11，签名方法 v3 / TC3-HMAC-SHA256）。
 *
 * 启用：SMS_PROVIDER=tencent，并填齐 SMS_TENCENT_* 五项（见 application.yml 的 sms.tencent）。
 * 缺任何一项启动即失败——宁可起不来，也不要"界面说已发送、短信永远不来"。
 *
 * ponytail: 手写签名而不引 tencentcloud-sdk-java（不加依赖）。签名逻辑按官方文档示例做了
 * 固定向量测试（TencentSmsGatewayTests）；模板只传一个变量 {1}=验证码，
 * 需要"{2} 分钟内有效"之类的多变量模板时，在 TemplateParamSet 里追加即可。
 */
@Component
@ConditionalOnProperty(name = "sms.provider", havingValue = "tencent")
public class TencentSmsGateway implements SmsGateway {

    private static final Logger log = LoggerFactory.getLogger(TencentSmsGateway.class);
    private static final String HOST = "sms.tencentcloudapi.com";
    private static final String CONTENT_TYPE = "application/json; charset=utf-8";
    private static final String ACTION = "SendSms";

    private final String secretId;
    private final String secretKey;
    private final String sdkAppId;
    private final String signName;
    private final String templateId;
    private final String region;
    private final ObjectMapper objectMapper;
    private final RestClient restClient = WechatHttp.create();

    public TencentSmsGateway(@Value("${sms.tencent.secret-id:}") String secretId,
                             @Value("${sms.tencent.secret-key:}") String secretKey,
                             @Value("${sms.tencent.sdk-app-id:}") String sdkAppId,
                             @Value("${sms.tencent.sign-name:}") String signName,
                             @Value("${sms.tencent.template-id:}") String templateId,
                             @Value("${sms.tencent.region:ap-guangzhou}") String region,
                             ObjectMapper objectMapper) {
        this.secretId = secretId.trim();
        this.secretKey = secretKey.trim();
        this.sdkAppId = sdkAppId.trim();
        this.signName = signName.trim();
        this.templateId = templateId.trim();
        this.region = region.trim();
        this.objectMapper = objectMapper;
        if (this.secretId.isEmpty() || this.secretKey.isEmpty() || this.sdkAppId.isEmpty()
                || this.signName.isEmpty() || this.templateId.isEmpty()) {
            throw new IllegalStateException("SMS_PROVIDER=tencent 但腾讯云短信配置不全：需要 SMS_TENCENT_SECRET_ID / "
                    + "SMS_TENCENT_SECRET_KEY / SMS_TENCENT_SDK_APP_ID / SMS_TENCENT_SIGN_NAME / SMS_TENCENT_TEMPLATE_ID");
        }
    }

    @Override
    public void send(String phone, String code) {
        String payload;
        try {
            payload = objectMapper.writeValueAsString(Map.of(
                    "PhoneNumberSet", List.of("+86" + phone),
                    "SmsSdkAppId", sdkAppId,
                    "SignName", signName,
                    "TemplateId", templateId,
                    "TemplateParamSet", List.of(code)));
        } catch (Exception ex) {
            throw new IllegalStateException("sms payload build failed", ex);
        }
        long timestamp = Instant.now().getEpochSecond();
        String body;
        try {
            body = restClient.post().uri("https://" + HOST)
                    .header("Authorization", authorization(secretId, secretKey, timestamp, payload))
                    .header("Content-Type", CONTENT_TYPE)
                    .header("Host", HOST)
                    .header("X-TC-Action", ACTION)
                    .header("X-TC-Timestamp", String.valueOf(timestamp))
                    .header("X-TC-Version", "2021-01-11")
                    .header("X-TC-Region", region)
                    .body(payload)
                    .retrieve()
                    .body(String.class);
        } catch (Exception ex) {
            log.error("[SMS] 腾讯云短信请求失败: {}", ex.getClass().getSimpleName());
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "短信发送失败，请稍后重试");
        }
        String errorCode = sendErrorCode(body);
        if (errorCode != null) {
            // 只记错误码（不记手机号 / 验证码）：常见为签名/模板未审核、频控、余额不足
            log.error("[SMS] 腾讯云短信发送失败 code={}", errorCode);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "短信发送失败，请稍后重试");
        }
    }

    /** 成功返回 null；否则返回腾讯云错误码（接口级 Error.Code 或单条 SendStatusSet[0].Code）。 */
    String sendErrorCode(String body) {
        try {
            JsonNode resp = objectMapper.readTree(body == null ? "{}" : body).path("Response");
            if (resp.has("Error")) {
                return resp.path("Error").path("Code").asText("Unknown");
            }
            String status = resp.path("SendStatusSet").path(0).path("Code").asText("");
            return "Ok".equals(status) ? null : (status.isEmpty() ? "EmptyResponse" : status);
        } catch (Exception ex) {
            return "UnparsableResponse";
        }
    }

    static String authorization(String secretId, String secretKey, long timestamp, String payload) {
        String date = Instant.ofEpochSecond(timestamp).atZone(ZoneOffset.UTC).toLocalDate().toString();
        String scope = date + "/sms/tc3_request";
        String stringToSign = "TC3-HMAC-SHA256\n" + timestamp + "\n" + scope + "\n"
                + sha256Hex(canonicalRequest(HOST, ACTION, payload));
        byte[] key = hmac(("TC3" + secretKey).getBytes(StandardCharsets.UTF_8), date);
        key = hmac(key, "sms");
        key = hmac(key, "tc3_request");
        return "TC3-HMAC-SHA256 Credential=" + secretId + "/" + scope
                + ", SignedHeaders=content-type;host;x-tc-action, Signature="
                + HexFormat.of().formatHex(hmac(key, stringToSign));
    }

    static String canonicalRequest(String host, String action, String payload) {
        return "POST\n/\n\n"
                + "content-type:" + CONTENT_TYPE + "\nhost:" + host + "\nx-tc-action:" + action.toLowerCase() + "\n\n"
                + "content-type;host;x-tc-action\n"
                + sha256Hex(payload);
    }

    static String sha256Hex(String s) {
        try {
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(s.getBytes(StandardCharsets.UTF_8)));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    private static byte[] hmac(byte[] key, String msg) {
        try {
            Mac mac = Mac.getInstance("HmacSHA256");
            mac.init(new SecretKeySpec(key, "HmacSHA256"));
            return mac.doFinal(msg.getBytes(StandardCharsets.UTF_8));
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }
}
