package com.familymenu.daily.service;

import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.dto.AuthModels.LoginRequest;
import com.familymenu.daily.dto.AuthModels.LoginResponse;
import com.familymenu.daily.dto.AuthModels.OtpChallenge;
import com.familymenu.daily.dto.AuthModels.OtpLoginRequest;
import com.familymenu.daily.dto.AuthModels.OtpRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.HexFormat;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ThreadLocalRandom;

@Service
public class AuthService {

    private static final Logger log = LoggerFactory.getLogger(AuthService.class);
    private static final String SEED_GUEST_OPENID = "guest-family-menu-user";
    private static final String GUEST_OPENID_PREFIX = "guest-";

    private final JdbcTemplate jdbcTemplate;
    private final RestClient restClient;
    private final com.familymenu.daily.payment.MembershipService membershipService;
    private final SmsGateway smsGateway;
    private final String appId;
    private final String appSecret;
    private final boolean devOtpEnabled;
    private final boolean wechatConfigured;
    private final ConcurrentHashMap<String, AuthUser> guestCache = new ConcurrentHashMap<>();
    // ponytail: 内存态验证码试错限流（failCount, lockUntilEpochMillis）；重启清零可接受，升级路径为落库
    private final ConcurrentHashMap<String, long[]> phoneOtpAttempts = new ConcurrentHashMap<>();
    private static final int OTP_MAX_FAILURES = 5;
    private static final long OTP_LOCK_MILLIS = 15 * 60 * 1000L;

    public AuthService(JdbcTemplate jdbcTemplate,
                       com.familymenu.daily.payment.MembershipService membershipService,
                       SmsGateway smsGateway,
                       @Value("${wechat.app-id:}") String appId,
                       @Value("${wechat.app-secret:}") String appSecret,
                       @Value("${auth.dev-otp-enabled:true}") boolean devOtpEnabled) {
        this.jdbcTemplate = jdbcTemplate;
        this.membershipService = membershipService;
        this.smsGateway = smsGateway;
        this.restClient = RestClient.create();
        this.appId = appId == null ? "" : appId.trim();
        this.appSecret = appSecret == null ? "" : appSecret.trim();
        this.devOtpEnabled = devOtpEnabled;
        this.wechatConfigured = !this.appId.isEmpty() && !this.appSecret.isEmpty();
        if (!this.wechatConfigured) {
            log.warn("WeChat credentials not configured. /api/auth/login will reject real WeChat codes; only /api/auth/guest is available.");
        }
    }

    @Transactional
    public LoginResponse guestLogin() {
        return guestLoginWithDevice(null);
    }

    @Transactional
    public LoginResponse guestLoginWithDevice(String deviceFingerprint) {
        AuthUser user = ensureGuestAccount(deviceFingerprint);
        ensureDemoDataForFamily(user.userId(), user.familyId());
        String token = createSession(user.userId(), "guest");
        return new LoginResponse(token, user);
    }

    @Transactional
    public LoginResponse login(LoginRequest request) {
        if (request == null || isBlank(request.code())) {
            return guestLogin();
        }
        String nickname = isBlank(request.nickname()) ? "阿昊" : request.nickname().trim();
        String avatarUrl = request.avatarUrl() == null ? "" : request.avatarUrl().trim();
        String openid = resolveWechatOpenid(request.code());
        return loginByOpenid(openid, nickname, avatarUrl, "wechat");
    }

