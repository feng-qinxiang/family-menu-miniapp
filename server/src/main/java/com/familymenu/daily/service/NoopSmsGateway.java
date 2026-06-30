package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 默认短信网关：未接入真实供应商时自动生效。
 * 落库（由 AuthService 完成）+ 日志告警；dev 模式下 AuthService 会在响应中回显 devCode，
 * 此处仅补一条 WARN，不静默假装发送成功。
 *
 * 注意：使用 @Configuration + @Bean + @ConditionalOnMissingBean，
 * 避免 @Component 自引用导致条件评估失败的 Spring Boot 已知问题。
 */
public class NoopSmsGateway implements SmsGateway {

    private static final Logger log = LoggerFactory.getLogger(NoopSmsGateway.class);

    @Override
    public void send(String phone, String code) {
        // 脱敏：只显示末 4 位
        String maskedPhone = phone.length() >= 4
                ? "***" + phone.substring(phone.length() - 4)
                : "***";
        log.warn("[SMS] 短信网关未配置，验证码未发送 (phone={})。配置 SMS_PROVIDER 接入真实供应商。", maskedPhone);
    }

    /** 默认 SMS 网关注册：若已有其他 SmsGateway Bean（如阿里云/腾讯云实现）则跳过。 */
    @Configuration
    static class Config {
        @Bean
        @ConditionalOnMissingBean(SmsGateway.class)
        SmsGateway noopSmsGateway() {
            return new NoopSmsGateway();
        }
    }
}