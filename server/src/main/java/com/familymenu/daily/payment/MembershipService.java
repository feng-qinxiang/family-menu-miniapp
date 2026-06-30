package com.familymenu.daily.payment;

import com.familymenu.daily.dto.ApiModels.VipStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 会员判定与开通的唯一归口（见 ADR-0002/0005）。
 *
 * 判定规则：某用户享有会员权益，当且仅当——本人持未过期会员（任意 share_scope），
 * 或 其当前所属家庭存在成员持未过期且 share_scope=FAMILY 的会员。多份共享叠加时取最晚 expires_at。
 * 实时现算、不缓存：共享者退出家庭即刻失效。
 *
 * AuthService、MysqlKitchenStore、PaymentService 三方共用此判定，杜绝各写一份 SQL 导致漂移。
 */
@Service
public class MembershipService {

    private static final List<String> VIP_BENEFITS = List.of("去广告", "高级筛选", "云同步", "周菜单推荐");
    private static final List<String> FREE_AD_PLACEMENTS = List.of("首页信息流", "社区列表底部");
    private static final String DEFAULT_SHARE_SCOPE = "FAMILY";

    /** 一名用户当前的有效覆盖：是否享有、所凭套餐 code、最晚到期时刻（null 表示无有效会员）。 */
    public record Coverage(boolean vip, String planCode, LocalDateTime expiresAt) {
    }

    // 本人（任意 share_scope）或 当前家庭内 share_scope=FAMILY 的 ACTIVE 成员，全部取未过期者。
    private static final String COVERAGE_CONDITION = """
            m.expires_at > NOW() AND (
                m.payer_user_id = ?
                OR (
                    m.share_scope = 'FAMILY'
                    AND m.payer_user_id IN (
                        SELECT fm2.user_id FROM family_member fm2
                        WHERE fm2.member_status = 'ACTIVE'
                          AND fm2.family_id IN (
                              SELECT fm1.family_id FROM family_member fm1
                              WHERE fm1.user_id = ? AND fm1.member_status = 'ACTIVE'
                          )
                    )
                )
            )
            """;

    private final JdbcTemplate jdbcTemplate;

    public MembershipService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    /** 实时解析用户的会员覆盖：取所有适用会员中最晚到期的一份。 */
    public Coverage resolveCoverage(long userId) {
        String sql = "SELECT m.current_plan, m.expires_at FROM user_membership m WHERE "
                + COVERAGE_CONDITION + " ORDER BY m.expires_at DESC LIMIT 1";
        return jdbcTemplate.query(sql, rs -> {
            if (!rs.next()) {
                return new Coverage(false, "", null);
            }
            Timestamp ts = rs.getTimestamp("expires_at");
            return new Coverage(true, rs.getString("current_plan"),
                    ts == null ? null : ts.toLocalDateTime());
        }, userId, userId);
    }

    /** 构建面向前端的 VIP 展示态：享有则附权益清单，否则附免费版广告位。 */
    public VipStatus vipStatus(long userId) {
        Coverage coverage = resolveCoverage(userId);
        String planName = coverage.vip()
                ? PlanCatalog.displayName(coverage.planCode())
                : "免费版";
        if (planName.isBlank()) {
            planName = coverage.vip() ? "家庭会员" : "免费版";
        }
        return new VipStatus(
                coverage.vip(),
                planName,
                VIP_BENEFITS,
                coverage.vip() ? List.of() : FREE_AD_PLACEMENTS
        );
    }

    /**
     * 叠加开通/续费：在购买者现有有效期（或当前时刻，取较晚者）之上叠加套餐时长，续费不覆盖。
     * 首次开通用默认共享范围；续费保留用户既有的 share_scope。
     */
    @Transactional
    public void grant(long payerUserId, String planCode, int durationDays) {
        jdbcTemplate.update("""
                        INSERT INTO user_membership (payer_user_id, current_plan, expires_at, share_scope)
                        VALUES (?, ?, DATE_ADD(NOW(), INTERVAL ? DAY), ?)
                        ON DUPLICATE KEY UPDATE
                            current_plan = VALUES(current_plan),
                            expires_at = DATE_ADD(GREATEST(expires_at, NOW()), INTERVAL ? DAY),
                            updated_at = NOW()
                        """,
                payerUserId, planCode, durationDays, DEFAULT_SHARE_SCOPE, durationDays
        );
    }
}
