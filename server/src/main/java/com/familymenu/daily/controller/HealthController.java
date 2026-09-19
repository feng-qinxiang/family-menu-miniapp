package com.familymenu.daily.controller;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.LinkedHashMap;
import java.util.Map;

/**
 * 存活探针：给 uptime 监控、容器/进程 healthcheck 和运维手工确认用。
 *
 * 挂在 /healthz 而不是 /api/health，是为了天然绕开鉴权拦截器（它只吃 /api/**），
 * 不必为探活去开白名单——白名单每多一条，日后忘记收紧的代价就多一份。
 * 代价是这个端点匿名可访问且会打一次库，所以 RateLimitFilter 里给它配了限流。
 * 只回 UP/DOWN：不外泄驱动版本、库名、异常信息。
 */
@RestController
public class HealthController {

    private static final Logger log = LoggerFactory.getLogger(HealthController.class);

    private final JdbcTemplate jdbc;

    public HealthController(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    @GetMapping("/healthz")
    public ResponseEntity<Map<String, Object>> healthz() {
        boolean dbUp;
        try {
            jdbc.queryForObject("SELECT 1", Integer.class);
            dbUp = true;
        } catch (RuntimeException e) {
            dbUp = false;
            // 只记异常类型：监控通常每几十秒打一次，库挂着的期间不该把堆栈刷满盘
            log.warn("[healthz] 数据库探活失败：{}", e.getClass().getSimpleName());
        }
        Map<String, Object> body = new LinkedHashMap<>();
        body.put("status", dbUp ? "UP" : "DOWN");
        body.put("db", dbUp ? "UP" : "DOWN");
        return ResponseEntity.status(dbUp ? HttpStatus.OK : HttpStatus.SERVICE_UNAVAILABLE).body(body);
    }
}
