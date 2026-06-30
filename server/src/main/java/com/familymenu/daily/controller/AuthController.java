package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.dto.AuthModels.LoginRequest;
import com.familymenu.daily.dto.AuthModels.LoginResponse;
import com.familymenu.daily.dto.AuthModels.OtpChallenge;
import com.familymenu.daily.dto.AuthModels.OtpLoginRequest;
import com.familymenu.daily.dto.AuthModels.OtpRequest;
import com.familymenu.daily.dto.ApiModels.UpdateProfileRequest;
import com.familymenu.daily.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/auth")
public class AuthController {

    private final AuthService authService;

    public AuthController(AuthService authService) {
        this.authService = authService;
    }

    @PostMapping("/guest")
    public LoginResponse guestLogin(@RequestHeader(name = "X-Device-Id", required = false) String deviceId,
                                    HttpServletRequest httpRequest) {
        String fingerprint = deviceId == null || deviceId.isBlank()
                ? httpRequest.getRemoteAddr() + "|" + safeHeader(httpRequest, "User-Agent")
                : deviceId.trim();
        return authService.guestLoginWithDevice(fingerprint);
    }

    @PostMapping("/login")
    public LoginResponse login(@RequestBody(required = false) LoginRequest request) {
        return authService.login(request);
    }

    @PostMapping("/otp/request")
    public OtpChallenge requestOtp(@Valid @RequestBody OtpRequest request) {
        return authService.requestPhoneOtp(request);
    }

    @PostMapping("/otp/login")
    public LoginResponse loginByOtp(@Valid @RequestBody OtpLoginRequest request) {
        return authService.loginWithPhoneOtp(request);
    }

    @GetMapping("/me")
    @RequiresAuth
    public AuthUser me(@CurrentUser AuthUser user) {
        return user;
    }

    @PatchMapping("/me")
    @RequiresAuth
    public AuthUser updateMe(@CurrentUser AuthUser user,
                             @RequestBody(required = false) UpdateProfileRequest request) {
        if (request == null) {
            return user;
        }
        return authService.updateProfile(user, request.nickname(), request.avatarUrl(), request.phone());
    }

    private static String safeHeader(HttpServletRequest request, String name) {
        String value = request.getHeader(name);
        return value == null ? "" : value;
    }
}
