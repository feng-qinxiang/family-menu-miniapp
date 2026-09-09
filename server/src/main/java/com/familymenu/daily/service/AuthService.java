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

    /** 游客缓存上限（超过则整体清空，只是多查一次库） */
    private static final int GUEST_CACHE_MAX = 10_000;
    // ponytail: 内存态验证码试错限流（failCount, lockUntilEpochMillis）；重启清零可接受，升级路径为落库
    private final ConcurrentHashMap<String, long[]> phoneOtpAttempts = new ConcurrentHashMap<>();
    private static final int OTP_MAX_FAILURES = 5;
    private static final long OTP_LOCK_MILLIS = 15 * 60 * 1000L;

    public AuthService(JdbcTemplate jdbcTemplate,
                       com.familymenu.daily.payment.MembershipService membershipService,
                       SmsGateway smsGateway,
                       @Value("${wechat.app-id:}") String appId,
                       @Value("${wechat.app-secret:}") String appSecret,
                       // 默认 false：只有显式配置才开启固定验证码，避免任何配置缺失导致 246810 生效
                       @Value("${auth.dev-otp-enabled:false}") boolean devOtpEnabled) {
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
        consumePhoneOtp(phone, code);
        String nickname = isBlank(request.nickname()) ? "手机用户" + phone.substring(phone.length() - 4) : request.nickname().trim();
        String avatarUrl = request.avatarUrl() == null ? "" : request.avatarUrl().trim();
        return loginByPhone(phone, nickname, avatarUrl);
    }

    /**
     * 校验并消费验证码。失败抛 401/429，成功后该码不可复用。
     * 抽出来供普通登录与管理员后台登录共用，避免两套校验逻辑漂移。
     */
    @Transactional
    public void consumePhoneOtp(String rawPhone, String rawCode) {
        String phone = normalizePhone(rawPhone);
        String code = rawCode == null ? "" : rawCode;
        if (!code.matches("\\d{6}")) {
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
    }

    public Optional<AuthUser> resolveToken(String token) {
        if (isBlank(token)) {
            return Optional.empty();
        }
        // 库里存的是 token 的 SHA-256 摘要，不存明文；
        // 封禁（status=BANNED）账号的会话即时失效
        String tokenHash = sha256Hex(token.trim());
        String sql = """
                SELECT u.id, u.nickname, u.avatar_url, u.is_admin, u.admin_role, u.phone_number, s.expires_at
                FROM user_session s
                JOIN user_account u ON u.id = s.user_id
                WHERE s.token = ? AND s.expires_at > NOW() AND u.status = 'ACTIVE'
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
                        LocalDateTime.now().plusDays(30), tokenHash);
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
                    roleName(rs.getBoolean("is_admin"), rs.getString("admin_role")),
                    rs.getString("phone_number") != null && !rs.getString("phone_number").isBlank()
            ));
        }, tokenHash);
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

    /**
     * 要求管理员且角色包含指定权限。
     * 权限矩阵见 {@link com.familymenu.daily.auth.AdminRole}；越权返回 403 并写审计。
     */
    public AuthUser requirePermission(String token, com.familymenu.daily.auth.AdminPermission permission) {
        AuthUser user = requireAdminUser(token);
        com.familymenu.daily.auth.AdminRole role = com.familymenu.daily.auth.AdminRole.of(true, user.adminRole());
        if (role == null || !role.allows(permission)) {
            log.warn("admin permission denied: userId={} role={} need={}", user.userId(), user.adminRole(), permission);
            throw new ResponseStatusException(HttpStatus.FORBIDDEN,
                    "当前角色（" + (role == null ? "无" : role.displayName()) + "）没有此操作权限");
        }
        return user;
    }

    @Transactional
    public AuthUser updateProfile(AuthUser current, String nickname, String avatarUrl, String phone, String phoneCode) {
        long userId = current.userId();
        if (nickname != null && !nickname.isBlank()) {
            jdbcTemplate.update("UPDATE user_account SET nickname = ? WHERE id = ?", nickname.trim(), userId);
        }
        if (avatarUrl != null) {
            jdbcTemplate.update("UPDATE user_account SET avatar_url = ? WHERE id = ?", avatarUrl.trim(), userId);
        }
        if (phone != null && !phone.isBlank()) {
            String normalized = normalizePhone(phone);
            // 与原值相同则视为回传，不做变更（前端保存资料时会原样带回已有手机号）
            String currentPhone = jdbcTemplate.query(
                    "SELECT phone_number FROM user_account WHERE id = ?",
                    rs -> rs.next() ? rs.getString("phone_number") : null, userId);
            boolean unchanged = normalized.equals(currentPhone);
            if (!unchanged) {
                // 换绑手机号必须先验证该手机号的验证码，否则可把他人手机号绑到自己账号 → 账号接管
                if (phoneCode == null || phoneCode.isBlank()) {
                    throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "绑定手机号需要验证码");
                }
                consumePhoneOtp(normalized, phoneCode);
                // 该手机号已被其他账号占用时拒绝，避免一号多号（登录按最小 id 认领会串号）
                Long occupied = jdbcTemplate.query(
                        "SELECT id FROM user_account WHERE phone_number = ? AND id <> ? LIMIT 1",
                        rs -> rs.next() ? rs.getLong("id") : null, normalized, userId);
                if (occupied != null) {
                    throw new ResponseStatusException(HttpStatus.CONFLICT, "该手机号已绑定其他账号");
                }
                jdbcTemplate.update("UPDATE user_account SET phone_number = ? WHERE id = ?", normalized, userId);
            }
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
            // 封禁账号拒绝登录
            String status = jdbcTemplate.query(
                    "SELECT status FROM user_account WHERE id = ?",
                    rs -> rs.next() ? rs.getString("status") : null, userId);
            if ("BANNED".equals(status)) {
                throw new ResponseStatusException(HttpStatus.FORBIDDEN, "该账号已被停用，如有疑问请联系客服");
            }
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
        // 只落库哈希；明文 token 仅在本次响应里返回给客户端
        jdbcTemplate.update(
                "INSERT INTO user_session(token, user_id, login_type, expires_at) VALUES (?, ?, ?, ?)",
                sha256Hex(token),
                userId,
                loginType,
                LocalDateTime.now().plusDays(30)
        );
        return token;
    }

    /** 登出：删除该 token 对应的会话行。不存在也视为成功（幂等）。 */
    @Transactional
    public void logout(String token) {
        if (isBlank(token)) {
            return;
        }
        int removed = jdbcTemplate.update("DELETE FROM user_session WHERE token = ?", sha256Hex(token.trim()));
        if (removed > 0) {
            guestCache.clear();
        }
    }

    /**
     * 管理后台登录：手机号 + 验证码，但只放行 is_admin=1 的账号。
     * 非管理员即使验证码正确也拒绝，避免普通用户拿到后台 token。
     */
    @Transactional
    public LoginResponse adminLoginByPhoneOtp(String rawPhone, String rawCode) {
        String phone = normalizePhone(rawPhone);
        // 先确认该手机号属于管理员，再校验验证码：避免对非管理员账号做无意义的验证码消耗
        Long adminUserId = jdbcTemplate.query(
                "SELECT id FROM user_account WHERE phone_number = ? AND is_admin = 1 AND status = 'ACTIVE' ORDER BY id LIMIT 1",
                rs -> rs.next() ? rs.getLong("id") : null, phone);
        if (adminUserId == null) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "该账号不是管理员");
        }
        consumePhoneOtp(phone, rawCode);
        long familyId = findOrCreateDefaultFamily(adminUserId);
        String token = createSession(adminUserId, "admin");
        log.info("admin login: userId={}", adminUserId);
        return new LoginResponse(token, loadUser(adminUserId, familyId));
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
        putGuestCache(openid, user);
        return user;
    }

    /** 游客会话缓存：加个上限，防止被大量伪造设备指纹撑爆内存（缓存只影响性能，清空无副作用）。 */
    private void putGuestCache(String openid, AuthUser user) {
        if (guestCache.size() >= GUEST_CACHE_MAX) {
            guestCache.clear();
        }
        guestCache.put(openid, user);
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
        putGuestCache(SEED_GUEST_OPENID, user);
        return user;
    }

    private AuthUser loadUser(long userId, long familyId) {
        com.familymenu.daily.payment.MembershipService.Coverage coverage =
                membershipService.resolveCoverage(userId);
        return jdbcTemplate.queryForObject("""
                        SELECT id, nickname, avatar_url, is_admin, admin_role, phone_number
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
                        roleName(rs.getBoolean("is_admin"), rs.getString("admin_role")),
                        rs.getString("phone_number") != null && !rs.getString("phone_number").isBlank()
                ),
                userId
        );
    }

    /** 有效角色名；非管理员返回 null（AdminRole.of 对历史 is_admin=1 的账号回退为 SUPER）。 */
    private static String roleName(boolean isAdmin, String rawRole) {
        com.familymenu.daily.auth.AdminRole role = com.familymenu.daily.auth.AdminRole.of(isAdmin, rawRole);
        return role == null ? null : role.name();
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
        // 已播种则跳过：按"本家庭今天是否已有菜单"判断，而不是按固定主键 id。
        // 历史写法用 familyId*1000+n 当主键，会和真实自增 id 撞车（把种子菜单项挂到别人家的菜单上）。
        Boolean seeded = jdbcTemplate.query(
                "SELECT COUNT(1) > 0 FROM daily_menu WHERE family_id = ? AND menu_date = CURRENT_DATE",
                rs -> rs.next() && rs.getBoolean(1), familyId);
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
        long menuId = insertAndReturnId(
                "INSERT INTO daily_menu(family_id, menu_date, status) VALUES (?, CURRENT_DATE, 'READY')", familyId);
        for (Object[] item : new Object[][]{
                {tomato, "lunch"}, {soup, "lunch"}, {beef, "dinner"}, {friedRice, "dinner"}}) {
            jdbcTemplate.update(
                    "INSERT INTO daily_menu_item(daily_menu_id, recipe_id, meal_type) VALUES (?, ?, ?)",
                    menuId, item[0], item[1]);
        }
        long shoppingListId = insertAndReturnId(
                "INSERT INTO shopping_list(family_id, daily_menu_id, status) VALUES (?, ?, 'OPEN')",
                familyId, menuId);
        jdbcTemplate.update("INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, 0, 0)", shoppingListId, "番茄", "2", "个");
        jdbcTemplate.update("INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, 1, 0)", shoppingListId, "鸡蛋", "5", "个");
        jdbcTemplate.update("INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, 0, 0)", shoppingListId, "牛肉", "250", "g");
        jdbcTemplate.update("INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, 0, 0)", shoppingListId, "西兰花", "1", "颗");
        jdbcTemplate.update("INSERT INTO shopping_list_item(shopping_list_id, ingredient_name, amount, unit, purchased, is_manual) VALUES (?, ?, ?, ?, 0, 1)", shoppingListId, "水果", "1", "袋");
        jdbcTemplate.update("INSERT INTO pantry_item(family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?)", familyId, "鸡蛋", "8", "个", LocalDate.now().plusDays(10));
        jdbcTemplate.update("INSERT INTO pantry_item(family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?)", familyId, "西兰花", "1", "颗", LocalDate.now().plusDays(2));
        jdbcTemplate.update("INSERT INTO pantry_item(family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?)", familyId, "番茄", "3", "个", LocalDate.now().plusDays(3));
        jdbcTemplate.update("INSERT INTO pantry_item(family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?)", familyId, "紫菜", "1", "包", LocalDate.now().plusDays(90));
        jdbcTemplate.update("INSERT INTO pantry_item(family_id, ingredient_name, amount, unit, expires_at) VALUES (?, ?, ?, ?, ?)", familyId, "米饭", "2", "碗", LocalDate.now().plusDays(1));
        Object[][] history = new Object[][]{
                {tomato, 1, 5, "孩子拌饭吃光了"},
                {beef, 2, 4, "适合带饭"},
                {soup, 3, 5, "八分钟出汤，很稳"},
                {friedRice, 5, 4, "剩饭改造成功"},
                {tomato, 8, 5, "本周第二次点名要吃"},
                {beef, 13, 5, "肉菜均衡"},
                {soup, 21, 4, "清淡不腻"},
                {friedRice, 30, 4, "早餐也能吃"}};
        for (Object[] row : history) {
            jdbcTemplate.update(
                    "INSERT INTO cook_history(recipe_id, user_id, family_id, cooked_at, score, remark) VALUES (?, ?, ?, ?, ?, ?)",
                    row[0], userId, familyId, LocalDateTime.now().minusDays((Integer) row[1]), row[2], row[3]);
        }
        jdbcTemplate.update("INSERT INTO notification_message(user_id, family_id, kind, title, body_text, action_type, unread, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", userId, familyId, "fam", "今晚菜单已生成", "午餐有番茄炒蛋和紫菜蛋花汤，晚餐安排牛肉炒西兰花。", "menu", LocalDateTime.now().minusMinutes(20));
        jdbcTemplate.update("INSERT INTO notification_message(user_id, family_id, kind, title, body_text, action_type, unread, created_at) VALUES (?, ?, ?, ?, ?, ?, 1, ?)", userId, familyId, "sys", "买菜清单待确认", "还有 5 项食材未购买，出门前可以再核对一次。", "shopping", LocalDateTime.now().minusHours(2));
    }

    /** 插入并返回自增主键（避免为种子数据硬编码主键）。 */
    private long insertAndReturnId(String sql, Object... args) {
        org.springframework.jdbc.support.GeneratedKeyHolder keyHolder =
                new org.springframework.jdbc.support.GeneratedKeyHolder();
        jdbcTemplate.update(connection -> {
            java.sql.PreparedStatement ps =
                    connection.prepareStatement(sql, java.sql.Statement.RETURN_GENERATED_KEYS);
            for (int i = 0; i < args.length; i++) {
                ps.setObject(i + 1, args[i]);
            }
            return ps;
        }, keyHolder);
        Number key = keyHolder.getKey();
        if (key == null) {
            throw new IllegalStateException("insert failed, no generated key: " + sql);
        }
        return key.longValue();
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
