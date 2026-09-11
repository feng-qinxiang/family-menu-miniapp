package com.familymenu.daily.controller;

import com.familymenu.daily.dto.AdminAuthModels.AdminBootstrapRequest;
import com.familymenu.daily.dto.AdminAuthModels.AdminLoginRequest;
import com.familymenu.daily.dto.AdminAuthModels.AdminLoginResponse;
import com.familymenu.daily.dto.AdminAuthModels.AdminOtpRequest;
import com.familymenu.daily.dto.AuthModels.LoginResponse;
import com.familymenu.daily.dto.AuthModels.OtpChallenge;
import com.familymenu.daily.dto.AuthModels.OtpRequest;
import com.familymenu.daily.service.AuthService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.server.ResponseStatusException;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;

/**
 * 管理后台登录接口（公开路径，但只对管理员账号签发会话）。
 * 独立于小程序登录链路，登录成功后拿到的是普通会话 token，
 * 因此 /api/admin/** 的 @RequiresAdmin 校验可直接复用。
 */
@RestController
@RequestMapping("/api/admin/auth")
public class AdminAuthController {

    private static final Logger log = LoggerFactory.getLogger(AdminAuthController.class);

    private final AuthService authService;

    /** 引导登录令牌；留空 = 该功能整体关闭（端点返回 404，视同不存在）。 */
    private final String bootstrapToken;

    /** 引导登录要登录哪个账号（手机号）。刻意不从请求体传，浏览器端只需要知道令牌。 */
    private final String bootstrapPhone;

    public AdminAuthController(AuthService authService,
                               @Value("${admin.bootstrap-token:}") String bootstrapToken,
                               @Value("${admin.bootstrap-phone:}") String bootstrapPhone) {
        this.authService = authService;
        this.bootstrapToken = bootstrapToken == null ? "" : bootstrapToken.trim();
        this.bootstrapPhone = bootstrapPhone == null ? "" : bootstrapPhone.trim();
        if (!this.bootstrapToken.isEmpty()) {
            // 启动就说清楚：这是一把不过期的后台钥匙，很容易忘记删
            log.warn("管理后台「引导登录」已开启（ADMIN_BOOTSTRAP_TOKEN 已设置）："
                            + "任何人拿到该令牌都能以 {} 账号进入后台并绕过验证码。"
                            + "仅在进不去后台时临时使用，用完请立刻移除该环境变量并重启应用。",
                    maskPhone(this.bootstrapPhone));
        }
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
        return toResponse(response);
    }

    /**
     * 引导登录：短信网关未接入（SMS_PROVIDER=noop）时，后台唯一进得去的入口。
     *
     * 未配置 ADMIN_BOOTSTRAP_TOKEN / ADMIN_BOOTSTRAP_PHONE 时返回 404 ——
     * 端点视同不存在，连"这里有个后门"都不对外暴露。
     * 配置了则校验令牌，通过后为 ADMIN_BOOTSTRAP_PHONE 指定的管理员账号签发会话。
     */
    @PostMapping("/bootstrap")
    public AdminLoginResponse bootstrap(@RequestBody(required = false) AdminBootstrapRequest request) {
        if (bootstrapToken.isEmpty() || bootstrapPhone.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "未找到");
        }
        String provided = request == null || request.token() == null ? "" : request.token().trim();
        // 常量时间比较：避免逐字符比较时通过响应耗时逐位猜出令牌
        if (!MessageDigest.isEqual(bootstrapToken.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "引导令牌不正确");
        }
        return toResponse(authService.adminLoginByBootstrap(bootstrapPhone));
    }

    private static AdminLoginResponse toResponse(LoginResponse response) {
        return new AdminLoginResponse(
                response.token(),
                response.user() == null ? "" : response.user().nickname(),
                response.user() == null ? 0L : response.user().userId());
    }

    /** 日志脱敏：只留手机号末 4 位。 */
    private static String maskPhone(String phone) {
        return phone.length() >= 4 ? "***" + phone.substring(phone.length() - 4) : "***";
    }
}
