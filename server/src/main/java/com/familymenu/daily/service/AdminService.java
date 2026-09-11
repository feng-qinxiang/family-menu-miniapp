package com.familymenu.daily.service;

import com.familymenu.daily.auth.AdminRole;
import com.familymenu.daily.dto.AdminModels.AdminAuditItem;
import com.familymenu.daily.dto.AdminModels.AdminCommentItem;
import com.familymenu.daily.dto.AdminModels.AdminDashboard;
import com.familymenu.daily.dto.AdminModels.AdminFeedbackItem;
import com.familymenu.daily.dto.AdminModels.AdminImportItem;
import com.familymenu.daily.dto.AdminModels.AdminMetricPoint;
import com.familymenu.daily.dto.AdminModels.AdminMetrics;
import com.familymenu.daily.dto.AdminModels.AdminOrderItem;
import com.familymenu.daily.dto.AdminModels.AdminPage;
import com.familymenu.daily.dto.AdminModels.AdminPostItem;
import com.familymenu.daily.dto.AdminModels.AdminRecipeItem;
import com.familymenu.daily.dto.AdminModels.AdminRecipeDetail;
import com.familymenu.daily.dto.AdminModels.AdminIngredient;
import com.familymenu.daily.dto.AdminModels.AdminUserItem;
import com.familymenu.daily.dto.AdminModels.AdminUserPage;
import com.familymenu.daily.payment.PlanCatalog;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.sql.Timestamp;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * 运营管理能力：管理员授予/回收、用户检索。
 *
 * 安全约束：
 * - 首次管理员只能由部署方通过环境变量 ADMIN_OPENIDS 白名单播种，代码不硬编码任何 openid。
 * - 授予/回收必须由已存在管理员发起，禁止自授（自己不能给自己或他人提权当且仅当… 见 grantAdmin）。
 */
@Service
public class AdminService {

    private static final Logger log = LoggerFactory.getLogger(AdminService.class);

    /** 解析 taste_tags_json（历史脏数据可能非法，调用处已做降级）。 */
    private static final com.fasterxml.jackson.databind.ObjectMapper JSON = new com.fasterxml.jackson.databind.ObjectMapper();

    private final JdbcTemplate jdbcTemplate;
    private final List<String> bootstrapOpenids;
    private final com.familymenu.daily.payment.MembershipService membershipService;

    public AdminService(JdbcTemplate jdbcTemplate,
                        com.familymenu.daily.payment.MembershipService membershipService,
                        @Value("${admin.bootstrap-openids:}") String bootstrapOpenidsCsv) {
        this.jdbcTemplate = jdbcTemplate;
        this.membershipService = membershipService;
        this.bootstrapOpenids = Arrays.stream((bootstrapOpenidsCsv == null ? "" : bootstrapOpenidsCsv).split(","))
                .map(String::trim)
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }

    /**
     * 启动时按白名单播种管理员。只做「升权」，绝不降权，避免误删已有管理员。
     * 白名单为空则什么都不做（默认安全）。
     *
     * @return 实际被升权的账号数
     */
    @Transactional
    public int seedBootstrapAdmins() {
        if (bootstrapOpenids.isEmpty()) {
            return 0;
        }
        int promoted = 0;
        for (String openid : bootstrapOpenids) {
            int rows = jdbcTemplate.update(
                    "UPDATE user_account SET is_admin = 1 WHERE openid = ? AND is_admin = 0", openid);
            promoted += rows;
            if (rows == 0) {
                // 不打印 openid 全文，只留尾 4 位，避免日志泄露账号标识
                log.info("bootstrap admin: no matching non-admin account for openid ...{}", tail(openid));
            }
        }
        if (promoted > 0) {
            log.info("bootstrap admin: promoted {} account(s)", promoted);
        }
        return promoted;
    }

