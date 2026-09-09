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

    public record AdminLoginResponse(String token, String nickname, long userId) {
    }
}
