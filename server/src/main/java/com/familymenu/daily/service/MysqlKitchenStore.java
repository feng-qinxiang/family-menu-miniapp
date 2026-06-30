package com.familymenu.daily.service;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.dto.ApiModels;
import com.familymenu.daily.dto.ApiModels.AddCookHistoryRequest;
import com.familymenu.daily.dto.ApiModels.CommunityCommentItem;
import com.familymenu.daily.dto.ApiModels.CommunityCommentRequest;
import com.familymenu.daily.dto.ApiModels.CommunityPost;
import com.familymenu.daily.dto.ApiModels.CommunityReportItem;
import com.familymenu.daily.dto.ApiModels.CookHistoryItem;
import com.familymenu.daily.dto.ApiModels.CreateRecipeRequest;
import com.familymenu.daily.dto.ApiModels.HomeDashboard;
import com.familymenu.daily.dto.ApiModels.ImportPreview;
import com.familymenu.daily.dto.ApiModels.IngredientItem;
import com.familymenu.daily.dto.ApiModels.RecipeCard;
import com.familymenu.daily.dto.ApiModels.RecipeDetail;
import com.familymenu.daily.dto.ApiModels.CommunityReportReviewRequest;
import com.familymenu.daily.dto.ApiModels.CommunityReportRequest;
import com.familymenu.daily.dto.ApiModels.UpdateRecipeRequest;
import com.familymenu.daily.dto.ApiModels.VipStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.PreparedStatement;
import java.sql.Statement;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

@Service
public class MysqlKitchenStore {

    private static final Pattern URL_PATTERN = Pattern.compile("(https?://\\S+)");
    private static final TypeReference<List<String>> STRING_LIST = new TypeReference<>() {
    };

    private final JdbcTemplate jdbcTemplate;
    private final ObjectMapper objectMapper;
    private final AuthService authService;
    private final com.familymenu.daily.payment.MembershipService membershipService;

    public MysqlKitchenStore(JdbcTemplate jdbcTemplate, ObjectMapper objectMapper, AuthService authService,
                             com.familymenu.daily.payment.MembershipService membershipService) {
        this.jdbcTemplate = jdbcTemplate;
        this.objectMapper = objectMapper;
        this.authService = authService;
        this.membershipService = membershipService;
    }

    @Transactional
    public void seedDefaults() {
        // 菜谱由 data.sql 负责种入；这里仅补齐 data.sql 没覆盖的种子用户、社区帖子与评论。
        long auntUserId = seedUser("seed-aunt-ning", "阿宁");
        long zhouUserId = seedUser("seed-zhou", "小周");
        long maoUserId = seedUser("seed-mao", "猫猫");

        Long hongshaoRecipeId = findRecipeIdByTitle("红烧肉");
        Long tomatoRecipeId = findRecipeIdByTitle("番茄炒蛋");
        Long broccoliRecipeId = findRecipeIdByTitle("蒜蓉西兰花");

        if (hongshaoRecipeId != null) {
            ensureCommunityPost(hongshaoRecipeId, auntUserId, "周末家常三菜一汤",
                    "这套组合适合一家四口，做起来不复杂，味道比较稳。", 128, 16,
                    List.of("家庭", "三菜一汤", "实用"));
        }
        if (tomatoRecipeId != null) {
            ensureCommunityPost(tomatoRecipeId, zhouUserId, "下班 20 分钟快手餐",
                    "用番茄炒蛋和蒜蓉西兰花，配米饭就够了。", 96, 10,
                    List.of("快手", "晚餐", "省时"));
        }
        if (broccoliRecipeId != null) {
            ensureCommunityPost(broccoliRecipeId, maoUserId, "我把西兰花步骤改顺手了",
                    "蒜末不要炒太久，西兰花焯完沥干再下锅，最后只要快炒几下。", 75, 9,
                    List.of("家常", "配菜", "经验"));
        }

        seedCommunityExtrasIfNeeded();
    }

    public HomeDashboard dashboard(long userId, long familyId) {
        List<RecipeCard> all = listRecipes("all");
        List<RecipeCard> owned = new ArrayList<>();
        List<RecipeCard> community = new ArrayList<>();
        List<RecipeCard> imported = new ArrayList<>();
        for (RecipeCard card : all) {
            switch (card.sourceType() == null ? "" : card.sourceType()) {
                case "owned" -> owned.add(card);
                case "community" -> community.add(card);
                case "imported" -> imported.add(card);
                default -> { }
            }
        }
        // 忌口过滤：收集当前家庭所有 ACTIVE 成员的 avoid_tags，推荐时排除含对应标签的菜谱
        java.util.Set<String> familyAvoidTags = loadFamilyAvoidTags(familyId);
        List<RecipeCard> recommended = new ArrayList<>(all);
        if (!familyAvoidTags.isEmpty()) {
            recommended.removeIf(card -> {
                if (card.tasteTags() == null) return false;
                return card.tasteTags().stream().anyMatch(tag ->
                        familyAvoidTags.contains(tag == null ? "" : tag.trim().toLowerCase(java.util.Locale.ROOT)));
            });
        }
        recommended.sort(Comparator.comparing(RecipeCard::rating, Comparator.nullsLast(Comparator.reverseOrder())));
        return new HomeDashboard(
                "今天做什么",
                List.of("我做过的", "社区热门", "随机推荐", "按食材筛选"),
                recommended.stream().limit(4).toList(),
                owned,
                community,
                imported,
                communityPosts(userId).stream().limit(4).toList(),
                vipStatus(userId)
        );
    }

