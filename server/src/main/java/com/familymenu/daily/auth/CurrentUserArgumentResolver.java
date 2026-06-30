package com.familymenu.daily.auth;

import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.AuthService;
import jakarta.servlet.http.HttpServletRequest;
import org.springframework.core.MethodParameter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.support.WebDataBinderFactory;
import org.springframework.web.context.request.NativeWebRequest;
import org.springframework.web.method.support.HandlerMethodArgumentResolver;
import org.springframework.web.method.support.ModelAndViewContainer;

@Component
public class CurrentUserArgumentResolver implements HandlerMethodArgumentResolver {

    private final AuthService authService;

    public CurrentUserArgumentResolver(AuthService authService) {
        this.authService = authService;
    }

    @Override
    public boolean supportsParameter(MethodParameter parameter) {
        return parameter.hasParameterAnnotation(CurrentUser.class)
                && AuthUser.class.equals(parameter.getParameterType());
    }

    @Override
    public Object resolveArgument(MethodParameter parameter,
                                  ModelAndViewContainer mavContainer,
                                  NativeWebRequest webRequest,
                                  WebDataBinderFactory binderFactory) {
        HttpServletRequest request = webRequest.getNativeRequest(HttpServletRequest.class);
        if (request == null) {
            return null;
        }
        AuthUser user = (AuthUser) request.getAttribute(AuthInterceptor.ATTR_USER);
        if (user != null) {
            return user;
        }
        CurrentUser anno = parameter.getParameterAnnotation(CurrentUser.class);
        if (anno != null && anno.orGuest()) {
            String token = (String) request.getAttribute(AuthInterceptor.ATTR_TOKEN);
            AuthUser resolved = authService.resolveOrGuest(token);
            request.setAttribute(AuthInterceptor.ATTR_USER, resolved);
            return resolved;
        }
        return null;
    }
}
