package com.familymenu.daily.controller;

import com.familymenu.daily.auth.AdminPermission;
import com.familymenu.daily.auth.AdminRole;
import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAdmin;
import com.familymenu.daily.auth.RequiresPermission;
import com.familymenu.daily.dto.AdminModels.AdminAuditItem;
import com.familymenu.daily.dto.AdminModels.AdminBatchStatusRequest;
import com.familymenu.daily.dto.AdminModels.AdminCommentItem;
import com.familymenu.daily.dto.AdminModels.AdminCommentStatusRequest;
import com.familymenu.daily.dto.AdminModels.AdminContentStatusRequest;
import com.familymenu.daily.dto.AdminModels.AdminDashboard;
import com.familymenu.daily.dto.AdminModels.AdminFamilyDetail;
import com.familymenu.daily.dto.AdminModels.AdminFamilyItem;
import com.familymenu.daily.dto.AdminModels.AdminFeedbackHandleRequest;
import com.familymenu.daily.dto.AdminModels.AdminFeedbackItem;
import com.familymenu.daily.dto.AdminModels.AdminGrantRequest;
import com.familymenu.daily.dto.AdminModels.AdminGrantVipRequest;
import com.familymenu.daily.dto.AdminModels.AdminImportItem;
import com.familymenu.daily.dto.AdminModels.AdminImportStatusRequest;
import com.familymenu.daily.dto.AdminModels.AdminMenuRow;
import com.familymenu.daily.dto.AdminModels.AdminMetrics;
import com.familymenu.daily.dto.AdminModels.AdminOrderItem;
import com.familymenu.daily.dto.AdminModels.AdminPage;
import com.familymenu.daily.dto.AdminModels.AdminPantryRow;
import com.familymenu.daily.dto.AdminModels.AdminPostDetail;
import com.familymenu.daily.dto.AdminModels.AdminPostItem;
import com.familymenu.daily.dto.AdminModels.AdminProfile;
import com.familymenu.daily.dto.AdminModels.AdminRecipeItem;
import com.familymenu.daily.dto.AdminModels.AdminRecipeDetail;
import com.familymenu.daily.dto.AdminModels.AdminRoleRequest;
import com.familymenu.daily.dto.AdminModels.AdminShoppingRow;
import com.familymenu.daily.dto.AdminModels.AdminUserItem;
import com.familymenu.daily.dto.AdminModels.AdminUserPage;
import com.familymenu.daily.dto.AdminModels.AdminUserStatusRequest;
import com.familymenu.daily.dto.ApiModels.CommunityReportItem;
import com.familymenu.daily.dto.ApiModels.CommunityReportReviewRequest;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.AdminAuditService;
import com.familymenu.daily.service.AdminService;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
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
import java.util.Set;

