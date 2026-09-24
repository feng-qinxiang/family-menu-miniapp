package com.familymenu.daily.config;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.env.Environment;
import org.springframework.core.env.Profiles;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Locale;
import java.util.Set;

/**
 * 启动期安全闸：配置错了就起不来，而不是带病上线。
 *
 * 为什么需要它：application-prod.yml 里写死 {@code auth.dev-otp-enabled: false} 挡不住环境变量——
 * Spring Boot 中 OS 环境变量（AUTH_DEV_OTP_ENABLED=true）优先级高于任何配置文件，
 * 所以"prod 文件固定关闭"只是注释里的承诺。这里在 prod profile 下对三个资损/接管级开关直接 fail-fast。
 */
@Component
public class StartupSafetyGuard {

    private static final Logger log = LoggerFactory.getLogger(StartupSafetyGuard.class);

    static final Set<String> SMS_PROVIDERS = Set.of("noop", "tencent");

    /** prod 下必须为 false 的开关：固定验证码（任意手机号登录）、免付款开会员、演示数据。 */
    static final List<String> PROD_FORBIDDEN_FLAGS = List.of(
            "auth.dev-otp-enabled", "wechat.pay.mock-pay-enabled", "app.seed-demo-data");

    public StartupSafetyGuard(Environment env) {
        check(env);
    }

    static void check(Environment env) {
        String provider = env.getProperty("sms.provider", "noop").trim().toLowerCase(Locale.ROOT);
        if (!SMS_PROVIDERS.contains(provider)) {
            // 以前 SMS_PROVIDER=aliyun 之类会被静默忽略，照样走 noop，部署方以为接好了短信
            throw new IllegalStateException("不支持的 SMS_PROVIDER=" + provider + "，可选：" + SMS_PROVIDERS);
        }
        if (!env.acceptsProfiles(Profiles.of("prod"))) {
            return;
        }
        List<String> enabled = PROD_FORBIDDEN_FLAGS.stream()
                .filter(key -> env.getProperty(key, Boolean.class, false))
                .toList();
        if (!enabled.isEmpty()) {
            throw new IllegalStateException("生产环境（prod profile）禁止开启 " + enabled
                    + "：请删除对应环境变量 AUTH_DEV_OTP_ENABLED / WECHAT_PAY_MOCK_ENABLED / APP_SEED_DEMO_DATA 后重启");
        }
        if (!env.getProperty("admin.bootstrap-token", "").isBlank()) {
            log.warn("ADMIN_BOOTSTRAP_TOKEN 已设置：这是一把不过期的后台钥匙，进入后台后请立刻删除并重启");
        }
    }
}
