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
            /** 管理端角色：SUPER / MODERATOR / SUPPORT；非管理员为 null */
            String adminRole,
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

    /**
     * 管理台列表统一分页信封。
     * 订单/评论/工单/审计这些会持续增长的表必须分页，否则接口静默截断，
     * 运营看到的"共 N 条"就是假的。
     */
    public record AdminPage<T>(
            List<T> items,
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

    /** 管理端角色变更请求：role = SUPER / MODERATOR / SUPPORT，空值表示撤销管理员。 */
    public record AdminRoleRequest(
            String role
    ) {
    }

    /** 当前登录管理员的身份与权限（前端据此隐藏无权限的菜单/按钮；后端仍独立校验）。 */
    public record AdminProfile(
            Long userId,
            String nickname,
            /** SUPER / MODERATOR / SUPPORT */
            String role,
            String roleName,
            List<String> permissions
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

    /** 帖子详情（治理用）：运营在审核/下架前查看完整正文与标签。 */
    public record AdminPostDetail(
            Long id,
            String title,
            String content,
            List<String> tags,
            String author,
            String auditStatus,
            Integer likeCount,
            Integer commentCount,
            Long recipeId,
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

    /** 菜谱详情（治理用）：运营查看完整食材与步骤，判断是否需要下架。 */
    public record AdminRecipeDetail(
            Long recipeId,
            String title,
            String ownerNickname,
            String sourceType,
            String sourceUrl,
            String cuisine,
            Integer timeCost,
            Integer servings,
            String difficulty,
            String summary,
            String coverImage,
            List<String> tasteTags,
            String status,
            String createdAt,
            List<String> steps,
            List<AdminIngredient> ingredients
    ) {
    }

    /** 菜谱食材项（治理用）。 */
    public record AdminIngredient(
            String name,
            String amount,
            String unit
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

    /** 批量审核请求：一次处理多条内容（最多 100 条，多余的忽略）。 */
    public record AdminBatchStatusRequest(
            List<Long> ids,
            String status,
            String note
    ) {
    }

    /** 订单列表项。 */
    public record AdminOrderItem(
            Long orderId,
            String outTradeNo,
            Long payerUserId,
            String payerNickname,
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

    // ==================== 家庭侧只读数据（家庭与成员 / 今日菜单 / 购物清单 / 库存） ====================
    // 这四类数据此前只能在小程序里看到，运营在后台完全看不到，出问题时无法定位。
    // 约定：全部只读（运营不代用户改菜单/清单），且一律带家庭名，避免出现一堆无主数据。

    /** 家庭列表项。 */
    public record AdminFamilyItem(
            Long familyId,
            String name,
            Long ownerUserId,
            String ownerNickname,
            /** 家庭成员数（含已退出） */
            int memberCount,
            int recipeCount,
            int menuCount,
            String createdAt
    ) {
    }

    /** 家庭成员项（含已退出成员，便于排查"为什么这个人不在家里"）。 */
    public record AdminFamilyMember(
            Long userId,
            String nickname,
            /** 手机号已脱敏 */
            String phone,
            String role,
            String status,
            String joinedAt
    ) {
    }

    /** 今日菜单行：一个家庭一天的一张菜单。 */
    public record AdminMenuRow(
            Long menuId,
            Long familyId,
            String familyName,
            String menuDate,
            String status,
            int itemCount,
            /** 菜名，用「、」连接，列表里直接展示 */
            String dishes,
            String updatedAt
    ) {
    }

    /** 购物清单行：一个家庭一张清单（按今日菜单生成）。 */
    public record AdminShoppingRow(
            Long listId,
            Long familyId,
            String familyName,
            String menuDate,
            String status,
            int totalCount,
            int purchasedCount,
            String createdAt
    ) {
    }

    /** 库存行。 */
    public record AdminPantryRow(
            Long id,
            Long familyId,
            String familyName,
            String ingredientName,
            String amount,
            String unit,
            String expiresAt,
            String addedAt
    ) {
    }

    /** 家庭详情：成员 + 最近菜单 + 购物清单 + 库存，一次拉全供后台下钻。 */
    public record AdminFamilyDetail(
            AdminFamilyItem family,
            List<AdminFamilyMember> members,
            List<AdminMenuRow> recentMenus,
            List<AdminShoppingRow> shoppingLists,
            List<AdminPantryRow> pantry
    ) {
    }
}
