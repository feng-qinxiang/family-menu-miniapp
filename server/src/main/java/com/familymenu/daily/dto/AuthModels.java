package com.familymenu.daily.dto;

import jakarta.validation.constraints.NotBlank;

import java.util.List;

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
            boolean admin,
            /** 管理端角色：SUPER / MODERATOR / SUPPORT；非管理员为 null */
            String adminRole,
            boolean phoneBound,
            /** 微信绑定：openid 存在且非游客（guest- 前缀）即为已绑定 */
            boolean wechatBound,
            /** 个人资料：性别 male/female/other，未填为 null */
            String gender,
            /** 个人资料：生日 yyyy-MM-dd，未填为 null */
            String birthday,
            /** 口味偏好标签（用户自己声明的，非 /api/preference/profile 的推断结果） */
            List<String> tasteTags
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
