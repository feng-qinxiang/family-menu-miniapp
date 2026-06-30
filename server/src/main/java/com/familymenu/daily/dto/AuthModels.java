package com.familymenu.daily.dto;

import jakarta.validation.constraints.NotBlank;

public final class AuthModels {

    private AuthModels() {
    }

    public record LoginRequest(
            String code,
            String nickname,
            String avatarUrl
    ) {
    }

    public record OtpRequest(
            @NotBlank String phone
    ) {
    }

    public record OtpChallenge(
            String phone,
            int expiresInSeconds,
            String deliveryChannel,
            String devCode
    ) {
    }

    public record OtpLoginRequest(
            @NotBlank String phone,
            @NotBlank String code,
            String nickname,
            String avatarUrl
    ) {
    }

    public record AuthUser(
            Long userId,
            Long familyId,
            String nickname,
            String avatarUrl,
            boolean vip,
            String planName,
            boolean admin
    ) {
    }

    public record LoginResponse(
            String token,
            AuthUser user
    ) {
    }

    public record SessionQuery(
            @NotBlank String token
    ) {
    }
}
