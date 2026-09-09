package com.familymenu.daily.auth;

/**
 * 管理端权限点。
 *
 * 设计取舍：权限点按"能对数据做什么"划分，而不是按页面划分，
 * 这样新增页面时复用已有权限点，不容易漏配。
 */
public enum AdminPermission {
    /** 看板与趋势数据 */
    DASHBOARD_VIEW,
    /** 帖子审核/下架/恢复 */
    CONTENT_MODERATE,
    /** 评论审核/删除/恢复 */
    COMMENT_MODERATE,
    /** 举报处置 */
    REPORT_REVIEW,
    /** 导入源审核 */
    IMPORT_REVIEW,
    /** 菜谱下架/恢复 */
    RECIPE_MODERATE,
    /** 查询用户（只读） */
    USER_VIEW,
    /** 授权/封禁/开通会员（写操作） */
    USER_MANAGE,
    /** 查询订单（只读） */
    ORDER_VIEW,
    /** 关单/退款（写操作） */
    ORDER_MANAGE,
    /** 反馈工单查看与处理 */
    FEEDBACK_HANDLE,
    /** 审计日志查看 */
    AUDIT_VIEW,
    /** 导出数据 */
    EXPORT
}
