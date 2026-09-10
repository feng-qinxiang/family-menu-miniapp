package com.familymenu.daily.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前请求的 AuthUser。
 *
 * 用户由 {@link AuthInterceptor} 统一解析并放在 request attribute 上，这里只做取用。
 * 不再支持"未登录落回访客账号"：那会让匿名请求隐式创建/复用同一个公共账号，
 * 既产生读路径写库，又可能让不同用户读到同一份数据。鉴权策略见 AuthInterceptor（默认拒绝）。
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {
}
