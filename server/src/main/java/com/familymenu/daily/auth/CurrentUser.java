package com.familymenu.daily.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 注入当前请求的 AuthUser。
 * orGuest=true 时未登录会落回访客账号，配合公共只读接口使用。
 */
@Target(ElementType.PARAMETER)
@Retention(RetentionPolicy.RUNTIME)
public @interface CurrentUser {
    boolean orGuest() default false;
}
