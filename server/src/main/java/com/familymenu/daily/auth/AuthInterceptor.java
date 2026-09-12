package com.familymenu.daily.auth;

import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

import java.util.Set;

/**
 * 统一鉴权拦截器。
 *
 * 策略：/api/** 默认要求携带有效会话（真实登录或游客会话），只有 {@link #PUBLIC_PATHS}
 * 里的少数端点对外公开。
 *
 * 为什么改成"默认拒绝"而不是"按注解开放"：
 * 之前只有在方法上加了 @RequiresAuth 的端点才校验，漏加注解 = 静默公开。
 * 结果 /api/family、/api/feedback、/api/notifications 等一批端点没有 token
 * 也能读写，且会落回同一个共享游客账号（该共享账号机制已移除）。
 * 默认拒绝可以保证"新加的端点默认是安全的"，忘记加注解的代价从"数据泄露"变成"多一次 401"。
 *
 * 小程序每次启动都会调 /api/auth/guest 拿游客会话，因此默认拒绝不影响正常使用。
 *
 * 注意：这里对公开端点只做<b>纯读</b>解析（resolveToken 不写库），
 * 未带 token 时 ATTR_USER 保持为空，由控制器自己决定匿名语义。
 */
@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String ATTR_TOKEN = "auth.token";
    public static final String ATTR_USER = "auth.user";

    /**
     * 允许匿名访问的端点，格式 "METHOD 路径"。
     *
     * 规则：精确匹配，或对以 "/" 结尾的规则做前缀匹配（用于带路径参数的只读接口）。
     * 新增公开端点时必须显式加到这里，并说明理由。
     */
    private static final Set<String> PUBLIC_RULES = Set.of(
            // 登录/注册链路本身
            "POST /api/auth/guest",
            "POST /api/auth/login",
            "POST /api/auth/otp/request",
            "POST /api/auth/otp/login",
            // 登出必须幂等：token 已失效时再调也应返回 200，不能 401
            "POST /api/auth/logout",
            // 管理后台登录（后台静态页 + 这几个接口必须能匿名访问才能登录）
            "POST /api/admin/auth/otp",
            "POST /api/admin/auth/login",
            // 引导登录：令牌本身就是凭据，靠服务端常量时间比对校验
            "POST /api/admin/auth/bootstrap",
            // 价目表：不含用户数据
            "GET /api/payment/plans",
            // 微信支付异步回调：微信服务器不会带我们的 token，鉴权靠 RSA 验签 + AES 解密
            "POST /api/payment/notify",
            // 社区只读浏览（帖子列表 + 评论列表 + 话题榜）：UGC 已按审核状态过滤，可匿名查看
            "GET /api/community/posts",
            "GET /api/community/posts/",
            "GET /api/community/topics"
    );

    private final AuthService authService;

    public AuthInterceptor(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) {
            return true;
        }
        String token = request.getHeader("X-Auth-Token");
        request.setAttribute(ATTR_TOKEN, token);

        // 权限点优先：它已经隐含"必须是管理员"
        RequiresPermission permission = findAnnotation(method, RequiresPermission.class);
        if (permission != null) {
            request.setAttribute(ATTR_USER, authService.requirePermission(token, permission.value()));
            return true;
        }
        if (findAnnotation(method, RequiresAdmin.class) != null) {
            request.setAttribute(ATTR_USER, authService.requireAdminUser(token));
            return true;
        }
        if (findAnnotation(method, RequiresAuth.class) != null) {
            request.setAttribute(ATTR_USER, authService.requireAuthenticatedUser(token));
            return true;
        }
        if (isPublic(request)) {
            // 公开端点：有 token 就顺带解析出用户（页面据此区分游客/登录态），没有也放行
            authService.resolveToken(token).ifPresent(u -> request.setAttribute(ATTR_USER, u));
            return true;
        }
        // 默认拒绝：无有效会话（含过期/封禁）直接 401
        request.setAttribute(ATTR_USER, authService.requireAuthenticatedUser(token));
        return true;
    }

    private static boolean isPublic(HttpServletRequest request) {
        String path = request.getRequestURI();
        if (path == null) {
            return false;
        }
        String normalized = path.endsWith("/") && path.length() > 1
                ? path.substring(0, path.length() - 1)
                : path;
        String key = request.getMethod() + " " + normalized;
        for (String rule : PUBLIC_RULES) {
            if (rule.equals(key) || (rule.endsWith("/") && key.startsWith(rule))) {
                return true;
            }
        }
        return false;
    }

    private static <A extends java.lang.annotation.Annotation> A findAnnotation(HandlerMethod method, Class<A> type) {
        A annotation = method.getMethodAnnotation(type);
        return annotation != null ? annotation : method.getBeanType().getAnnotation(type);
    }
}
