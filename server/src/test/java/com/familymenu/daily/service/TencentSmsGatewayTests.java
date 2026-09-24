package com.familymenu.daily.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 腾讯云 TC3 签名：用官方文档（签名方法 v3）示例里与密钥无关的中间值做固定向量。 */
class TencentSmsGatewayTests {

    private static final String DOC_PAYLOAD =
            "{\"Limit\": 1, \"Filters\": [{\"Values\": [\"\\u672a\\u547d\\u540d\"], \"Name\": \"instance-name\"}]}";

    @Test
    void canonicalRequestMatchesOfficialExample() {
        assertThat(TencentSmsGateway.sha256Hex(DOC_PAYLOAD))
                .isEqualTo("35e9c5b0e3ae67532d3c9f17ead6c90222632e5b1ff7f6e89887f1398934f064");
        assertThat(TencentSmsGateway.sha256Hex(
                TencentSmsGateway.canonicalRequest("cvm.tencentcloudapi.com", "DescribeInstances", DOC_PAYLOAD)))
                .isEqualTo("7019a55be8395899b900fb5564e4200d984910f34794a27cb3fb7d10ff6a1e84");
    }

    @Test
    void credentialScopeUsesUtcDate() {
        // 1551113065 = 东八区 2019-02-26 00:44，UTC 仍是 02-25：用本地时区会在凌晨必然验签失败
        assertThat(TencentSmsGateway.authorization("AKIDtest", "key", 1551113065L, "{}"))
                .startsWith("TC3-HMAC-SHA256 Credential=AKIDtest/2019-02-25/sms/tc3_request, SignedHeaders=content-type;host;x-tc-action, Signature=");
    }

    @Test
    void responseParsingAndMissingConfig() {
        TencentSmsGateway gw = new TencentSmsGateway("id", "key", "1400000000", "签名", "123", "ap-guangzhou", new ObjectMapper());
        assertThat(gw.sendErrorCode("{\"Response\":{\"SendStatusSet\":[{\"Code\":\"Ok\"}],\"RequestId\":\"x\"}}")).isNull();
        assertThat(gw.sendErrorCode("{\"Response\":{\"SendStatusSet\":[{\"Code\":\"LimitExceeded.PhoneNumberDailyLimit\"}]}}"))
                .isEqualTo("LimitExceeded.PhoneNumberDailyLimit");
        assertThat(gw.sendErrorCode("{\"Response\":{\"Error\":{\"Code\":\"AuthFailure.SignatureFailure\"}}}"))
                .isEqualTo("AuthFailure.SignatureFailure");
        assertThat(gw.sendErrorCode("not json")).isEqualTo("UnparsableResponse");
        assertThatThrownBy(() -> new TencentSmsGateway("id", "", "1400000000", "签名", "123", "ap-guangzhou", new ObjectMapper()))
                .hasMessageContaining("SMS_TENCENT_SECRET_KEY");
    }
}
