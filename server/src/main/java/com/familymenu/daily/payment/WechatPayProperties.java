package com.familymenu.daily.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.stereotype.Component;

/**
 * 微信支付 v3 商户配置（见 application.yml wechat.pay 段）。
 * 任一关键项为空 → WechatPayService.isConfigured() == false → prepay 降级 mockMode。
 */
@Component
@ConfigurationProperties(prefix = "wechat.pay")
public class WechatPayProperties {

    /** 商户号 */
    private String mchId = "";
    /** APIv3 密钥（32 位 ASCII，用于 AES-256-GCM 回调解密） */
    private String apiV3Key = "";
    /** 商户证书序列号 */
    private String certSerialNo = "";
    /** 商户私钥 PEM 文件路径（apiclient_key.pem） */
    private String privateKeyPath = "";
    /** 微信支付异步通知地址（公网 https） */
    private String notifyUrl = "";

    public String getMchId() { return mchId; }
    public void setMchId(String mchId) { this.mchId = mchId == null ? "" : mchId.trim(); }

    public String getApiV3Key() { return apiV3Key; }
    public void setApiV3Key(String apiV3Key) { this.apiV3Key = apiV3Key == null ? "" : apiV3Key.trim(); }

    public String getCertSerialNo() { return certSerialNo; }
    public void setCertSerialNo(String certSerialNo) { this.certSerialNo = certSerialNo == null ? "" : certSerialNo.trim(); }

    public String getPrivateKeyPath() { return privateKeyPath; }
    public void setPrivateKeyPath(String privateKeyPath) { this.privateKeyPath = privateKeyPath == null ? "" : privateKeyPath.trim(); }

    public String getNotifyUrl() { return notifyUrl; }
    public void setNotifyUrl(String notifyUrl) { this.notifyUrl = notifyUrl == null ? "" : notifyUrl.trim(); }
}