    @Transactional
    public OtpChallenge requestPhoneOtp(OtpRequest request) {
        String phone = normalizePhone(request == null ? null : request.phone());

        // 速率限制：同一手机号 1 小时内最多 5 次
        Integer recentCount = jdbcTemplate.queryForObject(
                "SELECT COUNT(1) FROM phone_otp WHERE phone = ? AND created_at > DATE_SUB(NOW(), INTERVAL 1 HOUR)",
                Integer.class, phone);
        if (recentCount != null && recentCount >= 5) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "发送过于频繁，请稍后再试");
        }

        String code = devOtpEnabled ? "246810" : String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
        jdbcTemplate.update("UPDATE phone_otp SET consumed_at = NOW() WHERE phone = ? AND consumed_at IS NULL", phone);
        jdbcTemplate.update(
                "INSERT INTO phone_otp(phone, code_hash, expires_at) VALUES (?, ?, ?)",
                phone,
                buildOtpHash(phone, code),
                LocalDateTime.now().plusMinutes(5)
        );
        // 调用短信网关 SPI，未配置时 NoopSmsGateway 记录 WARN 日志
        smsGateway.send(phone, code);
        return new OtpChallenge(phone, 300, devOtpEnabled ? "DEV" : "SMS", devOtpEnabled ? code : "");
    }

    @Transactional
    public LoginResponse loginWithPhoneOtp(OtpLoginRequest request) {
        String phone = normalizePhone(request == null ? null : request.phone());
        String code = request == null ? "" : request.code();
        if (code == null || !code.matches("\\d{6}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid otp code");
        }
        long[] attempt = phoneOtpAttempts.get(phone);
        if (attempt != null && attempt[1] > System.currentTimeMillis()) {
            throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "验证码错误次数过多，请 15 分钟后再试");
        }
        Long otpId = jdbcTemplate.query("""
                SELECT id
                FROM phone_otp
                WHERE phone = ? AND code_hash = ? AND consumed_at IS NULL AND expires_at > NOW()
                ORDER BY id DESC
                LIMIT 1
                """, rs -> rs.next() ? rs.getLong("id") : null, phone, buildOtpHash(phone, code));
        if (otpId == null) {
            long[] entry = phoneOtpAttempts.computeIfAbsent(phone, k -> new long[2]);
            entry[0]++;
            if (entry[0] >= OTP_MAX_FAILURES) {
                entry[1] = System.currentTimeMillis() + OTP_LOCK_MILLIS;
                entry[0] = 0;
                throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "验证码错误次数过多，已锁定 15 分钟");
            }
            throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "otp code expired or invalid");
        }
        phoneOtpAttempts.remove(phone);
        jdbcTemplate.update("UPDATE phone_otp SET consumed_at = NOW() WHERE id = ?", otpId);
        String nickname = isBlank(request.nickname()) ? "手机用户" + phone.substring(phone.length() - 4) : request.nickname().trim();
        String avatarUrl = request.avatarUrl() == null ? "" : request.avatarUrl().trim();
        return loginByPhone(phone, nickname, avatarUrl);
    }

    public Optional<AuthUser> resolveToken(String token) {
        if (isBlank(token)) {
            return Optional.empty();
        }
        String sql = """
                SELECT u.id, u.nickname, u.avatar_url, u.is_admin, u.phone_number, s.expires_at
                FROM user_session s
                JOIN user_account u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > NOW()
                """;
        return jdbcTemplate.query(sql, rs -> {
            if (!rs.next()) {
                return Optional.empty();
            }
            long userId = rs.getLong("id");
            Long familyId = findOrCreateDefaultFamily(userId);
            LocalDateTime expiresAt = rs.getTimestamp("expires_at").toLocalDateTime();
            if (expiresAt.isBefore(LocalDateTime.now().plusDays(15))) {
                jdbcTemplate.update("UPDATE user_session SET expires_at = ? WHERE token = ?",
                        LocalDateTime.now().plusDays(30), token.trim());
            }
            com.familymenu.daily.payment.MembershipService.Coverage coverage =
                    membershipService.resolveCoverage(userId);
            return Optional.of(new AuthUser(
                    userId,
                    familyId,
                    rs.getString("nickname"),
                    rs.getString("avatar_url"),
                    coverage.vip(),
                    com.familymenu.daily.payment.PlanCatalog.displayName(coverage.planCode()),
                    rs.getBoolean("is_admin"),
                    rs.getString("phone_number") != null && !rs.getString("phone_number").isBlank()
            ));
        }, token.trim());
    }

    public long resolveUserIdOrGuest(String token) {
        return resolveOrGuest(token).userId();
    }

    public long resolveFamilyIdOrGuest(String token) {
        return resolveOrGuest(token).familyId();
    }

    public AuthUser resolveOrGuest(String token) {
        return resolveToken(token).orElseGet(this::resolveGuestAccount);
    }

    public AuthUser requireAuthenticatedUser(String token) {
        return resolveToken(token).orElseThrow(() ->
                new ResponseStatusException(HttpStatus.UNAUTHORIZED, "auth token required"));
    }

    public AuthUser requireAdminUser(String token) {
        AuthUser user = requireAuthenticatedUser(token);
        if (!user.admin()) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "admin role required");
        }
        return user;
    }

    @Transactional
    public AuthUser updateProfile(AuthUser current, String nickname, String avatarUrl, String phone) {
        long userId = current.userId();
        if (nickname != null && !nickname.isBlank()) {
            jdbcTemplate.update("UPDATE user_account SET nickname = ? WHERE id = ?", nickname.trim(), userId);
        }
        if (avatarUrl != null) {
            jdbcTemplate.update("UPDATE user_account SET avatar_url = ? WHERE id = ?", avatarUrl.trim(), userId);
        }
        if (phone != null && !phone.isBlank()) {
            String normalized = normalizePhone(phone);
            jdbcTemplate.update("UPDATE user_account SET phone_number = ? WHERE id = ?", normalized, userId);
        }
        guestCache.clear();
        return loadUser(userId, current.familyId());
    }

    private LoginResponse loginByOpenid(String openid, String nickname, String avatarUrl, String loginType) {
        upsertUser(openid, nickname, avatarUrl);
        long userId = findUserId(openid);
        long familyId = findOrCreateDefaultFamily(userId);
        String token = createSession(userId, loginType);
        AuthUser user = loadUser(userId, familyId);
        ensureDemoDataForFamily(userId, familyId);
        return new LoginResponse(token, user);
    }

    private LoginResponse loginByPhone(String phone, String nickname, String avatarUrl) {
        // 优先认领已绑定该手机号的既有账号（编辑资料绑定或 addMember 占位账号），避免"验证码登录变新号、数据全丢"
        Long existingUserId = jdbcTemplate.query(
                "SELECT id FROM user_account WHERE phone_number = ? ORDER BY id LIMIT 1",
                rs -> rs.next() ? rs.getLong("id") : null, phone);
        if (existingUserId != null) {
            long userId = existingUserId;
            long familyId = findOrCreateDefaultFamily(userId);
            String token = createSession(userId, "phone");
            AuthUser user = loadUser(userId, familyId);
            ensureDemoDataForFamily(userId, familyId);
            return new LoginResponse(token, user);
        }
        String openid = "phone-" + sha256Hex(phone).substring(0, 32);
        upsertPhoneUser(openid, phone, nickname, avatarUrl);
        long userId = findUserId(openid);
        long familyId = findOrCreateDefaultFamily(userId);
        String token = createSession(userId, "phone");
        AuthUser user = loadUser(userId, familyId);
        ensureDemoDataForFamily(userId, familyId);
        return new LoginResponse(token, user);
    }

    private String createSession(long userId, String loginType) {
        String token = UUID.randomUUID().toString().replace("-", "");
        jdbcTemplate.update(
                "INSERT INTO user_session(token, user_id, login_type, expires_at) VALUES (?, ?, ?, ?)",
                token,
                userId,
                loginType,
                LocalDateTime.now().plusDays(30)
        );
        return token;
    }

    private AuthUser ensureGuestAccount(String deviceFingerprint) {
        String openid = isBlank(deviceFingerprint)
                ? SEED_GUEST_OPENID
                : GUEST_OPENID_PREFIX + sha256Hex(deviceFingerprint.trim()).substring(0, 32);
        AuthUser cached = guestCache.get(openid);
        if (cached != null) {
            return cached;
        }
        upsertUser(openid, "阿昊", "");
        long userId = findUserId(openid);
        long familyId = findOrCreateDefaultFamily(userId);
        AuthUser user = loadUser(userId, familyId);
        guestCache.put(openid, user);
        return user;
    }

    private AuthUser resolveGuestAccount() {
        AuthUser cached = guestCache.get(SEED_GUEST_OPENID);
        if (cached != null) {
            return cached;
        }
        Long userId = jdbcTemplate.query(
                "SELECT id FROM user_account WHERE openid = ?",
                rs -> rs.next() ? rs.getLong("id") : null,
                SEED_GUEST_OPENID
        );
        if (userId == null) {
            return ensureGuestAccount(null);
        }
        Long familyId = jdbcTemplate.query("""
                SELECT f.id FROM family f
                JOIN family_member m ON m.family_id = f.id
                WHERE m.user_id = ?
                ORDER BY f.id LIMIT 1
                """, rs -> rs.next() ? rs.getLong("id") : null, userId);
        if (familyId == null) {
            return ensureGuestAccount(null);
        }
        AuthUser user = loadUser(userId, familyId);
        guestCache.put(SEED_GUEST_OPENID, user);
        return user;
    }

    private AuthUser loadUser(long userId, long familyId) {
        com.familymenu.daily.payment.MembershipService.Coverage coverage =
                membershipService.resolveCoverage(userId);
        return jdbcTemplate.queryForObject("""
                        SELECT id, nickname, avatar_url, is_admin, phone_number
                        FROM user_account
                        WHERE id = ?
                        """,
                (rs, rowNum) -> new AuthUser(
                        rs.getLong("id"),
                        familyId,
                        rs.getString("nickname"),
                        rs.getString("avatar_url"),
                        coverage.vip(),
                        com.familymenu.daily.payment.PlanCatalog.displayName(coverage.planCode()),
                        rs.getBoolean("is_admin"),
                        rs.getString("phone_number") != null && !rs.getString("phone_number").isBlank()
                ),
                userId
        );
    }

    private void upsertUser(String openid, String nickname, String avatarUrl) {
        jdbcTemplate.update("""
                        INSERT INTO user_account(openid, nickname, avatar_url)
                        VALUES (?, ?, ?)
                        ON DUPLICATE KEY UPDATE nickname = VALUES(nickname), avatar_url = VALUES(avatar_url)
                        """,
                openid,
                nickname,
                avatarUrl
        );
    }

    private void upsertPhoneUser(String openid, String phone, String nickname, String avatarUrl) {
        jdbcTemplate.update("""
                        INSERT INTO user_account(openid, phone_number, nickname, avatar_url)
                        VALUES (?, ?, ?, ?)
                        ON DUPLICATE KEY UPDATE phone_number = VALUES(phone_number), nickname = VALUES(nickname), avatar_url = VALUES(avatar_url)
                        """,
                openid,
                phone,
                nickname,
                avatarUrl
        );
    }

    private long findUserId(String openid) {
        Long userId = jdbcTemplate.queryForObject(
                "SELECT id FROM user_account WHERE openid = ?",
                Long.class,
                openid
        );
        if (userId == null) {
            throw new IllegalStateException("user not created");
        }
        return userId;
    }

    private long findOrCreateDefaultFamily(long userId) {
        Long currentFamilyId = jdbcTemplate.query("""
                SELECT f.id
                FROM user_account u
                JOIN family_member m ON m.family_id = u.current_family_id AND m.user_id = u.id AND m.member_status = 'ACTIVE'
                JOIN family f ON f.id = m.family_id
                WHERE u.id = ?
                LIMIT 1
                """, rs -> rs.next() ? rs.getLong("id") : null, userId);
        if (currentFamilyId != null) {
            return currentFamilyId;
        }
        Long familyId = jdbcTemplate.query("""
                SELECT f.id
                FROM family f
                JOIN family_member m ON m.family_id = f.id AND m.member_status = 'ACTIVE'
                WHERE m.user_id = ?
                ORDER BY f.id
                LIMIT 1
                """, rs -> rs.next() ? rs.getLong("id") : null, userId);
        if (familyId != null) {
            jdbcTemplate.update("UPDATE user_account SET current_family_id = ? WHERE id = ?", familyId, userId);
            ensureDemoDataForFamily(userId, familyId);
            return familyId;
        }
        try {
            jdbcTemplate.update("INSERT INTO family(name, owner_user_id) VALUES (?, ?)", "周末厨房", userId);
        } catch (DuplicateKeyException ignored) {
            // concurrent insert won the race; re-read below.
        }
        Long created = jdbcTemplate.query("""
                SELECT f.id FROM family f
                LEFT JOIN family_member m ON m.family_id = f.id AND m.user_id = ?
                WHERE f.owner_user_id = ? OR m.user_id = ?
                ORDER BY f.id
                LIMIT 1
                """, rs -> rs.next() ? rs.getLong("id") : null, userId, userId, userId);
        if (created == null) {
            throw new IllegalStateException("family create failed");
        }
        try {
            jdbcTemplate.update(
                    "INSERT INTO family_member(family_id, user_id, member_role, member_status) VALUES (?, ?, 'owner', 'ACTIVE')",
                    created,
                    userId
            );
        } catch (DuplicateKeyException ignored) {
            // membership already created concurrently.
        }
        jdbcTemplate.update("UPDATE user_account SET current_family_id = ? WHERE id = ?", created, userId);
        ensureDemoDataForFamily(userId, created);
        return created;
    }

    private void ensureDemoDataForFamily(long userId, long familyId) {
        if (familyId <= 0) {
            return;
        }
        // ponytail: 用 daily_menu 的固定 ID 做存在性检测，已播种则跳过全部 INSERT
        long base = familyId * 1000L;
        Boolean seeded = jdbcTemplate.query(
                "SELECT COUNT(1) > 0 FROM daily_menu WHERE id = ?",
                rs -> rs.next() && rs.getBoolean(1), base + 1);
        if (Boolean.TRUE.equals(seeded)) {
            return;
        }
        Long tomato = findRecipeIdByTitle("番茄炒蛋");
        Long soup = findRecipeIdByTitle("紫菜蛋花汤");
        Long beef = findRecipeIdByTitle("牛肉炒西兰花");
        Long friedRice = findRecipeIdByTitle("扬州炒饭");
        if (tomato == null || soup == null || beef == null || friedRice == null) {
            return;
        }
        jdbcTemplate.update("INSERT IGNORE INTO daily_menu(id, family_id, menu_date, status) VALUES (?, ?, CURRENT_DATE, 'READY')", base + 1, familyId);
        jdbcTemplate.update("INSERT IGNORE INTO daily_menu_item(id, daily_menu_id, recipe_id, meal_type) VALUES (?, ?, ?, 'lunch')", base + 11, base + 1, tomato);
        jdbcTemplate.update("INSERT IGNORE INTO daily_menu_item(id, daily_menu_id, recipe_id, meal_type) VALUES (?, ?, ?, 'lunch')", base + 12, base + 1, soup);
        jdbcTemplate.update("INSERT IGNORE INTO daily_menu_item(id, daily_menu_id, recipe_id, meal_type) VALUES (?, ?, ?, 'dinner')", base + 13, base + 1, beef);
        jdbcTemplate.update("INSERT IGNORE INTO daily_menu_item(id, daily_menu_id, recipe_id, meal_type) VALUES (?, ?, ?, 'dinner')", base + 14, base + 1, friedRice);
        jdbcTemplate.update("INSERT IGNORE INTO shopping_list(id, family_id, daily_menu_id, status) VALUES (?, ?, ?, 'OPEN')", base + 21, familyId, base + 1);
        jdbcTemplate.update("INSERT IGNORE INTO shopping_list_item(id, shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, ?, 0, 0)", base + 31, base + 21, "番茄", "2", "个");
        jdbcTemplate.update("INSERT IGNORE INTO shopping_list_item(id, shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, ?, 1, 0)", base + 32, base + 21, "鸡蛋", "5", "个");
        jdbcTemplate.update("INSERT IGNORE INTO shopping_list_item(id, shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, ?, 0, 0)", base + 33, base + 21, "牛肉", "250", "g");
        jdbcTemplate.update("INSERT IGNORE INTO shopping_list_item(id, shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, ?, 0, 0)", base + 34, base + 21, "西兰花", "1", "颗");
        jdbcTemplate.update("INSERT IGNORE INTO shopping_list_item(id, shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, ?, 0, 1)", base + 35, base + 21, "水果", "1", "袋");
        jdbcTemplate.update("INSERT IGNORE INTO pantry_item(id, family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?, ?)", base + 41, familyId, "鸡蛋", "8", "个", LocalDate.now().plusDays(10));
        jdbcTemplate.update("INSERT IGNORE INTO pantry_item(id, family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?, ?)", base + 42, familyId, "西兰花", "1", "颗", LocalDate.now().plusDays(2));
        jdbcTemplate.update("INSERT IGNORE INTO pantry_item(id, family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?, ?)", base + 43, familyId, "番茄", "3", "个", LocalDate.now().plusDays(3));
        jdbcTemplate.update("INSERT IGNORE INTO pantry_item(id, family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?, ?)", base + 44, familyId, "紫菜", "1", "包", LocalDate.now().plusDays(90));
        jdbcTemplate.update("INSERT IGNORE INTO pantry_item(id, family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?, ?)", base + 45, familyId, "米饭", "2", "碗", LocalDate.now().plusDays(1));
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 51, tomato, userId, familyId, LocalDateTime.now().minusDays(1), 5, "孩子拌饭吃光了");
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 52, beef, userId, familyId, LocalDateTime.now().minusDays(2), 4, "适合带饭");
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 53, soup, userId, familyId, LocalDateTime.now().minusDays(3), 5, "八分钟出汤，很稳");
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 54, friedRice, userId, familyId, LocalDateTime.now().minusDays(5), 4, "剩饭改造成功");
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 55, tomato, userId, familyId, LocalDateTime.now().minusDays(8), 5, "本周第二次点名要吃");
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 56, beef, userId, familyId, LocalDateTime.now().minusDays(13), 5, "肉菜均衡");
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 57, soup, userId, familyId, LocalDateTime.now().minusDays(21), 4, "清淡不腻");
        jdbcTemplate.update("INSERT IGNORE INTO cook_history(id, recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?, ?)", base + 58, friedRice, userId, familyId, LocalDateTime.now().minusDays(30), 4, "早餐也能吃");
        jdbcTemplate.update("INSERT IGNORE INTO notification_message(id, user_id, family_id, kind, title, body_text, action_type, unread, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)", base + 61, userId, familyId, "fam", "今晚菜单已生成", "午餐有番茄炒蛋和紫菜蛋花汤，晚餐安排牛肉炒西兰花。", "menu", LocalDateTime.now().minusMinutes(20));
        jdbcTemplate.update("INSERT IGNORE INTO notification_message(id, user_id, family_id, kind, title, body_text, action_type, unread, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?)", base + 62, userId, familyId, "sys", "买菜清单待确认", "还有 5 项食材未购买，出门前可以再核对一次。", "shopping", LocalDateTime.now().minusHours(2));
    }

    private Long findRecipeIdByTitle(String title) {
        return jdbcTemplate.query(
                "SELECT id FROM recipe WHERE title = ? AND status = 'ACTIVE' ORDER BY id LIMIT 1",
                rs -> rs.next() ? rs.getLong("id") : null,
                title
        );
    }

    private String resolveWechatOpenid(String code) {
        if (!wechatConfigured) {
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE,
                    "WeChat login disabled: app-id/app-secret not configured. Use /api/auth/guest for local development.");
        }
        try {
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.get()
                    .uri(uriBuilder -> uriBuilder
                            .scheme("https")
                            .host("api.weixin.qq.com")
                            .path("/sns/jscode2session")
                            .queryParam("appid", appId)
                            .queryParam("secret", appSecret)
                            .queryParam("js_code", code)
                            .queryParam("grant_type", "authorization_code")
                            .build())
                    .retrieve()
                    .body(Map.class);
            if (response == null) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "wechat: empty response");
            }
            Object errcode = response.get("errcode");
            if (errcode != null && !"0".equals(errcode.toString()) && !Integer.valueOf(0).equals(errcode)) {
                log.warn("wechat jscode2session failed: {} {}", errcode, response.get("errmsg"));
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "wechat: " + response.get("errmsg"));
            }
            Object openid = response.get("openid");
            if (openid == null || openid.toString().isBlank()) {
                throw new ResponseStatusException(HttpStatus.UNAUTHORIZED, "wechat: missing openid");
            }
            Object sessionKey = response.get("session_key");
            Object unionid = response.get("unionid");
            persistWechatProfile(
                    openid.toString(),
                    sessionKey == null ? null : sessionKey.toString(),
                    unionid == null ? null : unionid.toString()
            );
            return openid.toString();
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (RuntimeException ex) {
            log.warn("wechat jscode2session error", ex);
            throw new ResponseStatusException(HttpStatus.BAD_GATEWAY, "wechat upstream error");
        }
    }

    private void persistWechatProfile(String openid, String sessionKey, String unionid) {
        // 安全修复：session_key 不落盘（微信官方禁止持久化），仅保存 unionid
        if (unionid == null) {
            return;
        }
        jdbcTemplate.update(
                "UPDATE user_account SET unionid = COALESCE(?, unionid) WHERE openid = ?",
                unionid,
                openid
        );
    }

    private String sha256Hex(String input) {
        try {
            MessageDigest md = MessageDigest.getInstance("SHA-256");
            return HexFormat.of().formatHex(md.digest(input.getBytes(java.nio.charset.StandardCharsets.UTF_8)));
        } catch (NoSuchAlgorithmException ex) {
            throw new IllegalStateException("sha-256 not available", ex);
        }
    }

    private String buildOtpHash(String phone, String code) {
        return sha256Hex("otp|" + phone + "|" + code);
    }

    private String normalizePhone(String phone) {
        if (phone == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "phone required");
        }
        String normalized = phone.replaceAll("\\D", "");
        if (!normalized.matches("1\\d{10}")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid phone");
        }
        return normalized;
    }

    private boolean isBlank(String value) {
        return value == null || value.trim().isEmpty();
    }
}
