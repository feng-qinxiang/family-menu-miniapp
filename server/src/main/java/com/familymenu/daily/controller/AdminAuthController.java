package com.familymenu.daily.controller;

import com.familymenu.daily.dto.AdminAuthModels.AdminLoginRequest;
import com.familymenu.daily.dto.AdminAuthModels.AdminLoginResponse;
import com.familymenu.daily.dto.AdminAuthModels.AdminOtpRequest;
import com.familymenu.daily.dto.AuthModels.LoginResponse;
import com.familymenu.daily.dto.AuthModels.OtpChallenge;
import com.familymenu.daily.dto.AuthModels.OtpRequest;
import com.familymenu.daily.service.AuthService;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * 管理后台登录接口（公开路径，但只对管理员账号签发会话）。
 * 独立于小程序登录链路，登录成功后拿到的是普通会话 token，
 * 因此 /api/admin/** 的 @RequiresAdmin 校验可直接复用。
 */
@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {

    private final AuthService authService;

    public AdminAuthController(AuthService authService) {
        this.authService = authService;
    }

    /** 发送后台登录验证码。仅对已绑定手机号的管理员账号下发，避免被当作短信轰炸入口。 */
    @PostMapping("/otp")
    public OtpChallenge requestOtp(@RequestBody(required = false) AdminOtpRequest request) {
        String phone = request == null ? null : request.phone();
        // 复用普通 OTP 下发；管理员校验放在登录阶段（下发阶段不泄露"该号是否管理员"）
        return authService.requestPhoneOtp(new OtpRequest(phone));
    }

    /** 管理员登录。 */
    @PostMapping("/login")
    public AdminLoginResponse login(@RequestBody(required = false) AdminLoginRequest request) {
        String phone = request == null ? null : request.phone();
        String code = request == null ? null : request.code();
        LoginResponse response = authService.adminLoginByPhoneOtp(phone, code);
        return new AdminLoginResponse(
                response.token(),
                response.user() == null ? "" : response.user().nickname(),
                response.user() == null ? 0L : response.user().userId());
    }
}
