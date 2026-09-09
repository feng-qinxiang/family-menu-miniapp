package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

/**
 * 运营操作审计：所有管理端敏感动作都必须落一条。
 * 写失败不抛异常（不能因为审计表问题阻断业务），但会打 ERROR 日志。
 */
@Service
public class AdminAuditService {

    private static final Logger log = LoggerFactory.getLogger(AdminAuditService.class);

    private final JdbcTemplate jdbcTemplate;

    public AdminAuditService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public void record(long actorUserId, String actorNickname, String action,
                       String targetType, Object targetId, String detail, boolean ok) {
        try {
            jdbcTemplate.update("""
                            INSERT INTO admin_audit_log(actor_user_id, actor_nickname, action, target_type,
                                                        target_id, detail, result)
                            VALUES (?, ?, ?, ?, ?, ?, ?)
                            """,
                    actorUserId,
                    actorNickname,
                    action,
                    targetType,
                    targetId == null ? null : String.valueOf(targetId),
                    truncate(detail, 500),
                    ok ? "OK" : "FAIL");
        } catch (RuntimeException ex) {
            log.error("audit write failed: action={} target={}:{}", action, targetType, targetId, ex);
        }
    }

    private static String truncate(String value, int max) {
        if (value == null) return null;
        return value.length() <= max ? value : value.substring(0, max);
    }
}
