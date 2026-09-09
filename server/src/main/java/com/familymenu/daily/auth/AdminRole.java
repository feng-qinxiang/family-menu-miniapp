package com.familymenu.daily.auth;

import java.util.EnumSet;
import java.util.Locale;
import java.util.Set;

/**
 * 管理端角色。
 *
 * 权限矩阵（越小越安全，新增角色时显式列出，不做"默认给全部"）：
 *
 * <pre>
 *                        SUPER  MODERATOR  SUPPORT
 * 看板                     ✓        ✓         ✓
 * 内容/评论/举报/导入/菜谱    ✓        ✓         ✗
 * 用户查询                 ✓        ✗         ✓
 * 用户管理（授权/封禁/会员）  ✓        ✗         ✗
 * 订单查询                 ✓        ✗         ✓
 * 订单管理（关单/退款）      ✓        ✗         ✗
 * 反馈工单                 ✓        ✗         ✓
 * 审计日志                 ✓        ✗         ✗
 * 导出                     ✓        ✓         ✓
 * </pre>
 *
 * 历史数据兼容：is_admin=1 且 admin_role 为 NULL 的账号按 SUPER 处理，
 * 这样升级后已有管理员不会突然失去权限。
 */
public enum AdminRole {

    SUPER("超级管理员", EnumSet.allOf(AdminPermission.class)),

    MODERATOR("内容审核员", EnumSet.of(
            AdminPermission.DASHBOARD_VIEW,
            AdminPermission.CONTENT_MODERATE,
            AdminPermission.COMMENT_MODERATE,
            AdminPermission.REPORT_REVIEW,
            AdminPermission.IMPORT_REVIEW,
            AdminPermission.RECIPE_MODERATE,
            AdminPermission.EXPORT)),

    SUPPORT("客服", EnumSet.of(
            AdminPermission.DASHBOARD_VIEW,
            AdminPermission.USER_VIEW,
            AdminPermission.ORDER_VIEW,
            AdminPermission.FEEDBACK_HANDLE,
            AdminPermission.EXPORT));

    private final String displayName;
    private final Set<AdminPermission> permissions;

    AdminRole(String displayName, Set<AdminPermission> permissions) {
        this.displayName = displayName;
        this.permissions = permissions;
    }

    public String displayName() {
        return displayName;
    }

    public Set<AdminPermission> permissions() {
        return permissions;
    }

    public boolean allows(AdminPermission permission) {
        return permissions.contains(permission);
    }

    /** 解析角色名；非法值返回 null（调用方决定是报错还是忽略）。 */
    public static AdminRole parse(String role) {
        if (role == null || role.isBlank()) {
            return null;
        }
        try {
            return valueOf(role.trim().toUpperCase(Locale.ROOT));
        } catch (IllegalArgumentException ex) {
            return null;
        }
    }

    /**
     * 由账号字段推导有效角色：
     * 非管理员 → null；is_admin=1 但角色为空/非法 → SUPER（历史数据兼容）。
     */
    public static AdminRole of(Boolean isAdmin, String role) {
        if (isAdmin == null || !isAdmin) {
            return null;
        }
        AdminRole parsed = parse(role);
        return parsed == null ? SUPER : parsed;
    }
}
