package com.familymenu.daily.dto;

/** 管理后台登录相关 DTO。 */
public final class AdminAuthModels {

    private AdminAuthModels() {
    }

    /**
     * 管理员登录：用管理员的手机号 + 验证码。
     * 复用既有 phone_otp 链路，但只允许 is_admin=1 的账号登录，
     * 因此后台登录无法被普通用户利用。
     */
    public record AdminOtpRequest(String phone) {
    }

    public record AdminLoginRequest(String phone, String code) {
    }

    /**
     * 引导登录（短信网关未接入时的应急入口）。
     *
     * 只提交令牌，不提交手机号：要登录哪个账号由服务端环境变量 ADMIN_BOOTSTRAP_PHONE 指定，
     * 浏览器端既不需要知道、也改不动登录目标。
     */
    public record AdminBootstrapRequest(String token) {
    }

    public record AdminLoginResponse(String token, String nickname, long userId) {
    }
}
