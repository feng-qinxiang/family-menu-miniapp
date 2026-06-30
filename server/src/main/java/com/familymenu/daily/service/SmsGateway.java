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
}