    /** 查询家庭中所有 ACTIVE 成员的忌口标签合集（小写），用于推荐过滤。 */
    private java.util.Set<String> loadFamilyAvoidTags(long familyId) {
        if (familyId <= 0) {
            return java.util.Set.of();
        }
        java.util.Set<String> result = new java.util.HashSet<>();
        try {
            jdbcTemplate.query("""
                    SELECT avoid_tags_json FROM family_member
                    WHERE family_id = ? AND member_status = 'ACTIVE' AND avoid_tags_json IS NOT NULL
                    """,
                    rs -> {
                        String json = rs.getString("avoid_tags_json");
                        if (json != null && !json.isBlank()) {
                            try {
                                List<String> tags = objectMapper.readValue(json, new com.fasterxml.jackson.core.type.TypeReference<List<String>>() {});
                                for (String t : tags) {
                                    if (t != null && !t.isBlank()) {
                                        result.add(t.trim().toLowerCase(java.util.Locale.ROOT));
                                    }
                                }
                            } catch (Exception ignored) { }
                        }
                    },
                    familyId
            );
        } catch (Exception ex) {
            // avoid_tags_json 列可能尚未存在（旧库未跑 ALTER），降级为空集合
        }
        return result;
    }

    public List<RecipeCard> listRecipes(String source) {
        String normalized = Optional.ofNullable(source).orElse("owned").trim().toLowerCase(Locale.ROOT);
        String sql = """
                SELECT id, title, source_type, source_url, cuisine, taste_tags_json, time_cost, servings, rating, summary, cover_image
                FROM recipe
                WHERE status = 'ACTIVE' AND (? = 'all' OR source_type = ?)
                ORDER BY rating DESC, id DESC
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> new RecipeCard(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getString("source_type"),
                rs.getString("cuisine"),
                readStringList(rs.getString("taste_tags_json")),
                rs.getInt("time_cost"),
                rs.getInt("servings"),
                rs.getDouble("rating"),
                rs.getString("source_url"),
                rs.getString("summary"),
                rs.getString("cover_image")
        ), normalized, normalized);
    }

    @Transactional
    public RecipeCard createRecipe(CreateRecipeRequest request, long ownerUserId, long familyId) {
        String sourceType = normalizeSourceType(request.sourceType());
        long recipeId = insertRecipe(
                ownerUserId,
                familyId,
                request.title(),
                sourceType,
                request.sourceUrl(),
                request.cuisine(),
                List.copyOf(request.tasteTags()),
                request.timeCost() == null ? 15 : request.timeCost(),
                request.servings() == null ? 2 : request.servings(),
                4.5,
                request.summary() == null || request.summary().isBlank()
                        ? request.title() + "，适合家庭快手做法"
                        : request.summary()
        );
        saveSteps(recipeId, request.steps());
        saveIngredients(recipeId, request.ingredients());
        if ("imported".equals(sourceType)) {
            jdbcTemplate.update("""
                            INSERT INTO import_source(source_type, source_url, source_text, parse_status, audit_status)
                            VALUES (?, ?, ?, 'PARSED', 'PENDING')
                            """,
                    request.sourceUrl() == null || request.sourceUrl().isBlank() ? "text" : "link",
                    request.sourceUrl(),
                    request.summary()
            );
        }
        return findRecipeCard(recipeId);
    }

    public List<CommunityPost> communityPosts(long userId) {
        String sql = """
                SELECT p.id, p.title, u.nickname AS author, p.content, p.like_count, p.comment_count, p.tags_json,
                       COALESCE(fav.favorite_count, 0) AS favorite_count,
                       CASE WHEN my_fav.user_id IS NULL THEN 0 ELSE 1 END AS favorited,
                       r.id AS recipe_id, r.title AS recipe_title, r.source_type, r.source_url, r.cuisine,
                       r.taste_tags_json, r.time_cost, r.servings, r.rating, r.summary, r.cover_image
                FROM community_post p
                JOIN user_account u ON u.id = p.author_user_id
                LEFT JOIN recipe r ON r.id = p.recipe_id
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS favorite_count
                    FROM community_post_favorite
                    GROUP BY post_id
                ) fav ON fav.post_id = p.id
                LEFT JOIN community_post_favorite my_fav ON my_fav.post_id = p.id AND my_fav.user_id = ?
                WHERE p.audit_status = 'APPROVED'
                ORDER BY p.like_count DESC, p.id DESC
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            RecipeCard recipe = null;
            long recipeId = rs.getLong("recipe_id");
            if (!rs.wasNull()) {
                recipe = new RecipeCard(
                        recipeId,
                        rs.getString("recipe_title"),
                        rs.getString("source_type"),
                        rs.getString("cuisine"),
                        readStringList(rs.getString("taste_tags_json")),
                        rs.getInt("time_cost"),
                        rs.getInt("servings"),
                        rs.getDouble("rating"),
                        rs.getString("source_url"),
                        rs.getString("summary"),
                        rs.getString("cover_image")
                );
            }
            return new CommunityPost(
                    rs.getLong("id"),
                    rs.getString("title"),
                    rs.getString("author"),
                    rs.getString("content"),
                    rs.getInt("like_count"),
                    rs.getInt("comment_count"),
                    rs.getInt("favorite_count"),
                    rs.getBoolean("favorited"),
                    readStringList(rs.getString("tags_json")),
                    recipe
            );
        }, userId);
    }

    public List<CommunityPost> myFavoritePosts(long userId) {
        String sql = """
                SELECT p.id, p.title, u.nickname AS author, p.content, p.like_count, p.comment_count, p.tags_json,
                       COALESCE(fav.favorite_count, 0) AS favorite_count,
                       1 AS favorited,
                       r.id AS recipe_id, r.title AS recipe_title, r.source_type, r.source_url, r.cuisine,
                       r.taste_tags_json, r.time_cost, r.servings, r.rating, r.summary, r.cover_image
                FROM community_post_favorite my_fav
                JOIN community_post p ON p.id = my_fav.post_id
                JOIN user_account u ON u.id = p.author_user_id
                LEFT JOIN recipe r ON r.id = p.recipe_id
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS favorite_count
                    FROM community_post_favorite
                    GROUP BY post_id
                ) fav ON fav.post_id = p.id
                WHERE my_fav.user_id = ?
                ORDER BY my_fav.id DESC
                """;
        return jdbcTemplate.query(sql, (rs, rowNum) -> {
            RecipeCard recipe = null;
            long recipeId = rs.getLong("recipe_id");
            if (!rs.wasNull()) {
                recipe = new RecipeCard(
                        recipeId,
                        rs.getString("recipe_title"),
                        rs.getString("source_type"),
                        rs.getString("cuisine"),
                        readStringList(rs.getString("taste_tags_json")),
                        rs.getInt("time_cost"),
                        rs.getInt("servings"),
                        rs.getDouble("rating"),
                        rs.getString("source_url"),
                        rs.getString("summary"),
                        rs.getString("cover_image")
                );
            }
            return new CommunityPost(
                    rs.getLong("id"),
                    rs.getString("title"),
                    rs.getString("author"),
                    rs.getString("content"),
                    rs.getInt("like_count"),
                    rs.getInt("comment_count"),
                    rs.getInt("favorite_count"),
                    true,
                    readStringList(rs.getString("tags_json")),
                    recipe
            );
        }, userId);
    }

    @Transactional
    public CommunityPost createCommunityPost(long userId, ApiModels.CreateCommunityPostRequest request) {
        String tagsJson = writeStringList(request.tags() != null ? request.tags() : List.of());
        var keyHolder = new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO community_post (recipe_id, author_user_id, title, content, tags_json, audit_status)
                    VALUES (?, ?, ?, ?, ?, 'APPROVED')
                    """, Statement.RETURN_GENERATED_KEYS);
            if (request.recipeId() == null) {
                ps.setNull(1, java.sql.Types.BIGINT);
            } else {
                ps.setLong(1, request.recipeId());
            }
            ps.setLong(2, userId);
            ps.setString(3, request.title());
            ps.setString(4, request.content());
            ps.setString(5, tagsJson);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("community post insert failed");
        }
        return loadCommunityPostById(key.longValue(), userId);
    }

    public List<CommunityCommentItem> communityComments(long postId) {
        return jdbcTemplate.query("""
                        SELECT c.id, c.post_id, u.nickname AS author, c.content,
                               DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS created_at
                        FROM community_post_comment c
                        JOIN user_account u ON u.id = c.user_id
                        WHERE c.post_id = ?
                        ORDER BY c.id DESC
                        LIMIT 20
                        """,
                (rs, rowNum) -> new CommunityCommentItem(
                        rs.getLong("id"),
                        rs.getLong("post_id"),
                        rs.getString("author"),
                        rs.getString("content"),
                        rs.getString("created_at")
                ),
                postId
        );
    }

    @Transactional
    public CommunityCommentItem addCommunityComment(long postId, long userId, CommunityCommentRequest request) {
        String content = request == null || request.content() == null ? "" : request.content().trim();
        if (content.isBlank()) {
            throw new IllegalArgumentException("comment content required");
        }
        ensureCommunityPostExists(postId);
        jdbcTemplate.update("""
                        INSERT INTO community_post_comment(post_id, user_id, content)
                        VALUES (?, ?, ?)
                        """,
                postId,
                userId,
                content
        );
        jdbcTemplate.update("UPDATE community_post SET comment_count = comment_count + 1 WHERE id = ?", postId);
        return jdbcTemplate.queryForObject("""
                        SELECT c.id, c.post_id, u.nickname AS author, c.content,
                               DATE_FORMAT(c.created_at, '%Y-%m-%d %H:%i') AS created_at
                        FROM community_post_comment c
                        JOIN user_account u ON u.id = c.user_id
                        WHERE c.post_id = ?
                        ORDER BY c.id DESC
                        LIMIT 1
                        """,
                (rs, rowNum) -> new CommunityCommentItem(
                        rs.getLong("id"),
                        rs.getLong("post_id"),
                        rs.getString("author"),
                        rs.getString("content"),
                        rs.getString("created_at")
                ),
                postId
        );
    }

    @Transactional
    public CommunityPost toggleCommunityFavorite(long postId, long userId) {
        ensureCommunityPostExists(postId);
        Integer existing = jdbcTemplate.query("""
                        SELECT 1
                        FROM community_post_favorite
                        WHERE post_id = ? AND user_id = ?
                        LIMIT 1
                        """,
                rs -> rs.next() ? 1 : null,
                postId,
                userId
        );
        if (existing == null) {
            jdbcTemplate.update("""
                            INSERT INTO community_post_favorite(post_id, user_id)
                            VALUES (?, ?)
                            """,
                    postId,
                    userId
            );
        } else {
            jdbcTemplate.update("""
                            DELETE FROM community_post_favorite
                            WHERE post_id = ? AND user_id = ?
                            """,
                    postId,
                    userId
            );
        }
        return findCommunityPost(postId, userId);
    }

    @Transactional
    public void reportCommunityPost(long postId, long userId, CommunityReportRequest request) {
        ensureCommunityPostExists(postId);
        String reason = request == null || request.reason() == null ? "" : request.reason().trim();
        if (reason.isBlank()) {
            reason = "内容不实";
        }
        jdbcTemplate.update("""
                        INSERT INTO community_post_report(post_id, user_id, reason, status)
                        VALUES (?, ?, ?, 'PENDING')
                        """,
                postId,
                userId,
                reason
        );
    }

    public List<CommunityReportItem> communityReports(String status) {
        String normalized = normalizeReportStatus(status);
        return jdbcTemplate.query("""
                        SELECT rpt.id, rpt.post_id, p.title AS post_title, reporter.nickname AS reporter,
                               rpt.reason, rpt.status, reviewer.nickname AS reviewer, rpt.review_note,
                               DATE_FORMAT(rpt.created_at, '%Y-%m-%d %H:%i') AS created_at,
                               DATE_FORMAT(rpt.resolved_at, '%Y-%m-%d %H:%i') AS resolved_at
                        FROM community_post_report rpt
                        JOIN community_post p ON p.id = rpt.post_id
                        JOIN user_account reporter ON reporter.id = rpt.user_id
                        LEFT JOIN user_account reviewer ON reviewer.id = rpt.reviewer_user_id
                        WHERE (? = 'ALL' OR rpt.status = ?)
                        ORDER BY rpt.id DESC
                        LIMIT 50
                        """,
                (rs, rowNum) -> new CommunityReportItem(
                        rs.getLong("id"),
                        rs.getLong("post_id"),
                        rs.getString("post_title"),
                        rs.getString("reporter"),
                        rs.getString("reason"),
                        rs.getString("status"),
                        rs.getString("reviewer"),
                        rs.getString("review_note"),
                        rs.getString("created_at"),
                        rs.getString("resolved_at")
                ),
                normalized,
                normalized
        );
    }

    @Transactional
    public CommunityReportItem reviewCommunityReport(long reportId, long reviewerUserId, CommunityReportReviewRequest request) {
        String status = normalizeReviewActionStatus(request == null ? null : request.status());
        String note = request == null || request.note() == null ? "" : request.note().trim();
        Long postId = jdbcTemplate.query(
                "SELECT post_id FROM community_post_report WHERE id = ?",
                rs -> rs.next() ? rs.getLong("post_id") : null,
                reportId
        );
        if (postId == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "report not found");
        }
        jdbcTemplate.update("""
                        UPDATE community_post_report
                        SET status = ?, reviewer_user_id = ?, review_note = ?, resolved_at = CURRENT_TIMESTAMP
                        WHERE id = ?
                        """,
                status,
                reviewerUserId,
                note,
                reportId
        );
        if ("REJECTED".equals(status) || "REMOVED".equals(status)) {
            jdbcTemplate.update("UPDATE community_post SET audit_status = 'REMOVED' WHERE id = ?", postId);
        } else if ("APPROVED".equals(status) || "REVIEWED".equals(status)) {
            jdbcTemplate.update("UPDATE community_post SET audit_status = 'APPROVED' WHERE id = ?", postId);
        }
        return findCommunityReport(reportId);
    }

    public VipStatus vipStatus(long userId) {
        return membershipService.vipStatus(userId);
    }

    @Transactional
    public VipStatus activateVip(long userId, String planName) {
        // 过渡期入口：将传入值按套餐 code 解析（未知 code 回退年卡），按后端权威时长叠加开通。
        // 金额与时长一律以 PlanCatalog 为准（见 ADR-0006）；正式支付流由 payment 包接管。
        String code = planName == null || planName.isBlank() ? "annual" : planName.trim();
        com.familymenu.daily.payment.PlanCatalog.Plan plan;
        try {
            plan = com.familymenu.daily.payment.PlanCatalog.require(code);
        } catch (RuntimeException ex) {
            plan = com.familymenu.daily.payment.PlanCatalog.require("annual");
        }
        membershipService.grant(userId, plan.code(), plan.durationDays());
        return vipStatus(userId);
    }

    public RecipeDetail getRecipeDetail(long recipeId) {
        return jdbcTemplate.queryForObject("""
                        SELECT id, title, source_type, source_url, cuisine, taste_tags_json,
                               time_cost, servings, rating, summary,
                               DATE_FORMAT(created_at, '%Y-%m-%d %H:%i') AS created_at
                        FROM recipe WHERE id = ? AND status = 'ACTIVE'
                        """,
                (rs, rowNum) -> new RecipeDetail(
                        rs.getLong("id"),
                        rs.getString("title"),
                        rs.getString("source_type"),
                        rs.getString("source_url"),
                        rs.getString("cuisine"),
                        readStringList(rs.getString("taste_tags_json")),
                        rs.getInt("time_cost"),
                        rs.getInt("servings"),
                        rs.getDouble("rating"),
                        rs.getString("summary"),
                        loadSteps(recipeId),
                        loadIngredients(recipeId),
                        rs.getString("created_at")
                ),
                recipeId
        );
    }

    @Transactional
    public RecipeDetail updateRecipe(long recipeId, long actorUserId, long actorFamilyId, UpdateRecipeRequest request) {
        Map<String, Object> owner = jdbcTemplate.query(
                "SELECT owner_user_id, family_id FROM recipe WHERE id = ? AND status = 'ACTIVE'",
                rs -> {
                    if (!rs.next()) return null;
                    Map<String, Object> m = new java.util.HashMap<>();
                    m.put("owner", rs.getLong("owner_user_id"));
                    long fid = rs.getLong("family_id");
                    m.put("family", rs.wasNull() ? null : fid);
                    return m;
                },
                recipeId
        );
        if (owner == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.NOT_FOUND, "recipe not found");
        }
        long ownerUserId = (long) owner.get("owner");
        if (ownerUserId != actorUserId) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "not your recipe");
        }
        StringBuilder sql = new StringBuilder("UPDATE recipe SET updated_at = CURRENT_TIMESTAMP");
        List<Object> params = new ArrayList<>();
        if (request.title() != null && !request.title().isBlank()) {
            sql.append(", title = ?");
            params.add(request.title().trim());
        }
        if (request.cuisine() != null && !request.cuisine().isBlank()) {
            sql.append(", cuisine = ?");
            params.add(request.cuisine().trim());
        }
        if (request.tasteTags() != null) {
            sql.append(", taste_tags_json = ?");
            params.add(writeStringList(request.tasteTags()));
        }
        if (request.timeCost() != null) {
            sql.append(", time_cost = ?");
            params.add(request.timeCost());
        }
        if (request.servings() != null) {
            sql.append(", servings = ?");
            params.add(request.servings());
        }
        if (request.summary() != null) {
            sql.append(", summary = ?");
            params.add(request.summary().trim());
        }
        sql.append(" WHERE id = ?");
        params.add(recipeId);
        jdbcTemplate.update(sql.toString(), params.toArray());
        if (request.steps() != null && !request.steps().isEmpty()) {
            jdbcTemplate.update("DELETE FROM recipe_step WHERE recipe_id = ?", recipeId);
            saveSteps(recipeId, request.steps());
        }
        if (request.ingredients() != null && !request.ingredients().isEmpty()) {
            jdbcTemplate.update("DELETE FROM recipe_ingredient WHERE recipe_id = ?", recipeId);
            saveIngredients(recipeId, request.ingredients());
        }
        return getRecipeDetail(recipeId);
    }

    public List<RecipeCard> filterRecipes(String source, String cuisine, Integer maxTime, Integer minServings, String tag) {
        StringBuilder sql = new StringBuilder("""
                SELECT id, title, source_type, source_url, cuisine, taste_tags_json, time_cost, servings, rating, summary, cover_image
                FROM recipe
                WHERE status = 'ACTIVE'
                """);
        List<Object> params = new ArrayList<>();
        String normalizedSource = normalizeSourceType(source);
        if (!"all".equals(normalizedSource)) {
            sql.append(" AND source_type = ?");
            params.add(normalizedSource);
        }
        if (cuisine != null && !cuisine.isBlank() && !"all".equals(cuisine.trim())) {
            sql.append(" AND cuisine = ?");
            params.add(cuisine.trim());
        }
        if (maxTime != null && maxTime > 0) {
            sql.append(" AND time_cost <= ?");
            params.add(maxTime);
        }
        if (minServings != null && minServings > 0) {
            sql.append(" AND servings >= ?");
            params.add(minServings);
        }
        if (tag != null && !tag.isBlank()) {
            sql.append(" AND JSON_VALID(taste_tags_json) AND JSON_CONTAINS(CAST(taste_tags_json AS JSON), JSON_QUOTE(?))");
            params.add(tag.trim());
        }
        sql.append(" ORDER BY rating DESC, id DESC");
        return jdbcTemplate.query(sql.toString(), (rs, rowNum) -> new RecipeCard(
                rs.getLong("id"),
                rs.getString("title"),
                rs.getString("source_type"),
                rs.getString("cuisine"),
                readStringList(rs.getString("taste_tags_json")),
                rs.getInt("time_cost"),
                rs.getInt("servings"),
                rs.getDouble("rating"),
                rs.getString("source_url"),
                rs.getString("summary"),
                rs.getString("cover_image")
        ), params.toArray());
    }

    @Transactional
    public CookHistoryItem addCookHistory(long userId, long familyId, AddCookHistoryRequest request) {
        if (request == null || request.recipeId() == null) {
            throw new IllegalArgumentException("recipeId required");
        }
        Boolean accessible = jdbcTemplate.query(
                "SELECT 1 FROM recipe WHERE id = ? AND status = 'ACTIVE' AND (owner_user_id = ? OR family_id = ? OR source_type = 'community')",
                rs -> rs.next() ? Boolean.TRUE : null,
                request.recipeId(), userId, familyId
        );
        if (accessible == null) {
            throw new org.springframework.web.server.ResponseStatusException(
                    org.springframework.http.HttpStatus.FORBIDDEN, "recipe not accessible");
        }
        var keyHolder = new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO cook_history(recipe_id, user_id, family_id, score, remark)
                    VALUES (?, ?, ?, ?, ?)
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setLong(1, request.recipeId());
            ps.setLong(2, userId);
            ps.setLong(3, familyId);
            if (request.score() == null) {
                ps.setNull(4, java.sql.Types.INTEGER);
            } else {
                ps.setInt(4, request.score());
            }
            ps.setString(5, request.remark());
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("cook history insert failed");
        }
        return jdbcTemplate.queryForObject("""
                        SELECT ch.id, ch.recipe_id, r.title AS recipe_title,
                               DATE_FORMAT(ch.cooked_at, '%Y-%m-%d %H:%i') AS cooked_at,
                               ch.score, ch.remark
                        FROM cook_history ch
                        JOIN recipe r ON r.id = ch.recipe_id
                        WHERE ch.id = ?
                        """,
                (rs, rowNum) -> new CookHistoryItem(
                        rs.getLong("id"),
                        rs.getLong("recipe_id"),
                        rs.getString("recipe_title"),
                        rs.getString("cooked_at"),
                        rs.getObject("score", Integer.class),
                        rs.getString("remark")
                ),
                key.longValue()
        );
    }

    public List<CookHistoryItem> listCookHistory(long userId) {
        return jdbcTemplate.query("""
                        SELECT ch.id, ch.recipe_id, r.title AS recipe_title,
                               DATE_FORMAT(ch.cooked_at, '%Y-%m-%d %H:%i') AS cooked_at,
                               ch.score, ch.remark
                        FROM cook_history ch
                        JOIN recipe r ON r.id = ch.recipe_id
                        WHERE ch.user_id = ?
                        ORDER BY ch.cooked_at DESC
                        LIMIT 50
                        """,
                (rs, rowNum) -> new CookHistoryItem(
                        rs.getLong("id"),
                        rs.getLong("recipe_id"),
                        rs.getString("recipe_title"),
                        rs.getString("cooked_at"),
                        rs.getObject("score", Integer.class),
                        rs.getString("remark")
                ),
                userId
        );
    }

    private List<String> loadSteps(long recipeId) {
        return jdbcTemplate.query(
                "SELECT step_text FROM recipe_step WHERE recipe_id = ? ORDER BY step_no ASC",
                (rs, rowNum) -> rs.getString("step_text"),
                recipeId
        );
    }

    private List<IngredientItem> loadIngredients(long recipeId) {
        return jdbcTemplate.query(
                "SELECT ingredient_name, amount, unit FROM recipe_ingredient WHERE recipe_id = ? ORDER BY id ASC",
                (rs, rowNum) -> new IngredientItem(
                        rs.getString("ingredient_name"),
                        rs.getString("amount"),
                        rs.getString("unit")
                ),
                recipeId
        );
    }

    public ImportPreview previewImport(String rawText) {
        List<String> lines = rawText.lines()
                .map(String::trim)
                .filter(line -> !line.isBlank())
                .toList();
        String sourceUrl = findUrl(rawText);
        String title = inferTitle(lines, sourceUrl);
        String cuisine = detectCuisine(rawText);
        List<IngredientItem> ingredients = inferIngredients(lines);
        List<String> steps = inferSteps(lines);
        List<String> notes = new ArrayList<>();
        notes.add(sourceUrl == null ? "未发现来源链接" : "已保留来源链接");
        notes.add("导入后请人工确认食材和步骤");
        double confidence = Math.min(0.95, 0.45 + lines.size() * 0.08 + (sourceUrl == null ? 0.0 : 0.15));

        return new ImportPreview(title, sourceUrl == null ? "text" : "link", sourceUrl, cuisine, ingredients, steps, confidence, notes);
    }

    private long insertRecipe(long ownerId, long familyId, String title, String sourceType, String sourceUrl, String cuisine,
                              List<String> tags, int timeCost, int servings, double rating, String summary) {
        var keyHolder = new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            PreparedStatement ps = connection.prepareStatement("""
                    INSERT INTO recipe(title, source_type, source_url, owner_user_id, family_id, cuisine, taste_tags_json,
                                       time_cost, servings, rating, summary, status)
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE')
                    """, Statement.RETURN_GENERATED_KEYS);
            ps.setString(1, title);
            ps.setString(2, normalizeSourceType(sourceType));
            ps.setString(3, sourceUrl);
            ps.setLong(4, ownerId);
            ps.setLong(5, familyId);
            ps.setString(6, cuisine);
            ps.setString(7, writeStringList(tags));
            ps.setInt(8, timeCost);
            ps.setInt(9, servings);
            ps.setDouble(10, rating);
            ps.setString(11, summary);
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("recipe insert failed");
        }
        return key.longValue();
    }

    private void saveSteps(long recipeId, List<String> steps) {
        int index = 1;
        for (String step : steps) {
            jdbcTemplate.update("INSERT INTO recipe_step(recipe_id, step_no, step_text) VALUES (?, ?, ?)", recipeId, index++, step);
        }
    }

    private void saveIngredients(long recipeId, List<IngredientItem> ingredients) {
        for (IngredientItem ingredient : ingredients) {
            jdbcTemplate.update("""
                            INSERT INTO recipe_ingredient(recipe_id, ingredient_name, amount, unit)
                            VALUES (?, ?, ?, ?)
                            """,
                    recipeId,
                    ingredient.name(),
                    Optional.ofNullable(ingredient.amount()).orElse(""),
                    Optional.ofNullable(ingredient.unit()).orElse("")
            );
        }
    }

    private void ensureCommunityPost(long recipeId, long authorUserId, String title, String content,
                                     int likes, int comments, List<String> tags) {
        Long existing = findCommunityPostIdByTitle(title);
        if (existing != null) {
            return;
        }
        jdbcTemplate.update("""
                        INSERT INTO community_post(recipe_id, author_user_id, title, content, like_count, comment_count, tags_json, audit_status)
                        VALUES (?, ?, ?, ?, ?, ?, ?, 'APPROVED')
                        """,
                recipeId,
                authorUserId,
                title,
                content,
                likes,
                comments,
                writeStringList(tags)
        );
    }

    private Long findRecipeIdByTitle(String title) {
        return jdbcTemplate.query(
                "SELECT id FROM recipe WHERE title = ? ORDER BY id ASC LIMIT 1",
                rs -> rs.next() ? rs.getLong("id") : null,
                title
        );
    }

    private long seedUser(String openid, String nickname) {
        jdbcTemplate.update("""
                        INSERT INTO user_account(openid, nickname, avatar_url)
                        VALUES (?, ?, '')
                        ON DUPLICATE KEY UPDATE nickname = VALUES(nickname)
                        """,
                openid,
                nickname
        );
        Long userId = jdbcTemplate.queryForObject("SELECT id FROM user_account WHERE openid = ?", Long.class, openid);
        if (userId == null) {
            throw new IllegalStateException("seed user not created");
        }
        return userId;
    }

    private void seedComment(long postId, long authorUserId, String content) {
        jdbcTemplate.update("""
                        INSERT INTO community_post_comment(post_id, user_id, content)
                        VALUES (?, ?, ?)
                        """,
                postId,
                authorUserId,
                content
        );
    }

    private void seedCommunityExtrasIfNeeded() {
        Integer commentCount = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM community_post_comment", Integer.class);
        if (commentCount != null && commentCount > 0) {
            return;
        }
        Long gongbaoPostId = findCommunityPostIdByTitle("周末家常三菜一汤");
        Long tomatoPostId = findCommunityPostIdByTitle("下班 20 分钟快手餐");
        Long broccoliPostId = findCommunityPostIdByTitle("我把西兰花步骤改顺手了");
        Long ownerId = authService.resolveUserIdOrGuest(null);
        if (gongbaoPostId != null) {
            seedComment(gongbaoPostId, ownerId, "这套搭配稳，适合周末。");
            seedComment(gongbaoPostId, ownerId, "我会把辣度稍微调低一点。");
        }
        if (tomatoPostId != null) {
            seedComment(tomatoPostId, ownerId, "这个组合确实快，晚饭很实用。");
        }
        if (broccoliPostId != null) {
            seedComment(broccoliPostId, ownerId, "导入后最好再把步骤拆细一点。");
        }
    }

    private CommunityReportItem findCommunityReport(long reportId) {
        return jdbcTemplate.queryForObject("""
                        SELECT rpt.id, rpt.post_id, p.title AS post_title, reporter.nickname AS reporter,
                               rpt.reason, rpt.status, reviewer.nickname AS reviewer, rpt.review_note,
                               DATE_FORMAT(rpt.created_at, '%Y-%m-%d %H:%i') AS created_at,
                               DATE_FORMAT(rpt.resolved_at, '%Y-%m-%d %H:%i') AS resolved_at
                        FROM community_post_report rpt
                        JOIN community_post p ON p.id = rpt.post_id
                        JOIN user_account reporter ON reporter.id = rpt.user_id
                        LEFT JOIN user_account reviewer ON reviewer.id = rpt.reviewer_user_id
                        WHERE rpt.id = ?
                        """,
                (rs, rowNum) -> new CommunityReportItem(
                        rs.getLong("id"),
                        rs.getLong("post_id"),
                        rs.getString("post_title"),
                        rs.getString("reporter"),
                        rs.getString("reason"),
                        rs.getString("status"),
                        rs.getString("reviewer"),
                        rs.getString("review_note"),
                        rs.getString("created_at"),
                        rs.getString("resolved_at")
                ),
                reportId
        );
    }

    private RecipeCard findRecipeCard(long recipeId) {
        return jdbcTemplate.queryForObject("""
                        SELECT id, title, source_type, source_url, cuisine, taste_tags_json, time_cost, servings, rating, summary, cover_image
                        FROM recipe WHERE id = ?
                        """,
                (rs, rowNum) -> new RecipeCard(
                        rs.getLong("id"),
                        rs.getString("title"),
                        rs.getString("source_type"),
                        rs.getString("cuisine"),
                        readStringList(rs.getString("taste_tags_json")),
                        rs.getInt("time_cost"),
                        rs.getInt("servings"),
                        rs.getDouble("rating"),
                        rs.getString("source_url"),
                        rs.getString("summary"),
                        rs.getString("cover_image")
                ),
                recipeId
        );
    }

    private Long findCommunityPostIdByTitle(String title) {
        return jdbcTemplate.query("""
                        SELECT id
                        FROM community_post
                        WHERE title = ?
                        ORDER BY id DESC
                        LIMIT 1
                        """,
                rs -> rs.next() ? rs.getLong("id") : null,
                title
        );
    }

    private CommunityPost findCommunityPost(long postId, long userId) {
        CommunityPost found = loadCommunityPostById(postId, userId);
        if (found == null) {
            throw new IllegalArgumentException("community post not found");
        }
        return found;
    }

    private CommunityPost loadCommunityPostById(long postId, long userId) {
        String sql = """
                SELECT p.id, p.title, u.nickname AS author, p.content, p.like_count, p.comment_count, p.tags_json,
                       COALESCE(fav.favorite_count, 0) AS favorite_count,
                       CASE WHEN my_fav.user_id IS NULL THEN 0 ELSE 1 END AS favorited,
                       r.id AS recipe_id, r.title AS recipe_title, r.source_type, r.source_url, r.cuisine,
                       r.taste_tags_json, r.time_cost, r.servings, r.rating, r.summary, r.cover_image
                FROM community_post p
                JOIN user_account u ON u.id = p.author_user_id
                LEFT JOIN recipe r ON r.id = p.recipe_id
                LEFT JOIN (
                    SELECT post_id, COUNT(*) AS favorite_count
                    FROM community_post_favorite
                    WHERE post_id = ?
                    GROUP BY post_id
                ) fav ON fav.post_id = p.id
                LEFT JOIN community_post_favorite my_fav ON my_fav.post_id = p.id AND my_fav.user_id = ?
                WHERE p.id = ?
                LIMIT 1
                """;
        return jdbcTemplate.query(sql, rs -> {
            if (!rs.next()) {
                return null;
            }
            RecipeCard recipe = null;
            long recipeId = rs.getLong("recipe_id");
            if (!rs.wasNull()) {
                recipe = new RecipeCard(
                        recipeId,
                        rs.getString("recipe_title"),
                        rs.getString("source_type"),
                        rs.getString("cuisine"),
                        readStringList(rs.getString("taste_tags_json")),
                        rs.getInt("time_cost"),
                        rs.getInt("servings"),
                        rs.getDouble("rating"),
                        rs.getString("source_url"),
                        rs.getString("summary"),
                        rs.getString("cover_image")
                );
            }
            return new CommunityPost(
                    rs.getLong("id"),
                    rs.getString("title"),
                    rs.getString("author"),
                    rs.getString("content"),
                    rs.getInt("like_count"),
                    rs.getInt("comment_count"),
                    rs.getInt("favorite_count"),
                    rs.getBoolean("favorited"),
                    readStringList(rs.getString("tags_json")),
                    recipe
            );
        }, postId, userId, postId);
    }

    private void ensureCommunityPostExists(long postId) {
        Integer exists = jdbcTemplate.query("""
                        SELECT 1
                        FROM community_post
                        WHERE id = ?
                        LIMIT 1
                        """,
                rs -> rs.next() ? 1 : null,
                postId
        );
        if (exists == null) {
            throw new IllegalArgumentException("community post not found");
        }
    }

    private String normalizeReportStatus(String status) {
        if (status == null || status.isBlank()) {
            return "PENDING";
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "ALL", "PENDING", "REVIEWED", "IGNORED", "APPROVED", "REJECTED", "REMOVED" -> normalized;
            default -> "PENDING";
        };
    }

    private String normalizeReviewActionStatus(String status) {
        if (status == null || status.isBlank()) {
            return "REVIEWED";
        }
        String normalized = status.trim().toUpperCase(Locale.ROOT);
        return switch (normalized) {
            case "APPROVED", "REJECTED", "REMOVED", "REVIEWED", "IGNORED" -> normalized;
            default -> "REVIEWED";
        };
    }

    private String writeStringList(List<String> values) {
        try {
            return objectMapper.writeValueAsString(values == null ? List.of() : values);
        } catch (Exception ex) {
            throw new IllegalArgumentException("Unable to write tags", ex);
        }
    }

    private List<String> readStringList(String json) {
        if (json == null || json.isBlank()) {
            return List.of();
        }
        try {
            return objectMapper.readValue(json, STRING_LIST);
        } catch (Exception ex) {
            return List.of();
        }
    }

    private String normalizeSourceType(String sourceType) {
        if (sourceType == null || sourceType.isBlank()) {
            return "owned";
        }
        String normalized = sourceType.trim().toLowerCase(Locale.ROOT);
        return switch (normalized) {
            case "community", "imported", "owned" -> normalized;
            default -> "owned";
        };
    }

    private String findUrl(String rawText) {
        Matcher matcher = URL_PATTERN.matcher(rawText);
        return matcher.find() ? matcher.group(1) : null;
    }

    private String inferTitle(List<String> lines, String sourceUrl) {
        if (lines.isEmpty()) {
            return "导入菜谱";
        }
        String first = lines.get(0);
        if (first.length() <= 30 && !first.contains("http")) {
            return first;
        }
        return sourceUrl == null ? "导入菜谱" : "外链菜谱";
    }

    private String detectCuisine(String rawText) {
        if (rawText.contains("川") || rawText.contains("麻辣") || rawText.contains("豆瓣")) {
            return "川菜";
        }
        if (rawText.contains("粤") || rawText.contains("蒸")) {
            return "粤菜";
        }
        if (rawText.contains("湘") || rawText.contains("辣椒")) {
            return "湘菜";
        }
        return "家常";
    }

    private List<IngredientItem> inferIngredients(List<String> lines) {
        List<String> candidates = lines.stream()
                .filter(line -> line.matches(".*(\\d+\\s?(g|克|kg|斤|两|ml|毫升|个|只|颗|瓣|勺|片|根|碗|杯)).*"))
                .limit(6)
                .toList();
        if (candidates.isEmpty()) {
            candidates = lines.stream()
                    .skip(1)
                    .filter(line -> !line.matches("^[0-9一二三四五六七八九十]+[、.\\)]?.*"))
                    .limit(5)
                    .toList();
        }
        return candidates.stream()
                .map(line -> new IngredientItem(line, "", ""))
                .toList();
    }

    private List<String> inferSteps(List<String> lines) {
        List<String> steps = lines.stream()
                .filter(line -> line.matches("^[0-9一二三四五六七八九十]+[、.\\)]?.*") || line.contains("步骤") || line.contains("做法"))
                .toList();
        if (!steps.isEmpty()) {
            return steps;
        }
        return lines.stream()
                .filter(line -> line.length() > 4)
                .skip(1)
                .limit(5)
                .toList();
    }
}
