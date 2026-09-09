package com.familymenu.daily.dto;

import java.util.List;

/** 运营管理台相关 DTO。 */
public final class AdminModels {

    private AdminModels() {
    }

    /** 用户列表项（openid/手机号已脱敏，不返回敏感明文）。 */
    public record AdminUserItem(
            Long userId,
            String openid,
            String nickname,
            String avatarUrl,
            String phone,
            boolean admin,
            String status,
            Long familyId,
            String createdAt
    ) {
    }

    /** 分页结果。 */
    public record AdminUserPage(
            List<AdminUserItem> items,
            long total,
            int page,
            int size
    ) {
    }

    /** 管理员状态变更请求。 */
    public record AdminGrantRequest(
            Boolean admin
    ) {
    }

    /** 反馈工单列表项。 */
    public record AdminFeedbackItem(
            Long id,
            Long userId,
            String nickname,
            List<String> types,
            String content,
            String contact,
            List<String> images,
            String status,
            String createdAt,
            String handledAt,
            String reply
    ) {
    }

    /** 工单处理请求：status = PROCESSING / CLOSED。 */
    public record AdminFeedbackHandleRequest(
            String status,
            String reply
    ) {
    }

    /** 帖子治理项。 */
    public record AdminPostItem(
            Long id,
            String title,
            String author,
            String auditStatus,
            Integer likeCount,
            Integer commentCount,
            String createdAt
    ) {
    }

    /** 内容下架/恢复请求：status = ACTIVE / REMOVED。 */
    public record AdminContentStatusRequest(
            String status
    ) {
    }

    /** 菜谱列表项（治理用）。 */
    public record AdminRecipeItem(
            Long recipeId,
            String title,
            String ownerNickname,
            String cuisine,
            Integer timeCost,
            String status,
            String createdAt
    ) {
    }

    /** 帖子评论项（治理用，含已软删除的评论以便追溯/恢复）。 */
    public record AdminCommentItem(
            Long commentId,
            Long postId,
            String postTitle,
            Long authorUserId,
            String authorNickname,
            String content,
            /** 审核状态：PENDING 待审核 / APPROVED 已通过 / REMOVED 已驳回 */
            String auditStatus,
            boolean deleted,
            String createdAt
    ) {
    }

    /** 评论审核状态变更请求（APPROVED / REMOVED）。 */
    public record AdminCommentStatusRequest(
            String status,
            String note
    ) {
    }

    /** 订单列表项。 */
    public record AdminOrderItem(
            Long orderId,
            String outTradeNo,
            Long payerUserId,
            String planCode,
            String planName,
            long amountFen,
            int durationDays,
            String status,
            String paymentMethod,
            String createdAt,
            String paidAt
    ) {
    }

    /** 人工开通/延长会员请求。 */
    public record AdminGrantVipRequest(
            String planCode,
            Integer durationDays
    ) {
    }

    /** 用户封禁/解封请求：status = BANNED / ACTIVE。 */
    public record AdminUserStatusRequest(
            String status
    ) {
    }

    /** 导入源审核列表项。 */
    public record AdminImportItem(
            Long id,
            String sourceType,
            String sourceUrl,
            String sourceText,
            String parseStatus,
            String auditStatus,
            Long reviewerUserId,
            String reviewNote,
            String createdAt,
            String resolvedAt
    ) {
    }

    /** 导入源审核请求：status = APPROVED / REJECTED。 */
    public record AdminImportStatusRequest(
            String status,
            String note
    ) {
    }

    /** 运营看板。 */
    public record AdminDashboard(
            long userCount,
            long familyCount,
            long recipeCount,
            long postCount,
            /** 待人工审核的帖子（机审无法判定时进队列） */
            long pendingPostCount,
            /** 待人工审核的评论 */
            long pendingCommentCount,
            /** 待人工审核的导入源 */
            long pendingImportCount,
            long pendingReportCount,
            long openFeedbackCount,
            long paidOrderCount,
            /** 已支付订单累计金额（分） */
            long paidRevenueFen,
            long activeVipCount,
            String generatedAt
    ) {
    }

    /** 审计日志项。 */
    public record AdminAuditItem(
            Long id,
            Long actorUserId,
            String actorNickname,
            String action,
            String targetType,
            String targetId,
            String detail,
            String result,
            String createdAt
    ) {
    }

    /** 看板趋势图上的一个日桶（date = yyyy-MM-dd，按数据库日期分组）。 */
    public record AdminMetricPoint(
            String date,
            long newUsers,
            long newPosts,
            long newComments,
            long paidOrders,
            /** 当日已支付订单金额（分），避免浮点误差 */
            long revenueFen
    ) {
    }

    /** 看板趋势与近期动态（与 AdminDashboard 的累计计数互补）。 */
    public record AdminMetrics(
            String generatedAt,
            int days,
            List<AdminMetricPoint> series,
            /** 近 30 天互动最高的已发布帖子 */
            List<AdminPostItem> hotPosts,
            /** 最近注册的用户 */
            List<AdminUserItem> recentUsers
    ) {
    }
}
