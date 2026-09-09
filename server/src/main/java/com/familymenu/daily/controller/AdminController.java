package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAdmin;
import com.familymenu.daily.dto.AdminModels.AdminAuditItem;
import com.familymenu.daily.dto.AdminModels.AdminCommentItem;
import com.familymenu.daily.dto.AdminModels.AdminCommentStatusRequest;
import com.familymenu.daily.dto.AdminModels.AdminContentStatusRequest;
import com.familymenu.daily.dto.AdminModels.AdminDashboard;
import com.familymenu.daily.dto.AdminModels.AdminFeedbackHandleRequest;
import com.familymenu.daily.dto.AdminModels.AdminFeedbackItem;
import com.familymenu.daily.dto.AdminModels.AdminGrantRequest;
import com.familymenu.daily.dto.AdminModels.AdminGrantVipRequest;
import com.familymenu.daily.dto.AdminModels.AdminImportItem;
import com.familymenu.daily.dto.AdminModels.AdminImportStatusRequest;
import com.familymenu.daily.dto.AdminModels.AdminOrderItem;
import com.familymenu.daily.dto.AdminModels.AdminPostItem;
import com.familymenu.daily.dto.AdminModels.AdminRecipeItem;
import com.familymenu.daily.dto.AdminModels.AdminUserItem;
import com.familymenu.daily.dto.AdminModels.AdminUserPage;
import com.familymenu.daily.dto.AdminModels.AdminUserStatusRequest;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.AdminAuditService;
import com.familymenu.daily.service.AdminService;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;
import java.util.Map;

