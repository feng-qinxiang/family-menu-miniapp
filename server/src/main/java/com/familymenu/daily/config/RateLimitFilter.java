package com.familymenu.daily.config;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.Ordered;
import org.springframework.core.annotation.Order;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.List;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 轻量内存限流：保护少数"可被脚本刷"的公开/低门槛端点。
 *
 * 覆盖场景：
 *  - POST /api/auth/guest        —— 每个新设备指纹会建用户+家庭+演示数据，防批量刷库
 *  - POST /api/auth/otp/request  —— 防短信轰炸（接真实网关后直接等于烧钱）
 *  - POST /api/admin/auth/otp    —— 同上
 *  - GET  /api/family/join-preview —— 防邀请码暴力枚举
 *  - POST /api/feedback          —— 防工单刷屏
 *  - POST /api/import/preview    —— 解析是纯 CPU 活，防滥用
 *
 * 实现说明：单实例内存固定窗口计数，够用且零依赖。
 * 多实例部署时每个实例各自计数（限流会放宽为 N 倍），需要严格全局限流请换 Redis。
 */
@Component
@Order(Ordered.HIGHEST_PRECEDENCE + 10)
public class RateLimitFilter extends OncePerRequestFilter {

    private static final Logger log = LoggerFactory.getLogger(RateLimitFilter.class);

    /** 规则：方法 + 精确路径 + 窗口内上限 + 窗口毫秒数 */
    private record Rule(String method, String path, int limit, long windowMillis) {
    }

    private static final List<Rule> RULES = List.of(
            new Rule("POST", "/api/auth/guest", 30, 60_000L),
            new Rule("POST", "/api/auth/otp/request", 10, 60_000L),
            new Rule("POST", "/api/admin/auth/otp", 10, 60_000L),
            new Rule("GET", "/api/family/join-preview", 20, 60_000L),
            new Rule("POST", "/api/feedback", 5, 60_000L),
            new Rule("POST", "/api/import/preview", 20, 60_000L)
    );

    /** 计数器上限，防止被大量伪造 IP/路径撑爆内存 */
    private static final int MAX_KEYS = 50_000;

    private final ConcurrentHashMap<String, long[]> counters = new ConcurrentHashMap<>();
    private final boolean enabled;

    public RateLimitFilter(@Value("${ratelimit.enabled:true}") boolean enabled) {
        this.enabled = enabled;
    }

    @Override
    protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response,
                                    FilterChain filterChain) throws ServletException, IOException {
        if (!enabled) {
            filterChain.doFilter(request, response);
            return;
        }
        Rule matched = match(request);
        if (matched != null && !allow(request, matched)) {
            log.warn("[RateLimit] {} {} from {} exceeded {} per {}ms",
                    request.getMethod(), request.getRequestURI(), clientIp(request),
                    matched.limit(), matched.windowMillis());
            response.setStatus(429);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.setCharacterEncoding("UTF-8");
            response.getWriter().write("{\"error\":\"操作过于频繁，请稍后再试\"}");
            return;
        }
        filterChain.doFilter(request, response);
    }

    private static Rule match(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) {
            return null;
        }
        for (Rule rule : RULES) {
            if (rule.method().equals(request.getMethod()) && rule.path().equals(path)) {
                return rule;
            }
        }
        return null;
    }

    private boolean allow(HttpServletRequest request, Rule rule) {
        if (counters.size() > MAX_KEYS) {
            // 简单兜底：极端情况下整体清空，避免内存无界增长
            counters.clear();
        }
        long now = System.currentTimeMillis();
        String key = rule.method() + " " + rule.path() + " " + clientIp(request);
        long[] state = counters.computeIfAbsent(key, k -> new long[]{now, 0L});
        synchronized (state) {
            if (now - state[0] >= rule.windowMillis()) {
                state[0] = now;
                state[1] = 0L;
            }
            state[1]++;
            return state[1] <= rule.limit();
        }
    }

    /** nginx 之后由 ForwardedHeaderFilter/forward-headers-strategy 还原真实 IP */
    private static String clientIp(HttpServletRequest request) {
        String ip = request.getRemoteAddr();
        return ip == null ? "unknown" : ip;
    }
}
