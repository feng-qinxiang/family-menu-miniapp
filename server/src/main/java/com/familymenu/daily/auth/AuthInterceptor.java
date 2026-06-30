package com.familymenu.daily.auth;

import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.stereotype.Component;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;

@Component
public class AuthInterceptor implements HandlerInterceptor {

    public static final String ATTR_TOKEN = "auth.token";
    public static final String ATTR_USER = "auth.user";

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

        if (findAnnotation(method, RequiresAdmin.class) != null) {
            request.setAttribute(ATTR_USER, authService.requireAdminUser(token));
            return true;
        }
        if (findAnnotation(method, RequiresAuth.class) != null) {
            request.setAttribute(ATTR_USER, authService.requireAuthenticatedUser(token));
            return true;
        }
        authService.resolveToken(token).ifPresent(u -> request.setAttribute(ATTR_USER, u));
        return true;
    }

    private static <A extends java.lang.annotation.Annotation> A findAnnotation(HandlerMethod method, Class<A> type) {
        A annotation = method.getMethodAnnotation(type);
        return annotation != null ? annotation : method.getBeanType().getAnnotation(type);
    }
}