    public AdminUserPage searchUsers(String keyword, String sort, String order, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, 100));
        int safePage = Math.max(0, page);
        String kw = keyword == null ? "" : keyword.trim();
        String like = "%" + kw + "%";
        String orderBy = orderByClause(sort, order, USER_SORTABLE, "id");

        Long total = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM user_account
                WHERE (? = '' OR nickname LIKE ? OR phone_number LIKE ? OR openid LIKE ?)
                """, Long.class, kw, like, like, like);

        List<AdminUserItem> items = jdbcTemplate.query("""
                        SELECT id, openid, nickname, avatar_url, phone_number, is_admin, admin_role, status,
                               current_family_id, created_at
                        FROM user_account
                        WHERE (? = '' OR nickname LIKE ? OR phone_number LIKE ? OR openid LIKE ?)
                        """ + orderBy + " LIMIT ? OFFSET ?",
                (rs, rowNum) -> new AdminUserItem(
                        rs.getLong("id"),
                        maskOpenid(rs.getString("openid")),
                        rs.getString("nickname"),
                        rs.getString("avatar_url"),
                        maskPhone(rs.getString("phone_number")),
                        rs.getBoolean("is_admin"),
                        roleName(rs.getBoolean("is_admin"), rs.getString("admin_role")),
                        rs.getString("status"),
                        rs.getObject("current_family_id") == null ? null : rs.getLong("current_family_id"),
                        rs.getString("created_at")
                ),
                kw, like, like, like, safeSize, (long) safePage * safeSize);

        return new AdminUserPage(items, total == null ? 0 : total, safePage, safeSize);
    }

    /**
     * 授予/回收管理员。
     * 禁止自授：actor 不能改自己的管理员状态（防止误操作把自己锁死或凭空提权）。
     */
    @Transactional
    public AdminUserItem setAdmin(long actorUserId, long targetUserId, boolean admin) {
        if (actorUserId == targetUserId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "不能修改自己的管理员状态");
        }
        List<AdminUserItem> found = jdbcTemplate.query("""
                        SELECT id, openid, nickname, avatar_url, phone_number, is_admin, admin_role, status,
                               current_family_id, created_at
                        FROM user_account WHERE id = ?
                        """,
                (rs, rowNum) -> new AdminUserItem(
                        rs.getLong("id"),
                        maskOpenid(rs.getString("openid")),
                        rs.getString("nickname"),
                        rs.getString("avatar_url"),
                        maskPhone(rs.getString("phone_number")),
                        rs.getBoolean("is_admin"),
                        roleName(rs.getBoolean("is_admin"), rs.getString("admin_role")),
                        rs.getString("status"),
                        rs.getObject("current_family_id") == null ? null : rs.getLong("current_family_id"),
                        rs.getString("created_at")
                ),
                targetUserId);
        if (found.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "用户不存在");
        }
        jdbcTemplate.update("UPDATE user_account SET is_admin = ? WHERE id = ?", admin ? 1 : 0, targetUserId);
        log.info("admin grant: actor={} target={} admin={}", actorUserId, targetUserId, admin);
        // 回收管理员时吊销其所有会话，立即生效
        if (!admin) {
            jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", targetUserId);
        }
        return found.get(0);
    }

    /**
     * 设置管理端角色。role 为空 → 撤销管理员；SUPER/MODERATOR/SUPPORT → 授予对应角色。
     *
     * 两条硬约束（否则会把系统锁死或自我提权）：
     * 1. 不能改自己的角色；
     * 2. 系统必须至少保留一名超管（降级最后一个超管会被拒绝）。
     */
    @Transactional
    public AdminUserItem setAdminRole(long actorUserId, long targetUserId, String rawRole) {
        boolean revoke = rawRole == null || rawRole.isBlank();
        AdminRole role = AdminRole.parse(rawRole);
        if (!revoke && role == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "角色只能是 SUPER/MODERATOR/SUPPORT");
        }
        if (actorUserId == targetUserId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "不能修改自己的角色");
        }
        Boolean targetIsSuper = jdbcTemplate.query("""
                SELECT (is_admin = 1 AND (admin_role = 'SUPER' OR admin_role IS NULL))
                FROM user_account WHERE id = ?
                """, rs -> rs.next() ? rs.getBoolean(1) : null, targetUserId);
        if (targetIsSuper == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "用户不存在");
        }
        boolean losingSuper = targetIsSuper && (revoke || role != AdminRole.SUPER);
        if (losingSuper) {
            Long superCount = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM user_account
                    WHERE is_admin = 1 AND status = 'ACTIVE'
                      AND (admin_role = 'SUPER' OR admin_role IS NULL)
                    """, Long.class);
            if (superCount == null || superCount <= 1) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "系统至少要保留一名超级管理员");
            }
        }
        if (revoke) {
            jdbcTemplate.update("UPDATE user_account SET is_admin = 0, admin_role = NULL WHERE id = ?", targetUserId);
            // 回收管理员时吊销其所有会话，立即生效
            jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", targetUserId);
        } else {
            jdbcTemplate.update("UPDATE user_account SET is_admin = 1, admin_role = ? WHERE id = ?",
                    role.name(), targetUserId);
        }
        log.info("admin role change: actor={} target={} role={}",
                actorUserId, targetUserId, revoke ? "NONE" : role.name());
        return findUserById(targetUserId);
    }

    /** 取单个用户（角色变更后回显用）。 */
    private AdminUserItem findUserById(long userId) {
        return jdbcTemplate.query("""
                        SELECT id, openid, nickname, avatar_url, phone_number, is_admin, admin_role, status,
                               current_family_id, created_at
                        FROM user_account WHERE id = ?
                        """,
                (rs, rowNum) -> new AdminUserItem(
                        rs.getLong("id"),
                        maskOpenid(rs.getString("openid")),
                        rs.getString("nickname"),
                        rs.getString("avatar_url"),
                        maskPhone(rs.getString("phone_number")),
                        rs.getBoolean("is_admin"),
                        roleName(rs.getBoolean("is_admin"), rs.getString("admin_role")),
                        rs.getString("status"),
                        rs.getObject("current_family_id") == null ? null : rs.getLong("current_family_id"),
                        rs.getString("created_at")
                ),
                userId).stream().findFirst().orElse(null);
    }

    /** 有效角色名；非管理员返回 null（历史 is_admin=1 且无角色 → SUPER）。 */
    private static String roleName(boolean isAdmin, String rawRole) {
        AdminRole role = AdminRole.of(isAdmin, rawRole);
        return role == null ? null : role.name();
    }

    // ==================== 用户封禁 / 解封 ====================

    /** 封禁（BANNED）或解封（ACTIVE）。封禁同时吊销全部会话，立即生效；禁止封禁自己。 */
    @Transactional
    public AdminUserItem setUserStatus(long actorUserId, long targetUserId, String status) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("BANNED") && !target.equals("ACTIVE")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 ACTIVE/BANNED");
        }
        if (actorUserId == targetUserId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "不能修改自己的账号状态");
        }
        List<AdminUserItem> found = jdbcTemplate.query("""
                        SELECT id, openid, nickname, avatar_url, phone_number, is_admin, admin_role, status,
                               current_family_id, created_at
                        FROM user_account WHERE id = ?
                        """,
                (rs, rowNum) -> new AdminUserItem(
                        rs.getLong("id"),
                        maskOpenid(rs.getString("openid")),
                        rs.getString("nickname"),
                        rs.getString("avatar_url"),
                        maskPhone(rs.getString("phone_number")),
                        rs.getBoolean("is_admin"),
                        roleName(rs.getBoolean("is_admin"), rs.getString("admin_role")),
                        rs.getString("status"),
                        rs.getObject("current_family_id") == null ? null : rs.getLong("current_family_id"),
                        rs.getString("created_at")
                ),
                targetUserId);
        if (found.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "用户不存在");
        }
        // 管理员账号不允许被封禁，避免误操作把平台锁死（先摘管理员才能封）
        if (target.equals("BANNED") && found.get(0).admin()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "不能封禁管理员账号，请先回收其管理员权限");
        }
        jdbcTemplate.update("UPDATE user_account SET status = ? WHERE id = ?", target, targetUserId);
        if (target.equals("BANNED")) {
            jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", targetUserId);
        }
        log.info("admin set user status: actor={} target={} status={}", actorUserId, targetUserId, target);
        return found.get(0);
    }

    /** 手机号脱敏：只留前 3 后 4 */
    private static String maskPhone(String phone) {
        if (phone == null || phone.isBlank()) return "";
        if (phone.length() < 7) return "***";
        return phone.substring(0, 3) + "****" + phone.substring(phone.length() - 4);
    }

    /** openid 脱敏：只留尾 4 位 */
    private static String maskOpenid(String openid) {
        if (openid == null || openid.isBlank()) return "";
        return "..." + tail(openid);
    }

    /** 列表展示用截断：导入源原文很长，只回传前 200 字符 */
    private static String truncateForList(String text) {
        if (text == null) return null;
        return text.length() <= 200 ? text : text.substring(0, 200) + "…";
    }

    private static String tail(String value) {
        if (value == null) return "";
        return value.length() <= 4 ? value : value.substring(value.length() - 4);
    }

    // ==================== 反馈工单 ====================

    public AdminPage<AdminFeedbackItem> listFeedback(String status, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, 200));
        int safePage = Math.max(0, page);
        String st = status == null ? "" : status.trim().toUpperCase();
        Long total = jdbcTemplate.queryForObject(
                "SELECT COUNT(*) FROM feedback_ticket f WHERE (? = '' OR f.status = ?)", Long.class, st, st);
        List<AdminFeedbackItem> items = jdbcTemplate.query("""
                        SELECT f.id, f.user_id, u.nickname, f.types_json, f.content, f.contact,
                               f.images_json, f.status, f.created_at, f.handled_at, f.reply
                        FROM feedback_ticket f
                        LEFT JOIN user_account u ON u.id = f.user_id
                        WHERE (? = '' OR f.status = ?)
                        ORDER BY f.id DESC LIMIT ? OFFSET ?
                        """,
                (rs, rowNum) -> new AdminFeedbackItem(
                        rs.getLong("id"),
                        rs.getLong("user_id"),
                        rs.getString("nickname"),
                        readJsonList(rs.getString("types_json")),
                        rs.getString("content"),
                        rs.getString("contact"),
                        readJsonList(rs.getString("images_json")),
                        rs.getString("status"),
                        rs.getString("created_at"),
                        rs.getString("handled_at"),
                        rs.getString("reply")
                ),
                st, st, safeSize, (long) safePage * safeSize);
        return new AdminPage<>(items, total == null ? 0 : total, safePage, safeSize);
    }

    /** 工单状态流转：OPEN → PROCESSING → CLOSED。 */
    @Transactional
    public AdminFeedbackItem handleFeedback(long actorUserId, long feedbackId, String status, String reply) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("PROCESSING") && !target.equals("CLOSED") && !target.equals("OPEN")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 OPEN/PROCESSING/CLOSED");
        }
        int updated = jdbcTemplate.update("""
                        UPDATE feedback_ticket
                        SET status = ?, handled_by = ?, handled_at = NOW(), reply = ?
                        WHERE id = ?
                        """,
                target, actorUserId, reply == null ? null : reply.trim(), feedbackId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "工单不存在");
        }
        return feedbackById(feedbackId);
    }

    /** 批量审核评论：只处理确实存在的 id，返回实际处理条数。 */
    @Transactional
    public int batchCommentStatus(List<Long> ids, String status) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("APPROVED") && !target.equals("REMOVED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 APPROVED/REMOVED");
        }
        List<Long> clean = normalizeIds(ids);
        if (clean.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请先选择要处理的评论");
        }
        String placeholders = String.join(",", Collections.nCopies(clean.size(), "?"));
        List<Long> existing = jdbcTemplate.queryForList(
                "SELECT id FROM community_post_comment WHERE id IN (" + placeholders + ")",
                Long.class, clean.toArray());
        for (Long id : existing) {
            setCommentAuditStatus(id, target);
        }
        return existing.size();
    }

    /** 批量审核帖子：只处理确实存在的 id。 */
    @Transactional
    public int batchPostStatus(List<Long> ids, String status) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("APPROVED") && !target.equals("REMOVED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 APPROVED/REMOVED");
        }
        List<Long> clean = normalizeIds(ids);
        if (clean.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请先选择要处理的帖子");
        }
        String placeholders = String.join(",", Collections.nCopies(clean.size(), "?"));
        List<Long> existing = jdbcTemplate.queryForList(
                "SELECT id FROM community_post WHERE id IN (" + placeholders + ")",
                Long.class, clean.toArray());
        for (Long id : existing) {
            setPostStatus(id, target);
        }
        return existing.size();
    }

    /** 去重 + 限流（一次最多 100 条），防止一个请求打爆数据库。 */
    private static List<Long> normalizeIds(List<Long> ids) {
        if (ids == null) {
            return List.of();
        }
        return ids.stream()
                .filter(java.util.Objects::nonNull)
                .distinct()
                .limit(100)
                .collect(Collectors.toList());
    }

    /** 按 id 取单条工单（处理完回显用，不能依赖分页列表里恰好有它）。 */
    private AdminFeedbackItem feedbackById(long feedbackId) {
        return jdbcTemplate.query("""
                        SELECT f.id, f.user_id, u.nickname, f.types_json, f.content, f.contact,
                               f.images_json, f.status, f.created_at, f.handled_at, f.reply
                        FROM feedback_ticket f
                        LEFT JOIN user_account u ON u.id = f.user_id
                        WHERE f.id = ?
                        """,
                rs -> rs.next() ? new AdminFeedbackItem(
                        rs.getLong("id"),
                        rs.getLong("user_id"),
                        rs.getString("nickname"),
                        readJsonList(rs.getString("types_json")),
                        rs.getString("content"),
                        rs.getString("contact"),
                        readJsonList(rs.getString("images_json")),
                        rs.getString("status"),
                        rs.getString("created_at"),
                        rs.getString("handled_at"),
                        rs.getString("reply")
                ) : null,
                feedbackId);
    }

    // ==================== 帖子 / 菜谱治理 ====================

    public List<AdminPostItem> listPosts(String auditStatus, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 200));
        String st = auditStatus == null ? "" : auditStatus.trim().toUpperCase();
        return jdbcTemplate.query("""
                        SELECT p.id, p.title, u.nickname, p.audit_status, p.like_count,
                               p.comment_count, p.created_at
                        FROM community_post p
                        LEFT JOIN user_account u ON u.id = p.author_user_id
                        WHERE (? = '' OR p.audit_status = ?)
                        ORDER BY p.id DESC LIMIT ?
                        """,
                (rs, rowNum) -> new AdminPostItem(
                        rs.getLong("id"),
                        rs.getString("title"),
                        rs.getString("nickname"),
                        rs.getString("audit_status"),
                        rs.getInt("like_count"),
                        rs.getInt("comment_count"),
                        rs.getString("created_at")
                ),
                st, st, safeLimit);
    }

    /** 帖子下架/恢复：audit_status = REMOVED / APPROVED。 */
    @Transactional
    public void setPostStatus(long postId, String status) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("REMOVED") && !target.equals("APPROVED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 REMOVED/APPROVED");
        }
        int updated = jdbcTemplate.update(
                "UPDATE community_post SET audit_status = ? WHERE id = ?", target, postId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "帖子不存在");
        }
    }

    /** 评论软删除（运营下架违规评论，不物理删除以便追溯）。 */
    @Transactional
    public void deleteComment(long commentId) {
        int updated = jdbcTemplate.update(
                "UPDATE community_post_comment SET deleted = 1 WHERE id = ?", commentId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "评论不存在");
        }
    }

    /** 菜谱下架/恢复：status = REMOVED / ACTIVE。 */
    @Transactional
    public void setRecipeStatus(long recipeId, String status) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("REMOVED") && !target.equals("ACTIVE")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 REMOVED/ACTIVE");
        }
        int updated = jdbcTemplate.update(
                "UPDATE recipe SET status = ? WHERE id = ?", target, recipeId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "菜谱不存在");
        }
    }

    // ==================== 菜谱列表 / 评论列表 ====================

    /** 菜谱列表（治理用）：keyword 匹配标题，status 过滤 ACTIVE/REMOVED。 */
    public List<AdminRecipeItem> listRecipes(String keyword, String status, int limit) {
        int safeLimit = Math.max(1, Math.min(limit, 200));
        String kw = keyword == null ? "" : keyword.trim();
        String like = "%" + kw + "%";
        String st = status == null ? "" : status.trim().toUpperCase();
        return jdbcTemplate.query("""
                        SELECT r.id, r.title, u.nickname, r.cuisine, r.time_cost, r.status, r.created_at
                        FROM recipe r
                        LEFT JOIN user_account u ON u.id = r.owner_user_id
                        WHERE (? = '' OR r.title LIKE ?)
                          AND (? = '' OR r.status = ?)
                        ORDER BY r.updated_at DESC, r.id DESC LIMIT ?
                        """,
                (rs, rowNum) -> new AdminRecipeItem(
                        rs.getLong("id"),
                        rs.getString("title"),
                        rs.getString("nickname"),
                        rs.getString("cuisine"),
                        rs.getInt("time_cost"),
                        rs.getString("status"),
                        rs.getString("created_at")
                ),
                kw, like, st, st, safeLimit);
    }

    /**
     * 菜谱详情（治理用）：运营在下架前需要看到完整食材与步骤。
     * 与用户端接口不同，这里不做可见性过滤（管理端需要看任意菜谱，含已下架）。
     */
    public AdminRecipeDetail getRecipeDetail(long recipeId) {
        return jdbcTemplate.query("""
                        SELECT r.id, r.title, u.nickname, r.source_type, r.source_url, r.cuisine,
                               r.time_cost, r.servings, r.difficulty, r.summary, r.cover_image,
                               r.taste_tags_json, r.status, r.created_at
                        FROM recipe r
                        LEFT JOIN user_account u ON u.id = r.owner_user_id
                        WHERE r.id = ?
                        """,
                rs -> {
                    if (!rs.next()) {
                        throw new org.springframework.web.server.ResponseStatusException(
                                org.springframework.http.HttpStatus.NOT_FOUND, "recipe not found");
                    }
                    List<String> tags = new ArrayList<>();
                    String rawTags = rs.getString("taste_tags_json");
                    if (rawTags != null && !rawTags.isBlank()) {
                        try {
                            tags = JSON.readValue(rawTags,
                                    new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
                        } catch (Exception ignored) {
                            // 脏数据（非法 JSON）时降级为空标签，不影响详情展示
                        }
                    }
                    return new AdminRecipeDetail(
                            rs.getLong("id"),
                            rs.getString("title"),
                            rs.getString("nickname"),
                            rs.getString("source_type"),
                            rs.getString("source_url"),
                            rs.getString("cuisine"),
                            rs.getInt("time_cost"),
                            rs.getInt("servings"),
                            rs.getString("difficulty"),
                            rs.getString("summary"),
                            rs.getString("cover_image"),
                            tags,
                            rs.getString("status"),
                            rs.getString("created_at"),
                            loadRecipeSteps(recipeId),
                            loadRecipeIngredients(recipeId)
                    );
                },
                recipeId
        );
    }

    private List<String> loadRecipeSteps(long recipeId) {
        return jdbcTemplate.query(
                "SELECT step_text FROM recipe_step WHERE recipe_id = ? ORDER BY step_no ASC",
                (rs, rowNum) -> rs.getString("step_text"),
                recipeId
        );
    }

    private List<AdminIngredient> loadRecipeIngredients(long recipeId) {
        return jdbcTemplate.query("""
                        SELECT ingredient_name, amount, unit
                        FROM recipe_ingredient
                        WHERE recipe_id = ?
                        ORDER BY id ASC
                        """,
                (rs, rowNum) -> new AdminIngredient(
                        rs.getString("ingredient_name"),
                        rs.getString("amount"),
                        rs.getString("unit")
                ),
                recipeId
        );
    }

    /** 评论列表（治理用）：可按帖子与审核状态过滤，包含已软删除的评论（deleted 标记）。 */
    public AdminPage<AdminCommentItem> listComments(Long postId, int page, int size, String auditStatus) {
        int safeSize = Math.max(1, Math.min(size, 200));
        int safePage = Math.max(0, page);
        Long pid = (postId == null || postId <= 0) ? null : postId;
        String st = auditStatus == null ? "" : auditStatus.trim().toUpperCase();
        Long total = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM community_post_comment c
                WHERE (? IS NULL OR c.post_id = ?)
                  AND (? = '' OR c.audit_status = ?)
                """, Long.class, pid, pid, st, st);
        List<AdminCommentItem> items = jdbcTemplate.query("""
                        SELECT c.id, c.post_id, p.title, c.user_id, u.nickname, c.content, c.audit_status,
                               c.deleted, c.created_at
                        FROM community_post_comment c
                        JOIN community_post p ON p.id = c.post_id
                        LEFT JOIN user_account u ON u.id = c.user_id
                        WHERE (? IS NULL OR c.post_id = ?)
                          AND (? = '' OR c.audit_status = ?)
                        ORDER BY c.id DESC LIMIT ? OFFSET ?
                        """,
                (rs, rowNum) -> new AdminCommentItem(
                        rs.getLong("id"),
                        rs.getLong("post_id"),
                        rs.getString("title"),
                        rs.getObject("user_id") == null ? null : rs.getLong("user_id"),
                        rs.getString("nickname"),
                        rs.getString("content"),
                        rs.getString("audit_status"),
                        rs.getBoolean("deleted"),
                        rs.getString("created_at")
                ),
                pid, pid, st, st, safeSize, (long) safePage * safeSize);
        return new AdminPage<>(items, total == null ? 0 : total, safePage, safeSize);
    }

    /**
     * 评论审核：通过（APPROVED）/ 驳回（REMOVED）。
     * 与软删除（deleted）分开：驳回是"内容不合规"，删除是"清理垃圾"，
     * 两者都让评论对公众不可见，但语义不同、可分别追溯。
     */
    @Transactional
    public void setCommentAuditStatus(long commentId, String status) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("APPROVED") && !target.equals("REMOVED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 APPROVED/REMOVED");
        }
        String previous = jdbcTemplate.query(
                "SELECT audit_status FROM community_post_comment WHERE id = ?",
                rs -> rs.next() ? rs.getString(1) : null, commentId);
        if (previous == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "评论不存在");
        }
        if (previous.equals(target)) {
            return; // 幂等：重复点同一个按钮不重复计数
        }
        jdbcTemplate.update(
                "UPDATE community_post_comment SET audit_status = ? WHERE id = ?", target, commentId);
        // comment_count 只统计"已通过"的评论：状态在 APPROVED 与非 APPROVED 之间切换时同步增减。
        boolean wasCounted = previous.equals("APPROVED");
        boolean nowCounted = target.equals("APPROVED");
        if (wasCounted && !nowCounted) {
            jdbcTemplate.update("""
                    UPDATE community_post p
                    JOIN community_post_comment c ON c.post_id = p.id
                    SET p.comment_count = GREATEST(p.comment_count - 1, 0)
                    WHERE c.id = ?
                    """, commentId);
        } else if (!wasCounted && nowCounted) {
            jdbcTemplate.update("""
                    UPDATE community_post p
                    JOIN community_post_comment c ON c.post_id = p.id
                    SET p.comment_count = p.comment_count + 1
                    WHERE c.id = ?
                    """, commentId);
        }
    }

    /** 恢复被误删的评论（软删除的逆操作）。 */
    @Transactional
    public void restoreComment(long commentId) {
        int updated = jdbcTemplate.update(
                "UPDATE community_post_comment SET deleted = 0 WHERE id = ?", commentId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "评论不存在");
        }
    }

    // ==================== 订单 / 会员 ====================

    public AdminPage<AdminOrderItem> listOrders(String status, String from, String to,
                                                String sort, String order, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, 200));
        int safePage = Math.max(0, page);
        String st = status == null ? "" : status.trim().toUpperCase();
        Timestamp fromTs = startOfDay(from);
        Timestamp toTs = endOfDayExclusive(to);
        String orderBy = orderByClause(sort, order, ORDER_SORTABLE, "id");
        Long total = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM payment_order
                WHERE (? = '' OR status = ?)
                  AND (? IS NULL OR created_at >= ?)
                  AND (? IS NULL OR created_at < ?)
                """, Long.class, st, st, fromTs, fromTs, toTs, toTs);
        List<AdminOrderItem> items = jdbcTemplate.query("""
                        SELECT o.id, o.out_trade_no, o.payer_user_id, u.nickname AS payer_nickname,
                               o.plan_code, o.amount_fen, o.duration_days,
                               o.status, o.payment_method, o.created_at, o.paid_at
                        FROM payment_order o
                        LEFT JOIN user_account u ON u.id = o.payer_user_id
                        WHERE (? = '' OR o.status = ?)
                          AND (? IS NULL OR o.created_at >= ?)
                          AND (? IS NULL OR o.created_at < ?)
                        """ + orderBy + " LIMIT ? OFFSET ?",
                (rs, rowNum) -> new AdminOrderItem(
                        rs.getLong("id"),
                        rs.getString("out_trade_no"),
                        rs.getLong("payer_user_id"),
                        rs.getString("payer_nickname"),
                        rs.getString("plan_code"),
                        PlanCatalog.displayName(rs.getString("plan_code")),
                        rs.getLong("amount_fen"),
                        rs.getInt("duration_days"),
                        rs.getString("status"),
                        rs.getString("payment_method"),
                        rs.getString("created_at"),
                        rs.getString("paid_at")
                ),
                st, st, fromTs, fromTs, toTs, toTs, safeSize, (long) safePage * safeSize);
        return new AdminPage<>(items, total == null ? 0 : total, safePage, safeSize);
    }

    /** 人工开通/延长会员（运营补偿、线下付款场景）。写审计。 */
    @Transactional
    public void grantVip(long actorUserId, long targetUserId, String planCode, Integer durationDays) {
        PlanCatalog.Plan plan = PlanCatalog.requireCodeOrDisplayName(planCode);
        int days = durationDays == null || durationDays <= 0 ? plan.durationDays() : durationDays;
        membershipService.grant(targetUserId, plan.code(), days);
        log.info("admin grant vip: actor={} target={} plan={} days={}", actorUserId, targetUserId, plan.code(), days);
    }

    // ==================== 导入源审核 ====================

    /** 导入源待审列表（audit_status = PENDING 永无出口的问题由此闭环）。 */
    public List<AdminImportItem> listImports(String auditStatus, int limit) {
        String st = auditStatus == null ? "" : auditStatus.trim().toUpperCase();
        int safeLimit = Math.max(1, Math.min(limit, 200));
        return jdbcTemplate.query("""
                        SELECT id, source_type, source_url, source_text, parse_status, audit_status,
                               reviewer_user_id, review_note, created_at, resolved_at
                        FROM import_source
                        WHERE (? = '' OR audit_status = ?)
                        ORDER BY id DESC LIMIT ?
                        """,
                (rs, rowNum) -> new AdminImportItem(
                        rs.getLong("id"),
                        rs.getString("source_type"),
                        rs.getString("source_url"),
                        truncateForList(rs.getString("source_text")),
                        rs.getString("parse_status"),
                        rs.getString("audit_status"),
                        rs.getObject("reviewer_user_id") == null ? null : rs.getLong("reviewer_user_id"),
                        rs.getString("review_note"),
                        rs.getString("created_at"),
                        rs.getString("resolved_at")
                ),
                st, st, safeLimit);
    }

    /** 导入源审核：通过（APPROVED）/ 驳回（REJECTED），记录审核人与备注。 */
    @Transactional
    public void setImportStatus(long actorUserId, long importId, String status, String note) {
        String target = status == null ? "" : status.trim().toUpperCase();
        if (!target.equals("APPROVED") && !target.equals("REJECTED")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "状态只能是 APPROVED/REJECTED");
        }
        int updated = jdbcTemplate.update("""
                        UPDATE import_source
                        SET audit_status = ?, reviewer_user_id = ?, review_note = ?, resolved_at = NOW()
                        WHERE id = ?
                        """,
                target, actorUserId,
                note == null || note.isBlank() ? null : note.trim(),
                importId);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "导入源不存在");
        }
        log.info("admin import review: actor={} import={} status={}", actorUserId, importId, target);
    }

    // ==================== 订单关单 / 退款 ====================

    /** 关闭未支付订单：仅 PENDING → CLOSED。 */
    @Transactional
    public void closeOrder(long actorUserId, String outTradeNo) {
        int updated = jdbcTemplate.update(
                "UPDATE payment_order SET status = 'CLOSED' WHERE out_trade_no = ? AND status = 'PENDING'",
                outTradeNo);
        if (updated == 0) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "订单不存在或不是待支付状态，无法关闭");
        }
        log.info("admin close order: actor={} order={}", actorUserId, outTradeNo);
    }

    /**
     * 退款：仅 PAID → REFUNDED，并按订单时长扣减购买者会员有效期（不低于当前时刻）。
     * 真实资金退款由商户平台人工操作，这里只做业务侧状态与权益回收。
     */
    @Transactional
    public void refundOrder(long actorUserId, String outTradeNo) {
        List<AdminOrderItem> found = jdbcTemplate.query("""
                        SELECT o.out_trade_no, o.payer_user_id, u.nickname AS payer_nickname,
                               o.plan_code, o.amount_fen, o.duration_days
                        FROM payment_order o
                        LEFT JOIN user_account u ON u.id = o.payer_user_id
                        WHERE o.out_trade_no = ? AND o.status = 'PAID'
                        """,
                (rs, rowNum) -> new AdminOrderItem(
                        null, rs.getString("out_trade_no"), rs.getLong("payer_user_id"),
                        rs.getString("payer_nickname"), rs.getString("plan_code"), null,
                        rs.getLong("amount_fen"), rs.getInt("duration_days"), "PAID",
                        null, null, null),
                outTradeNo);
        if (found.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "订单不存在或不是已支付状态，无法退款");
        }
        AdminOrderItem order = found.get(0);
        jdbcTemplate.update("UPDATE payment_order SET status = 'REFUNDED' WHERE out_trade_no = ?", outTradeNo);
        // 扣减会员有效期：不低于 NOW()，避免把别的有效订单权益一起清掉
        jdbcTemplate.update("""
                        UPDATE user_membership
                        SET expires_at = GREATEST(DATE_SUB(expires_at, INTERVAL ? DAY), NOW())
                        WHERE payer_user_id = ?
                        """,
                order.durationDays(), order.payerUserId());
        log.info("admin refund order: actor={} order={} payer={} days={}",
                actorUserId, outTradeNo, order.payerUserId(), order.durationDays());
    }

    // ==================== 看板 / 审计 ====================

    public AdminDashboard dashboard() {
        long users = count("SELECT COUNT(*) FROM user_account");
        long families = count("SELECT COUNT(*) FROM family");
        long recipes = count("SELECT COUNT(*) FROM recipe WHERE status = 'ACTIVE'");
        long posts = count("SELECT COUNT(*) FROM community_post WHERE audit_status = 'APPROVED'");
        long pendingPosts = count("SELECT COUNT(*) FROM community_post WHERE audit_status = 'PENDING'");
        long pendingComments = count("SELECT COUNT(*) FROM community_post_comment WHERE audit_status = 'PENDING'");
        long pendingImports = count("SELECT COUNT(*) FROM import_source WHERE audit_status = 'PENDING'");
        long pendingReports = count("SELECT COUNT(*) FROM community_post_report WHERE status = 'PENDING'");
        long openFeedback = count("SELECT COUNT(*) FROM feedback_ticket WHERE status = 'OPEN'");
        long paidOrders = count("SELECT COUNT(*) FROM payment_order WHERE status = 'PAID'");
        long paidRevenue = count("SELECT COALESCE(SUM(amount_fen), 0) FROM payment_order WHERE status = 'PAID'");
        long activeVip = count("SELECT COUNT(DISTINCT payer_user_id) FROM user_membership WHERE expires_at > NOW()");
        return new AdminDashboard(users, families, recipes, posts, pendingPosts, pendingComments,
                pendingImports, pendingReports, openFeedback, paidOrders, paidRevenue, activeVip,
                LocalDateTime.now().toString());
    }

    /**
     * 看板趋势：近 days 天的每日新增（用户/帖子/评论/已支付订单/收入）。
     * 空日补 0，保证前端 X 轴连续；日期锚点取自数据库 NOW()，避免 JVM 与 DB 时区不一致导致错位。
     */
    public AdminMetrics metrics(int days) {
        int span = Math.max(7, Math.min(days, 60));
        LocalDate today = jdbcTemplate.queryForObject("SELECT DATE(NOW())", LocalDate.class);
        if (today == null) {
            today = LocalDate.now();
        }
        LocalDate from = today.minusDays(span - 1L);

        Map<String, long[]> buckets = new LinkedHashMap<>();
        for (int i = 0; i < span; i++) {
            buckets.put(from.plusDays(i).toString(), new long[5]);
        }
        Timestamp fromTs = Timestamp.valueOf(from.atStartOfDay());
        fillDaily(buckets, "SELECT DATE(created_at), COUNT(*) FROM user_account WHERE created_at >= ? GROUP BY 1", fromTs, 0);
        fillDaily(buckets, "SELECT DATE(created_at), COUNT(*) FROM community_post WHERE created_at >= ? GROUP BY 1", fromTs, 1);
        fillDaily(buckets, "SELECT DATE(created_at), COUNT(*) FROM community_post_comment WHERE created_at >= ? GROUP BY 1", fromTs, 2);
        jdbcTemplate.query("""
                        SELECT DATE(paid_at), COUNT(*), COALESCE(SUM(amount_fen), 0)
                        FROM payment_order
                        WHERE status = 'PAID' AND paid_at IS NOT NULL AND paid_at >= ?
                        GROUP BY 1
                        """,
                rs -> {
                    long[] cell = buckets.get(rs.getString(1));
                    if (cell != null) {
                        cell[3] = rs.getLong(2);
                        cell[4] = rs.getLong(3);
                    }
                },
                fromTs);

        List<AdminMetricPoint> series = buckets.entrySet().stream()
                .map(e -> new AdminMetricPoint(e.getKey(),
                        e.getValue()[0], e.getValue()[1], e.getValue()[2], e.getValue()[3], e.getValue()[4]))
                .collect(Collectors.toList());

        List<AdminPostItem> hotPosts = jdbcTemplate.query("""
                        SELECT p.id, p.title, u.nickname, p.audit_status, p.like_count,
                               p.comment_count, p.created_at
                        FROM community_post p
                        LEFT JOIN user_account u ON u.id = p.author_user_id
                        WHERE p.audit_status = 'APPROVED'
                        ORDER BY p.like_count DESC, p.comment_count DESC, p.id DESC
                        LIMIT 5
                        """,
                (rs, rowNum) -> new AdminPostItem(
                        rs.getLong("id"),
                        rs.getString("title"),
                        rs.getString("nickname"),
                        rs.getString("audit_status"),
                        rs.getInt("like_count"),
                        rs.getInt("comment_count"),
                        rs.getString("created_at")
                ));

        List<AdminUserItem> recentUsers = searchUsers("", "", "", 0, 6).items();

        return new AdminMetrics(LocalDateTime.now().toString(), span, series, hotPosts, recentUsers);
    }

    private void fillDaily(Map<String, long[]> buckets, String sql, Timestamp from, int index) {
        jdbcTemplate.query(sql, rs -> {
            long[] cell = buckets.get(rs.getString(1));
            if (cell != null) {
                cell[index] = rs.getLong(2);
            }
        }, from);
    }

    public AdminPage<AdminAuditItem> listAudit(String keyword, String from, String to,
                                               String sort, String order, int page, int size) {
        int safeSize = Math.max(1, Math.min(size, 200));
        int safePage = Math.max(0, page);
        String kw = keyword == null ? "" : keyword.trim();
        String like = "%" + kw + "%";
        Timestamp fromTs = startOfDay(from);
        Timestamp toTs = endOfDayExclusive(to);
        String orderBy = orderByClause(sort, order, AUDIT_SORTABLE, "id");
        Long total = jdbcTemplate.queryForObject("""
                SELECT COUNT(*) FROM admin_audit_log
                WHERE (? = '' OR actor_nickname LIKE ? OR action LIKE ? OR target_type LIKE ?
                       OR target_id LIKE ? OR detail LIKE ? OR result LIKE ?)
                  AND (? IS NULL OR created_at >= ?)
                  AND (? IS NULL OR created_at < ?)
                """, Long.class, kw, like, like, like, like, like, like, fromTs, fromTs, toTs, toTs);
        List<AdminAuditItem> items = jdbcTemplate.query("""
                        SELECT id, actor_user_id, actor_nickname, action, target_type, target_id,
                               detail, result, created_at
                        FROM admin_audit_log
                        WHERE (? = '' OR actor_nickname LIKE ? OR action LIKE ? OR target_type LIKE ?
                               OR target_id LIKE ? OR detail LIKE ? OR result LIKE ?)
                          AND (? IS NULL OR created_at >= ?)
                          AND (? IS NULL OR created_at < ?)
                        """ + orderBy + " LIMIT ? OFFSET ?",
                (rs, rowNum) -> new AdminAuditItem(
                        rs.getLong("id"),
                        rs.getLong("actor_user_id"),
                        rs.getString("actor_nickname"),
                        rs.getString("action"),
                        rs.getString("target_type"),
                        rs.getString("target_id"),
                        rs.getString("detail"),
                        rs.getString("result"),
                        rs.getString("created_at")
                ),
                kw, like, like, like, like, like, like, fromTs, fromTs, toTs, toTs,
                safeSize, (long) safePage * safeSize);
        return new AdminPage<>(items, total == null ? 0 : total, safePage, safeSize);
    }

    // ==================== 列表通用：日期区间 / 排序 ====================

    /** 可排序列白名单：前端传 sort=amount，这里映射成真实列名，绝不拼接用户输入。
     *  订单列表现在 LEFT JOIN 了 user_account（带出付款人昵称），列名必须带 o. 前缀避免歧义。 */
    private static final Map<String, String> ORDER_SORTABLE = Map.of(
            "id", "o.id",
            "amount", "o.amount_fen",
            "createdAt", "o.created_at",
            "paidAt", "o.paid_at");
    private static final Map<String, String> USER_SORTABLE = Map.of(
            "id", "id",
            "createdAt", "created_at");
    private static final Map<String, String> AUDIT_SORTABLE = Map.of(
            "id", "id",
            "createdAt", "created_at");

    /** yyyy-MM-dd → 当天 00:00:00；空或非法返回 null（不筛）。 */
    private static Timestamp startOfDay(String date) {
        LocalDate d = parseDate(date);
        return d == null ? null : Timestamp.valueOf(d.atStartOfDay());
    }

    /** yyyy-MM-dd → 次日 00:00:00（左闭右开，避免漏掉当天 23:59）。 */
    private static Timestamp endOfDayExclusive(String date) {
        LocalDate d = parseDate(date);
        return d == null ? null : Timestamp.valueOf(d.plusDays(1).atStartOfDay());
    }

    private static LocalDate parseDate(String date) {
        if (date == null || date.isBlank()) {
            return null;
        }
        try {
            return LocalDate.parse(date.trim());
        } catch (DateTimeParseException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "日期格式应为 yyyy-MM-dd：" + date);
        }
    }

    /** 生成 ORDER BY 子句；列名只可能来自白名单。 */
    private static String orderByClause(String sort, String order, Map<String, String> allowed, String fallback) {
        String col = allowed.get(sort == null ? "" : sort.trim());
        if (col == null) {
            col = allowed.get(fallback);
        }
        boolean asc = "asc".equalsIgnoreCase(order == null ? "" : order.trim());
        return " ORDER BY " + col + (asc ? " ASC" : " DESC");
    }

    private long count(String sql) {
        Long value = jdbcTemplate.queryForObject(sql, Long.class);
        return value == null ? 0L : value;
    }

    /** 极简 JSON 字符串数组解析（表里存的是 ["a","b"] 形式，避免引入额外依赖）。 */
    private static List<String> readJsonList(String json) {
        if (json == null || json.isBlank()) return List.of();
        String body = json.trim();
        if (body.startsWith("[")) body = body.substring(1);
        if (body.endsWith("]")) body = body.substring(0, body.length() - 1);
        if (body.isBlank()) return List.of();
        return Arrays.stream(body.split(","))
                .map(s -> s.trim().replaceAll("^\"|\"$", ""))
                .filter(s -> !s.isEmpty())
                .collect(Collectors.toList());
    }
}
