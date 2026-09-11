package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.Map;

/**
 * 微信开放接口的基础设施：凭据、access_token、真实 openid。
 *
 * 为什么必须收敛成一个类：微信同一个小程序只有**一个**全局 access_token，
 * 每次调用 /cgi-bin/token 都会让上一个失效。若内容机审与订阅消息各写一份缓存，
 * 两边会互相踢掉对方的 token —— 表现是"平时正常，一有 UGC 审核就偶发推送失败"，
 * 且极难定位。所以全站 token 只有这一处缓存，谁要都从这里拿。
 *
 * token 有效期 7200 秒，提前 5 分钟过期，避免边界上拿到刚失效的 token。
 */
@Service
public class WechatClient {

    private static final Logger log = LoggerFactory.getLogger(WechatClient.class);

    private final JdbcTemplate jdbcTemplate;
    private final RestClient restClient;
    private final String appId;
    private final String appSecret;

    /** app-id / app-secret 是否都已配置；未配置时所有微信接口调用直接降级，不抛异常。 */
    private final boolean configured;

    private volatile String cachedToken = "";
    private volatile long tokenExpiresAt = 0L;

    public WechatClient(JdbcTemplate jdbcTemplate,
                        @Value("${wechat.app-id:}") String appId,
                        @Value("${wechat.app-secret:}") String appSecret) {
        this.jdbcTemplate = jdbcTemplate;
        this.restClient = RestClient.create();
        this.appId = appId == null ? "" : appId.trim();
        this.appSecret = appSecret == null ? "" : appSecret.trim();
        this.configured = !this.appId.isEmpty() && !this.appSecret.isEmpty();
        if (!this.configured) {
            log.warn("Wechat disabled: app-id/app-secret not configured. "
                    + "Content security check and subscribe message will be skipped.");
        }
    }

    /** 凭据是否齐备。false 时调用方应直接走降级分支，不要发起任何请求。 */
    public boolean configured() {
        return configured;
    }

    /**
     * 取小程序全局 access_token（内存缓存）。未配凭据时抛异常，调用方应先查 {@link #configured()}。
     */
    public String accessToken() {
        if (!configured) {
            throw new IllegalStateException("wechat app-id/app-secret not configured");
        }
        long now = System.currentTimeMillis();
        if (!cachedToken.isEmpty() && now < tokenExpiresAt) {
            return cachedToken;
        }
        synchronized (this) {
            // 双重检查：并发时只放一个请求出去，其余复用刚拿到的 token
            if (!cachedToken.isEmpty() && System.currentTimeMillis() < tokenExpiresAt) {
                return cachedToken;
            }
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .scheme("https")
                            .host("api.weixin.qq.com")
                            .path("/cgi-bin/token")
                            .queryParam("grant_type", "client_credential")
                            .queryParam("appid", appId)
                            .queryParam("secret", appSecret)
                            .build())
                    .retrieve()
                    .body(Map.class);
            if (response == null || response.get("access_token") == null) {
                throw new IllegalStateException("wechat access_token failed: "
                        + (response == null ? "empty response" : response.get("errmsg")));
            }
            cachedToken = response.get("access_token").toString();
            long expiresIn = response.get("expires_in") instanceof Number n ? n.longValue() : 7200L;
            tokenExpiresAt = System.currentTimeMillis() + (expiresIn - 300) * 1000L;
            return cachedToken;
        }
    }

    /**
     * 查用户可用的真实微信 openid；查不到（游客等伪 openid）返回 null。
     *
     * 微信的内容机审与订阅消息都要求真实 openid，传入 guest-xxx 这类自造标识会直接报错，
     * 所以调用前统一在这里拦一道。
     */
    public String realOpenid(long userId) {
        String openid = jdbcTemplate.query(
                "SELECT openid FROM user_account WHERE id = ?",
                rs -> rs.next() ? rs.getString("openid") : null,
                userId
        );
        if (openid == null || openid.isBlank()
                || openid.startsWith("guest-") || openid.startsWith("phone-") || openid.startsWith("invite-")) {
            return null;
        }
        return openid;
    }
}
