package com.familymenu.daily.auth;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * 管理端接口的权限声明。
 *
 * 语义：调用者必须是管理员，且其角色包含 {@link #value()} 权限，否则 403。
 * 与 {@link RequiresAdmin} 的关系：{@code @RequiresPermission} 已经隐含"必须是管理员"，
 * 新增管理端接口一律用它，@RequiresAdmin 只保留给"管理员登录"这类还没有角色的入口。
 */
@Target({ElementType.METHOD, ElementType.TYPE})
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresPermission {

    AdminPermission value();
}
