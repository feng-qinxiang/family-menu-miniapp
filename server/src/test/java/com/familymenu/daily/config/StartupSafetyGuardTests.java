package com.familymenu.daily.config;

import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThatCode;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** 生产开关 fail-fast：环境变量能覆盖 application-prod.yml，只有启动期检查靠得住。 */
class StartupSafetyGuardTests {

    @Test
    void prodRefusesEachDangerousFlag() {
        for (String flag : StartupSafetyGuard.PROD_FORBIDDEN_FLAGS) {
            MockEnvironment env = new MockEnvironment().withProperty(flag, "true");
            env.setActiveProfiles("prod");
            assertThatThrownBy(() -> StartupSafetyGuard.check(env))
                    .isInstanceOf(IllegalStateException.class)
                    .hasMessageContaining(flag);
        }
    }

    @Test
    void devMayUseFlagsAndProdWithFlagsOffStarts() {
        MockEnvironment dev = new MockEnvironment()
                .withProperty("auth.dev-otp-enabled", "true")
                .withProperty("wechat.pay.mock-pay-enabled", "true");
        assertThatCode(() -> StartupSafetyGuard.check(dev)).doesNotThrowAnyException();

        MockEnvironment prod = new MockEnvironment().withProperty("auth.dev-otp-enabled", "false");
        prod.setActiveProfiles("prod");
        assertThatCode(() -> StartupSafetyGuard.check(prod)).doesNotThrowAnyException();
    }

    @Test
    void unknownSmsProviderFailsInsteadOfSilentlyFallingBackToNoop() {
        MockEnvironment env = new MockEnvironment().withProperty("sms.provider", "aliyun");
        assertThatThrownBy(() -> StartupSafetyGuard.check(env)).hasMessageContaining("aliyun");
        assertThatCode(() -> StartupSafetyGuard.check(new MockEnvironment().withProperty("sms.provider", "Tencent")))
                .doesNotThrowAnyException();
    }
}