/**
 * 运营管理接口。所有端点强制 @RequiresPermission（隐含"必须是管理员"），禁止游客兜底；
 * 每个写操作都落审计日志（谁、对什么、做了什么、结果）。
 */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

    private final AdminService adminService;
    private final AdminAuditService auditService;
    private final com.familymenu.daily.service.MysqlKitchenStore store;

    public AdminController(AdminService adminService, AdminAuditService auditService,
                           com.familymenu.daily.service.MysqlKitchenStore store) {
        this.adminService = adminService;
        this.auditService = auditService;
        this.store = store;
    }

    // ---------- 看板 ----------
    @GetMapping("/dashboard")
    @RequiresPermission(AdminPermission.DASHBOARD_VIEW)
    public AdminDashboard dashboard() {
        return adminService.dashboard();
    }

    /** 当前登录管理员是谁、什么角色、有哪些权限。前端据此隐藏菜单，后端仍逐接口校验。 */
    @GetMapping("/me")
    @RequiresAdmin
    public AdminProfile me(@CurrentUser AuthUser actor) {
        AdminRole role = AdminRole.of(true, actor.adminRole());
        return new AdminProfile(
                actor.userId(),
                actor.nickname(),
                role == null ? null : role.name(),
                role == null ? "管理员" : role.displayName(),
                role == null ? List.of() : role.permissions().stream().map(Enum::name).toList());
    }

    /** 看板趋势（近 days 天每日新增）+ 热门内容 + 最近注册用户。 */
    @GetMapping("/metrics")
    @RequiresPermission(AdminPermission.DASHBOARD_VIEW)
    public AdminMetrics metrics(@RequestParam(defaultValue = "14") int days) {
        return adminService.metrics(days);
    }

    // ---------- 用户 ----------
    @GetMapping("/users")
    @RequiresPermission(AdminPermission.USER_VIEW)
    public AdminUserPage searchUsers(@RequestParam(defaultValue = "") String keyword,
                                     @RequestParam(defaultValue = "") String sort,
                                     @RequestParam(defaultValue = "") String order,
                                     @RequestParam(defaultValue = "0") int page,
                                     @RequestParam(defaultValue = "20") int size) {
        return adminService.searchUsers(keyword, sort, order, page, size);
    }

    @PostMapping("/users/{userId}/admin")
    @RequiresPermission(AdminPermission.USER_MANAGE)
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

    /** 设置管理端角色：SUPER 超管 / MODERATOR 内容审核员 / SUPPORT 客服；空值撤销管理员。 */
    @PostMapping("/users/{userId}/role")
    @RequiresPermission(AdminPermission.USER_MANAGE)
    public AdminUserItem setUserRole(@PathVariable long userId,
                                     @RequestBody(required = false) AdminRoleRequest request,
                                     @CurrentUser AuthUser actor) {
        String role = request == null ? null : request.role();
        try {
            AdminUserItem item = adminService.setAdminRole(actor.userId(), userId, role);
            auditService.record(actor.userId(), actor.nickname(), "SET_ADMIN_ROLE", "user", userId,
                    "role=" + (role == null || role.isBlank() ? "NONE" : role.trim().toUpperCase()), true);
            return item;
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "SET_ADMIN_ROLE", "user", userId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    /** 人工开通/延长会员。 */
    @PostMapping("/users/{userId}/vip")
    @RequiresPermission(AdminPermission.USER_MANAGE)
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
    @RequiresPermission(AdminPermission.USER_MANAGE)
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
    @RequiresPermission(AdminPermission.FEEDBACK_HANDLE)
    public AdminPage<AdminFeedbackItem> listFeedback(@RequestParam(defaultValue = "") String status,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "50") int size) {
        return adminService.listFeedback(status, page, size);
    }

    @PostMapping("/feedback/{feedbackId}/handle")
    @RequiresPermission(AdminPermission.FEEDBACK_HANDLE)
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
    @RequiresPermission(AdminPermission.CONTENT_MODERATE)
    public List<AdminPostItem> listPosts(@RequestParam(defaultValue = "") String auditStatus,
                                         @RequestParam(defaultValue = "50") int limit) {
        return adminService.listPosts(auditStatus, limit);
    }

    /** 帖子详情（治理用）：运营在审核/下架前查看完整正文与标签。 */
    @GetMapping("/posts/{postId}")
    @RequiresPermission(AdminPermission.CONTENT_MODERATE)
    public AdminPostDetail postDetail(@PathVariable long postId) {
        return adminService.getPostDetail(postId);
    }

    /** 批量下架/恢复帖子。 */
    @PostMapping("/posts/batch-status")
    @RequiresPermission(AdminPermission.CONTENT_MODERATE)
    public Map<String, Object> batchPostStatus(@RequestBody(required = false) AdminBatchStatusRequest request,
                                               @CurrentUser AuthUser actor) {
        List<Long> ids = request == null ? null : request.ids();
        String status = request == null ? null : request.status();
        try {
            int done = adminService.batchPostStatus(ids, status);
            auditService.record(actor.userId(), actor.nickname(), "BATCH_SET_POST_STATUS", "post",
                    ids == null ? null : String.valueOf(ids.size()), status + " × " + done, true);
            return Map.of("ok", true, "changed", done);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "BATCH_SET_POST_STATUS", "post", null,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    /** 帖子下架/恢复。 */
    @PostMapping("/posts/{postId}/status")
    @RequiresPermission(AdminPermission.CONTENT_MODERATE)
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
    @RequiresPermission(AdminPermission.COMMENT_MODERATE)
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
    @RequiresPermission(AdminPermission.RECIPE_MODERATE)
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
    @RequiresPermission(AdminPermission.RECIPE_MODERATE)
    public List<AdminRecipeItem> listRecipes(@RequestParam(defaultValue = "") String keyword,
                                             @RequestParam(defaultValue = "") String status,
                                             @RequestParam(defaultValue = "50") int limit) {
        return adminService.listRecipes(keyword, status, limit);
    }

    /** 菜谱详情（治理用）：运营在下架前查看完整食材与步骤。 */
    @GetMapping("/recipes/{recipeId}")
    @RequiresPermission(AdminPermission.RECIPE_MODERATE)
    public AdminRecipeDetail recipeDetail(@PathVariable long recipeId) {
        return adminService.getRecipeDetail(recipeId);
    }

    /** 评论列表（治理用）：可按帖子与审核状态过滤，含已删除评论。 */
    @GetMapping("/comments")
    @RequiresPermission(AdminPermission.COMMENT_MODERATE)
    public AdminPage<AdminCommentItem> listComments(@RequestParam(required = false) Long postId,
                                                    @RequestParam(required = false) String auditStatus,
                                                    @RequestParam(defaultValue = "0") int page,
                                                    @RequestParam(defaultValue = "50") int size) {
        return adminService.listComments(postId, page, size, auditStatus);
    }

    /** 批量审核评论：一次通过/驳回多条（内容审核的主要效率来源）。 */
    @PostMapping("/comments/batch-status")
    @RequiresPermission(AdminPermission.COMMENT_MODERATE)
    public Map<String, Object> batchCommentStatus(@RequestBody(required = false) AdminBatchStatusRequest request,
                                                  @CurrentUser AuthUser actor) {
        List<Long> ids = request == null ? null : request.ids();
        String status = request == null ? null : request.status();
        try {
            int done = adminService.batchCommentStatus(ids, status);
            auditService.record(actor.userId(), actor.nickname(), "BATCH_REVIEW_COMMENT", "comment",
                    ids == null ? null : String.valueOf(ids.size()), status + " × " + done, true);
            return Map.of("ok", true, "changed", done);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "BATCH_REVIEW_COMMENT", "comment", null,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    /** 评论审核：通过（APPROVED）/ 驳回（REMOVED）。 */
    @PostMapping("/comments/{commentId}/status")
    @RequiresPermission(AdminPermission.COMMENT_MODERATE)
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
    @RequiresPermission(AdminPermission.COMMENT_MODERATE)
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
    @RequiresPermission(AdminPermission.ORDER_VIEW)
    public AdminPage<AdminOrderItem> listOrders(@RequestParam(defaultValue = "") String status,
                                                @RequestParam(defaultValue = "") String from,
                                                @RequestParam(defaultValue = "") String to,
                                                @RequestParam(defaultValue = "") String sort,
                                                @RequestParam(defaultValue = "") String order,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "50") int size) {
        return adminService.listOrders(status, from, to, sort, order, page, size);
    }

    /** 关闭未支付订单（PENDING → CLOSED）。仅站内状态，不会同步关闭微信侧支付单。 */
    @PostMapping("/orders/{outTradeNo}/close")
    @RequiresPermission(AdminPermission.ORDER_MANAGE)
    public Map<String, Object> closeOrder(@PathVariable String outTradeNo, @CurrentUser AuthUser actor) {
        try {
            adminService.closeOrder(actor.userId(), outTradeNo);
            auditService.record(actor.userId(), actor.nickname(), "CLOSE_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo + " note=仅站内标记，未同步微信侧支付单", true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "CLOSE_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo + " err=" + ex.getMessage(), false);
            throw ex;
        }
    }

    /** 退款（PAID → REFUNDED，回收会员权益）。真实资金退款需在微信商户平台人工操作。 */
    @PostMapping("/orders/{outTradeNo}/refund")
    @RequiresPermission(AdminPermission.ORDER_MANAGE)
    public Map<String, Object> refundOrder(@PathVariable String outTradeNo, @CurrentUser AuthUser actor) {
        try {
            adminService.refundOrder(actor.userId(), outTradeNo);
            auditService.record(actor.userId(), actor.nickname(), "REFUND_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo + " note=仅站内标记并回收权益，真实资金未退回，需商户平台操作", true);
            return Map.of("ok", true);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "REFUND_ORDER", "order", null,
                    "outTradeNo=" + outTradeNo + " err=" + ex.getMessage(), false);
            throw ex;
        }
    }

    // ---------- 家庭侧只读数据 ----------
    // 家庭与成员 / 今日菜单 / 购物清单 / 库存。运营只读：需要干预时走家庭侧功能，后台不代用户改数据。
    // 权限沿用 USER_VIEW（与用户管理同域）：超管与客服可见，内容审核员看不到。

    @GetMapping("/families")
    @RequiresPermission(AdminPermission.USER_VIEW)
    public AdminPage<AdminFamilyItem> listFamilies(@RequestParam(defaultValue = "") String keyword,
                                                   @RequestParam(defaultValue = "0") int page,
                                                   @RequestParam(defaultValue = "20") int size) {
        return adminService.listFamilies(keyword, page, size);
    }

    /** 家庭详情下钻：成员 + 最近菜单 + 购物清单 + 库存。 */
    @GetMapping("/families/{familyId}")
    @RequiresPermission(AdminPermission.USER_VIEW)
    public AdminFamilyDetail familyDetail(@PathVariable long familyId) {
        return adminService.familyDetail(familyId);
    }

    @GetMapping("/menus")
    @RequiresPermission(AdminPermission.USER_VIEW)
    public AdminPage<AdminMenuRow> listMenus(@RequestParam(defaultValue = "") String date,
                                             @RequestParam(defaultValue = "") String keyword,
                                             @RequestParam(defaultValue = "0") int page,
                                             @RequestParam(defaultValue = "50") int size) {
        return adminService.listMenus(date, keyword, null, page, size);
    }

    @GetMapping("/shopping")
    @RequiresPermission(AdminPermission.USER_VIEW)
    public AdminPage<AdminShoppingRow> listShopping(@RequestParam(defaultValue = "") String date,
                                                     @RequestParam(defaultValue = "") String status,
                                                     @RequestParam(defaultValue = "0") int page,
                                                     @RequestParam(defaultValue = "50") int size) {
        return adminService.listShoppingLists(date, status, null, page, size);
    }

    @GetMapping("/pantry")
    @RequiresPermission(AdminPermission.USER_VIEW)
    public AdminPage<AdminPantryRow> listPantry(@RequestParam(defaultValue = "") String keyword,
                                                @RequestParam(defaultValue = "0") int page,
                                                @RequestParam(defaultValue = "50") int size) {
        return adminService.listPantry(keyword, null, page, size);
    }

    // ---------- 举报处置 ----------
    // 举报队列只有运营后台一个入口（小程序里的审核页已下线），所以路径统一收在 /api/admin 下。

    @GetMapping("/reports")
    @RequiresPermission(AdminPermission.REPORT_REVIEW)
    public List<CommunityReportItem> listReports(@RequestParam(defaultValue = "") String status) {
        return store.communityReports(status);
    }

    @PostMapping("/reports/{reportId}/review")
    @RequiresPermission(AdminPermission.REPORT_REVIEW)
    public CommunityReportItem reviewReport(@PathVariable long reportId,
                                            @RequestBody(required = false) CommunityReportReviewRequest request,
                                            @CurrentUser AuthUser actor) {
        try {
            CommunityReportItem item = store.reviewCommunityReport(reportId, actor.userId(), request);
            auditService.record(actor.userId(), actor.nickname(), "REVIEW_REPORT", "report", reportId,
                    request == null ? null : request.status(), true);
            return item;
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "REVIEW_REPORT", "report", reportId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    /** 批量处置举报：一次下架/忽略多条。 */
    @PostMapping("/reports/batch-review")
    @RequiresPermission(AdminPermission.REPORT_REVIEW)
    public Map<String, Object> batchReviewReports(@RequestBody(required = false) AdminBatchStatusRequest request,
                                                  @CurrentUser AuthUser actor) {
        List<Long> ids = request == null ? null : request.ids();
        String status = request == null ? null : request.status();
        String note = request == null ? null : request.note();
        try {
            int done = store.batchReviewCommunityReports(ids, actor.userId(), status, note);
            auditService.record(actor.userId(), actor.nickname(), "BATCH_REVIEW_REPORT", "report",
                    ids == null ? null : String.valueOf(ids.size()), status + " × " + done, true);
            return Map.of("ok", true, "changed", done);
        } catch (RuntimeException ex) {
            auditService.record(actor.userId(), actor.nickname(), "BATCH_REVIEW_REPORT", "report", null,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    // ---------- 导入源审核 ----------
    @GetMapping("/imports")
    @RequiresPermission(AdminPermission.IMPORT_REVIEW)
    public List<AdminImportItem> listImports(@RequestParam(defaultValue = "") String auditStatus,
                                             @RequestParam(defaultValue = "50") int limit) {
        return adminService.listImports(auditStatus, limit);
    }

    @PostMapping("/imports/{importId}/status")
    @RequiresPermission(AdminPermission.IMPORT_REVIEW)
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
    @RequiresPermission(AdminPermission.AUDIT_VIEW)
    public AdminPage<AdminAuditItem> listAudit(@RequestParam(defaultValue = "") String keyword,
                                               @RequestParam(defaultValue = "") String from,
                                               @RequestParam(defaultValue = "") String to,
                                               @RequestParam(defaultValue = "") String sort,
                                               @RequestParam(defaultValue = "") String order,
                                               @RequestParam(defaultValue = "0") int page,
                                               @RequestParam(defaultValue = "50") int size) {
        return adminService.listAudit(keyword, from, to, sort, order, page, size);
    }

    /** 导出上限：再大就该走离线任务了，别让一次导出把内存和数据库拖垮。 */
    private static final int EXPORT_MAX_ROWS = 5000;

    /** 购物清单状态 → 中文：导出是给运营看的表，直接吐英文枚举没人看得懂。 */
    private static final Map<String, String> LIST_STATUS_LABEL = Map.of("OPEN", "进行中", "CLOSED", "已结束");

    /**
     * 导出 xlsx（真正的 Excel 文件，不是改后缀的 CSV）。
     * 支持 users / orders / audit / comments / feedback / posts / reports，导出的是当前筛选条件下的全量数据。
     */
    @GetMapping("/export/{kind}")
    @RequiresPermission(AdminPermission.EXPORT)
    public ResponseEntity<byte[]> export(@PathVariable String kind,
                                        @RequestParam(defaultValue = "") String status,
                                        @RequestParam(defaultValue = "") String keyword,
                                        @RequestParam(defaultValue = "") String date,
                                        @RequestParam(defaultValue = "") String from,
                                        @RequestParam(defaultValue = "") String to,
                                        @RequestParam(defaultValue = "") String auditStatus,
                                        @RequestParam(required = false) Long postId,
                                        @CurrentUser AuthUser actor) {
        String sheetName;
        List<String> headers;
        List<List<Object>> rows;
        Set<Integer> moneyCols = Set.of();
        String k = kind == null ? "" : kind.trim().toLowerCase();

        switch (k) {
            case "users" -> {
                sheetName = "用户";
                headers = List.of("ID", "昵称", "手机号", "openid", "角色", "状态", "注册时间");
                List<AdminUserItem> all = collectAll((page, size) -> {
                    AdminUserPage p = adminService.searchUsers(keyword, "id", "desc", page, size);
                    return new AdminPage<>(p.items(), p.total(), p.page(), p.size());
                });
                rows = all.stream().map(u -> List.<Object>of(
                        nz(u.userId()), nz(u.nickname()), nz(u.phone()), nz(u.openid()),
                        u.admin() ? roleLabel(u.adminRole()) : "普通用户",
                        nz(u.status()), nz(u.createdAt()))).toList();
            }
            case "orders" -> {
                sheetName = "订单";
                headers = List.of("ID", "商户单号", "用户ID", "套餐", "金额(元)", "状态", "支付方式", "创建时间", "支付时间");
                List<AdminOrderItem> all = collectAll((page, size) ->
                        adminService.listOrders(status, from, to, "id", "desc", page, size));
                rows = all.stream().map(o -> List.<Object>of(
                        nz(o.orderId()), nz(o.outTradeNo()), nz(o.payerUserId()), nz(o.planName()),
                        o.amountFen() / 100.0, nz(o.status()), nz(o.paymentMethod()),
                        nz(o.createdAt()), nz(o.paidAt()))).toList();
                moneyCols = Set.of(4);
            }
            case "audit" -> {
                sheetName = "审计日志";
                headers = List.of("ID", "操作人", "动作", "对象类型", "对象ID", "详情", "结果", "时间");
                List<AdminAuditItem> all = collectAll((page, size) ->
                        adminService.listAudit(keyword, from, to, "id", "desc", page, size));
                rows = all.stream().map(a -> List.<Object>of(
                        nz(a.id()), nz(a.actorNickname()), nz(a.action()), nz(a.targetType()),
                        nz(a.targetId()), nz(a.detail()), nz(a.result()), nz(a.createdAt()))).toList();
            }
            case "comments" -> {
                sheetName = "评论";
                headers = List.of("ID", "帖子ID", "帖子标题", "作者", "内容", "审核状态", "已删除", "时间");
                List<AdminCommentItem> all = collectAll((page, size) ->
                        adminService.listComments(postId, page, size, auditStatus));
                rows = all.stream().map(c -> List.<Object>of(
                        nz(c.commentId()), nz(c.postId()), nz(c.postTitle()), nz(c.authorNickname()),
                        nz(c.content()), nz(c.auditStatus()), c.deleted() ? "是" : "否",
                        nz(c.createdAt()))).toList();
            }
            case "feedback" -> {
                sheetName = "反馈工单";
                headers = List.of("ID", "用户", "类型", "内容", "联系方式", "状态", "提交时间", "处理时间", "回复");
                List<AdminFeedbackItem> all = collectAll((page, size) ->
                        adminService.listFeedback(status, page, size));
                rows = all.stream().map(f -> List.<Object>of(
                        nz(f.id()), nz(f.nickname()), String.join("、", f.types() == null ? List.of() : f.types()),
                        nz(f.content()), nz(f.contact()), nz(f.status()),
                        nz(f.createdAt()), nz(f.handledAt()), nz(f.reply()))).toList();
            }
            case "posts" -> {
                sheetName = "帖子";
                headers = List.of("ID", "标题", "作者", "状态", "赞", "评论", "时间");
                rows = adminService.listPosts(auditStatus, EXPORT_MAX_ROWS).stream().map(p -> List.<Object>of(
                        nz(p.id()), nz(p.title()), nz(p.author()), nz(p.auditStatus()),
                        nz(p.likeCount()), nz(p.commentCount()), nz(p.createdAt()))).toList();
            }
            case "reports" -> {
                sheetName = "举报";
                headers = List.of("ID", "帖子ID", "帖子标题", "举报人", "原因", "说明", "状态", "时间");
                rows = store.communityReports(status).stream().map(r -> List.<Object>of(
                        nz(r.reportId()), nz(r.postId()), nz(r.postTitle()), nz(r.reporter()),
                        nz(r.reason()), nz(r.description()), nz(r.status()), nz(r.createdAt()))).toList();
            }
            case "families" -> {
                sheetName = "家庭";
                headers = List.of("ID", "家庭名", "创建者", "创建者ID", "成员数", "菜谱数", "菜单数", "创建时间");
                List<AdminFamilyItem> all = collectAll((page, size) ->
                        adminService.listFamilies(keyword, page, size));
                rows = all.stream().map(f -> List.<Object>of(
                        nz(f.familyId()), nz(f.name()), nz(f.ownerNickname()), nz(f.ownerUserId()),
                        f.memberCount(), f.recipeCount(), f.menuCount(), nz(f.createdAt()))).toList();
            }
            case "menus" -> {
                sheetName = "菜单";
                headers = List.of("ID", "家庭", "日期", "状态", "菜品数", "菜品", "更新时间");
                List<AdminMenuRow> all = collectAll((page, size) ->
                        adminService.listMenus(date, keyword, null, page, size));
                rows = all.stream().map(m -> List.<Object>of(
                        nz(m.menuId()), nz(m.familyName()), nz(m.menuDate()), nz(m.status()),
                        m.itemCount(), nz(m.dishes()), nz(m.updatedAt()))).toList();
            }
            case "shopping" -> {
                sheetName = "购物清单";
                headers = List.of("ID", "家庭", "菜单日期", "状态", "已购", "总项数", "创建时间");
                List<AdminShoppingRow> all = collectAll((page, size) ->
                        adminService.listShoppingLists(date, status, null, page, size));
                rows = all.stream().map(s -> List.<Object>of(
                        nz(s.listId()), nz(s.familyName()), nz(s.menuDate()),
                        nz(LIST_STATUS_LABEL.getOrDefault(s.status(), s.status())),
                        s.purchasedCount(), s.totalCount(), nz(s.createdAt()))).toList();
            }
            case "pantry" -> {
                sheetName = "库存";
                headers = List.of("ID", "家庭", "食材", "数量", "单位", "保质期至", "登记时间");
                List<AdminPantryRow> all = collectAll((page, size) ->
                        adminService.listPantry(keyword, null, page, size));
                rows = all.stream().map(p -> List.<Object>of(
                        nz(p.id()), nz(p.familyName()), nz(p.ingredientName()), nz(p.amount()),
                        nz(p.unit()), nz(p.expiresAt()), nz(p.addedAt()))).toList();
            }
            default -> throw new org.springframework.web.server.ResponseStatusException(
                    HttpStatus.BAD_REQUEST, "不支持的导出类型: " + kind);
        }

        byte[] body = com.familymenu.daily.service.XlsxWriter.build(sheetName, headers, rows, moneyCols);
        auditService.record(actor.userId(), actor.nickname(), "EXPORT_XLSX", k, null,
                "rows=" + rows.size(), true);
        String filename = sheetName + "-" + java.time.LocalDate.now() + ".xlsx";
        return ResponseEntity.ok()
                .header(HttpHeaders.CONTENT_DISPOSITION,
                        "attachment; filename=\"export.xlsx\"; filename*=UTF-8''" +
                                java.net.URLEncoder.encode(filename, java.nio.charset.StandardCharsets.UTF_8))
                .contentType(MediaType.parseMediaType(
                        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"))
                .body(body);
    }

    /** 逐页取到上限为止（导出必须是全量，不能只导第一页）。 */
    private <T> List<T> collectAll(java.util.function.BiFunction<Integer, Integer, AdminPage<T>> fetch) {
        List<T> all = new java.util.ArrayList<>();
        int page = 0;
        while (all.size() < EXPORT_MAX_ROWS) {
            AdminPage<T> chunk = fetch.apply(page, 200);
            all.addAll(chunk.items());
            if (chunk.items().size() < 200 || all.size() >= chunk.total()) {
                break;
            }
            page++;
        }
        return all.size() > EXPORT_MAX_ROWS ? all.subList(0, EXPORT_MAX_ROWS) : all;
    }

    private static Object nz(Object value) {
        return value == null ? "" : value;
    }

    private static String roleLabel(String role) {
        AdminRole parsed = AdminRole.parse(role);
        return parsed == null ? "管理员" : parsed.displayName();
    }
}
