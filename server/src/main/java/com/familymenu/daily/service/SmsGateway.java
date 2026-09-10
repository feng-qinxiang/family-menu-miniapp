package com.familymenu.daily.service;

/**
 * 短信网关 SPI（见接口契约 §三）。
 * 生产环境接阿里云/腾讯云时提供具体实现并注册为 @Bean，
 * 未接入时 NoopSmsGateway 自动作为默认实现。
 */
public interface SmsGateway {
    /**
     * 发送 OTP 验证码。
     *
     * @param phone 11 位手机号（已归一化）
     * @param code  6 位数字验证码明文
     */
    void send(String phone, String code);

    /**
     * 网关是否真的能把短信发出去。
     *
     * NoopSmsGateway 返回 false —— 它什么都不发。此时如果又没开 dev OTP，
     * 用户会一直等一条永远不来的短信，界面上却显示"验证码已发送"。
     * 调用方据此直接报错，而不是静默假装成功。
     */
    default boolean configured() {
        return true;
    }
}