/**
 * 运营管理接口。所有端点强制 @RequiresAdmin，禁止游客兜底；
 * 每个写操作都落审计日志（谁、对什么、做了什么、结果）。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final AdminAuditService auditService;

    public AdminController(AdminService adminService, AdminAuditService auditService) {
        this.adminService = adminService;
        this.auditService = auditService;
    }

    // ---------- 看板 ----------
    @GetMapping("/dashboard")
    @RequiresAdmin
    public AdminDashboard dashboard() {
        return adminService.dashboard();
    }

    // ---------- 用户 ----------
    @GetMapping("/users")
    @RequiresAdmin
    public AdminUserPage searchUsers(@RequestParam(defaultValue = "") String keyword,
                                     @RequestParam(defaultValue = "0") int page,
                                     @RequestParam(defaultValue = "20") int size) {
        return adminService.searchUsers(keyword, page, size);
    }

    @PostMapping("/users/{userId}/admin")
    @RequiresAdmin
    public AdminUserItem setAdmin(@PathVariable long userId,
                                  @RequestBody(required = false) AdminGrantRequest request,
                                  @CurrentUser AuthUser actor) {
        boolean admin = request != null && Boolean.TRUE.equals(request.admin());
        try {
            AdminUserItem item = adminService.setAdmin(actor.userId(), userId, admin);
            auditService.record(actor.userId(), actor.nickname(), admin ? "GRANT_ADMIN" : "REVOKE_ADMIN",
                    "user", userId, null, true);
            return item;
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), admin ? "GRANT_ADMIN" : "REVOKE_ADMIN",
                    "user", userId, ex.getMessage(), false);
            throw ex;
        }
    }

    /** 人工开通/延长会员。 */
    @PostMapping("/users/{userId}/vip")
    @RequiresAdmin
    public Map<String, Object> grantVip(@PathVariable long userId,
                                        @RequestBody(required = false) AdminGrantVipRequest request,
                                        @CurrentUser AuthUser actor) {
        String plan = request == null ? null : request.planCode();
        Integer days = request == null ? null : request.durationDays();
        try {
            adminService.grantVip(actor.userId(), userId, plan, days);
            auditService.record(actor.userId(), actor.nickname(), "GRANT_VIP", "user", userId,
                    "plan=" + plan + " days=" + days, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "GRANT_VIP", "user", userId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    // ---------- 用户封禁 / 解封 ----------
    @PostMapping("/users/{userId}/status")
    @RequiresAdmin
    public AdminUserItem setUserStatus(@PathVariable long userId,
                                       @RequestBody(required = false) AdminUserStatusRequest request,
                                       @CurrentUser AuthUser actor) {
        String status = request == null ? null : request.status();
        try {
            AdminUserItem item = adminService.setUserStatus(actor.userId(), userId, status);
            auditService.record(actor.userId(), actor.nickname(),
                    "BANNED".equalsIgnoreCase(status) ? "BAN_USER" : "UNBAN_USER",
                    "user", userId, "status=" + status, true);
            return item;
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(),
                    "BANNED".equalsIgnoreCase(status) ? "BAN_USER" : "UNBAN_USER",
                    "user", userId, ex.getMessage(), false);
            throw ex;
        }
    }

    // ---------- 反馈工单 ----------
    @GetMapping("/feedback")
    @RequiresAdmin
    public List<AdminFeedbackItem> listFeedback(@RequestParam(defaultValue = "") String status,
                                                @RequestParam(defaultValue = "50") int limit) {
        return adminService.listFeedback(status, limit);
    }

    @PostMapping("/feedback/{feedbackId}/handle")
    @RequiresAdmin
    public AdminFeedbackItem handleFeedback(@PathVariable long feedbackId,
                                            @RequestBody(required = false) AdminFeedbackHandleRequest request,
                                            @CurrentUser AuthUser actor) {
        String status = request == null ? null : request.status();
        String reply = request == null ? null : request.reply();
        try {
            AdminFeedbackItem item = adminService.handleFeedback(actor.userId(), feedbackId, status, reply);
            auditService.record(actor.userId(), actor.nickname(), "HANDLE_FEEDBACK", "feedback", feedbackId,
                    "status=" + status, true);
            return item;
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "HANDLE_FEEDBACK", "feedback", feedbackId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    // ---------- 帖子 / 评论 / 菜谱 ----------
    @GetMapping("/posts")
    @RequiresAdmin
    public List<AdminPostItem> listPosts(@RequestParam(defaultValue = "") String auditStatus,
                                         @RequestParam(defaultValue = "50") int limit) {
        return adminService.listPosts(auditStatus, limit);
    }

    @PostMapping("/posts/{postId}/status")
    @RequiresAdmin
    public Map<String, Object> setPostStatus(@PathVariable long postId,
                                             @RequestBody(required = false) AdminContentStatusRequest request,
                                             @CurrentUser AuthUser actor) {
        String status = request == null ? null : request.status();
        try {
            adminService.setPostStatus(postId, status);
            auditService.record(actor.userId(), actor.nickname(), "SET_POST_STATUS", "post", postId,
                    "status=" + status, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "SET_POST_STATUS", "post", postId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    @DeleteMapping("/comments/{commentId}")
    @RequiresAdmin
    public Map<String, Object> deleteComment(@PathVariable long commentId, @CurrentUser AuthUser actor) {
        try {
            adminService.deleteComment(commentId);
            auditService.record(actor.userId(), actor.nickname(), "DELETE_COMMENT", "comment", commentId, null, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "DELETE_COMMENT", "comment", commentId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    @PostMapping("/recipes/{recipeId}/status")
    @RequiresAdmin
    public Map<String, Object> setRecipeStatus(@PathVariable long recipeId,
                                               @RequestBody(required = false) AdminContentStatusRequest request,
                                               @CurrentUser AuthUser actor) {
        String status = request == null ? null : request.status();
        try {
            adminService.setRecipeStatus(recipeId, status);
            auditService.record(actor.userId(), actor.nickname(), "SET_RECIPE_STATUS", "recipe", recipeId,
                    "status=" + status, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "SET_RECIPE_STATUS", "recipe", recipeId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    /** 菜谱列表（治理用）：keyword 匹配标题，status 过滤 ACTIVE/REMOVED。 */
    @GetMapping("/recipes")
    @RequiresAdmin
    public List<AdminRecipeItem> listRecipes(@RequestParam(defaultValue = "") String keyword,
                                             @RequestParam(defaultValue = "") String status,
                                             @RequestParam(defaultValue = "50") int limit) {
        return adminService.listRecipes(keyword, status, limit);
    }

    /** 评论列表（治理用）：可按帖子与审核状态过滤，含已删除评论。 */
    @GetMapping("/comments")
    @RequiresAdmin
    public List<AdminCommentItem> listComments(@RequestParam(required = false) Long postId,
                                               @RequestParam(required = false) String auditStatus,
                                               @RequestParam(defaultValue = "100") int limit) {
        return adminService.listComments(postId, limit, auditStatus);
    }

    /** 评论审核：通过（APPROVED）/ 驳回（REMOVED）。 */
    @PostMapping("/comments/{commentId}/status")
    @RequiresAdmin
    public Map<String, Object> setCommentStatus(@PathVariable long commentId,
                                                @RequestBody(required = false) AdminCommentStatusRequest request,
                                                @CurrentUser AuthUser actor) {
        String status = request == null ? null : request.status();
        try {
            adminService.setCommentAuditStatus(commentId, status);
            auditService.record(actor.userId(), actor.nickname(), "REVIEW_COMMENT", "comment", commentId,
                    status, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "REVIEW_COMMENT", "comment", commentId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    /** 恢复被误删的评论。 */
    @PostMapping("/comments/{commentId}/restore")
    @RequiresAdmin
    public Map<String, Object> restoreComment(@PathVariable long commentId, @CurrentUser AuthUser actor) {
        try {
            adminService.restoreComment(commentId);
            auditService.record(actor.userId(), actor.nickname(), "RESTORE_COMMENT", "comment", commentId, null, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "RESTORE_COMMENT", "comment", commentId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    // ---------- 订单 / 导入审核 / 审计 ----------
    @GetMapping("/orders")
    @RequiresAdmin
    public List<AdminOrderItem> listOrders(@RequestParam(defaultValue = "") String status,
                                           @RequestParam(defaultValue = "50") int limit) {
        return adminService.listOrders(status, limit);
    }

    /** 关闭未支付订单（PENDING → CLOSED）。 */
    @PostMapping("/orders/{outTradeNo}/close")
    @RequiresAdmin
    public Map<String, Object> closeOrder(@PathVariable String outTradeNo, @CurrentUser AuthUser actor) {
        try {
            adminService.closeOrder(actor.userId(), outTradeNo);
            auditService.record(actor.userId(), actor.nickname(), "CLOSE_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "CLOSE_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo + " err=" + ex.getMessage(), false);
            throw ex;
        }
    }

    /** 退款（PAID → REFUNDED，回收会员权益）。真实资金退款在商户平台操作。 */
    @PostMapping("/orders/{outTradeNo}/refund")
    @RequiresAdmin
    public Map<String, Object> refundOrder(@PathVariable String outTradeNo, @CurrentUser AuthUser actor) {
        try {
            adminService.refundOrder(actor.userId(), outTradeNo);
            auditService.record(actor.userId(), actor.nickname(), "REFUND_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "REFUND_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo + " err=" + ex.getMessage(), false);
            throw ex;
        }
    }

    // ---------- 导入源审核 ----------
    @GetMapping("/imports")
    @RequiresAdmin
    public List<AdminImportItem> listImports(@RequestParam(defaultValue = "") String auditStatus,
                                             @RequestParam(defaultValue = "50") int limit) {
        return adminService.listImports(auditStatus, limit);
    }

    @PostMapping("/imports/{importId}/status")
    @RequiresAdmin
    public Map<String, Object> setImportStatus(@PathVariable long importId,
                                               @RequestBody(required = false) AdminImportStatusRequest request,
                                               @CurrentUser AuthUser actor) {
        String status = request == null ? null : request.status();
        String note = request == null ? null : request.note();
        try {
            adminService.setImportStatus(actor.userId(), importId, status, note);
            auditService.record(actor.userId(), actor.nickname(),
                    "REVIEW_IMPORT", "import_source", importId, "status=" + status, true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(),
                    "REVIEW_IMPORT", "import_source", importId, ex.getMessage(), false);
            throw ex;
        }
    }

    @GetMapping("/audit")
    @RequiresAdmin
    public List<AdminAuditItem> listAudit(@RequestParam(defaultValue = "100") int limit) {
        return adminService.listAudit(limit);
    }
}
