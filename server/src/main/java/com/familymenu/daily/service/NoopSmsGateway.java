package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnExpression;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * 默认短信网关：未接入真实供应商时自动生效。
 * 落库（由 AuthService 完成）+ 日志告警；dev 模式下 AuthService 会在响应中回显 devCode，
 * 此处仅补一条 WARN，不静默假装发送成功。
 *
 * 注意：使用 @Configuration + @Bean（按 sms.provider 条件注册），
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

    /**
     * 明确告诉调用方"发不出去"。
     *
     * 之前这里只打一条 WARN，接口照样返回"验证码已发送"，
     * 本地开发没开 AUTH_DEV_OTP_ENABLED 时就是死胡同：
     * 界面上说发了，短信永远不会来，码又只以哈希形式落库，谁都不知道是多少。
     */
    @Override
    public boolean configured() {
        return false;
    }

    /**
     * 默认 SMS 网关注册：sms.provider 不是已接入的供应商时生效。
     * 用属性而不是 @ConditionalOnMissingBean 判断：后者对组件扫描出来的 TencentSmsGateway
     * 求值顺序不确定，可能两个都注册导致注入歧义。未知供应商名由 StartupSafetyGuard 启动时拒绝。
     */
    @Configuration
    static class Config {
        @Bean
        @ConditionalOnExpression("'${sms.provider:noop}'.trim().toLowerCase() != 'tencent'")
        SmsGateway noopSmsGateway() {
            return new NoopSmsGateway();
        }
    }
}