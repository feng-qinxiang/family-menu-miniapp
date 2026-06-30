package com.familymenu.daily.service;

import com.familymenu.daily.dto.ApiModels.AddFamilyMemberRequest;
import com.familymenu.daily.dto.ApiModels.CreateFamilyRequest;
import com.familymenu.daily.dto.ApiModels.FamilyJoinPreview;
import com.familymenu.daily.dto.ApiModels.FamilyMemberItem;
import com.familymenu.daily.dto.ApiModels.FamilyProfile;
import com.familymenu.daily.dto.ApiModels.JoinFamilyRequest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.http.HttpStatus;

import java.util.List;
import java.util.UUID;

@Service
public class FamilyService {

    private final JdbcTemplate jdbcTemplate;

    public FamilyService(JdbcTemplate jdbcTemplate) {
        this.jdbcTemplate = jdbcTemplate;
    }

    public FamilyProfile getProfile(long familyId) {
        List<FamilyProfile> profiles = jdbcTemplate.query("""
                        SELECT id, name, owner_user_id
                        FROM family
                        WHERE id = ?
                        """,
                (rs, rowNum) -> new FamilyProfile(
                        rs.getLong("id"),
                        rs.getString("name"),
                        rs.getLong("owner_user_id"),
                        loadMembers(rs.getLong("id"))
                ),
                familyId
        );
        if (!profiles.isEmpty()) {
            return profiles.get(0);
        }
        return new FamilyProfile(familyId, "周末厨房", 0L, loadMembers(familyId));
    }

    @Transactional
    public FamilyProfile createFamily(long userId, long currentFamilyId, CreateFamilyRequest request) {
        String name = request == null || request.name() == null || request.name().isBlank()
                ? "我的家庭厨房"
                : request.name().trim();
        boolean ownsCurrent = currentFamilyId > 0 && Boolean.TRUE.equals(jdbcTemplate.query("""
                SELECT COUNT(1) > 0
                FROM family
                WHERE id = ? AND owner_user_id = ?
                """, rs -> rs.next() && rs.getBoolean(1), currentFamilyId, userId));
        long familyId;
        if (ownsCurrent) {
            jdbcTemplate.update("UPDATE family SET name = ? WHERE id = ?", name, currentFamilyId);
            familyId = currentFamilyId;
        } else {
            jdbcTemplate.update("INSERT INTO family(name, owner_user_id) VALUES (?, ?)", name, userId);
            Long created = jdbcTemplate.query("""
                    SELECT id FROM family
                    WHERE owner_user_id = ?
                    ORDER BY id DESC
                    LIMIT 1
                    """, rs -> rs.next() ? rs.getLong("id") : null, userId);
            if (created == null) {
                throw new IllegalStateException("family create failed");
            }
            familyId = created;
            jdbcTemplate.update("""
                    INSERT INTO family_member(family_id, user_id, member_role, member_status)
                    VALUES (?, ?, 'owner', 'ACTIVE')
                    ON DUPLICATE KEY UPDATE member_role = 'owner', member_status = 'ACTIVE'
                    """, familyId, userId);
        }
        jdbcTemplate.update("UPDATE user_account SET current_family_id = ? WHERE id = ?", familyId, userId);
        return getProfile(familyId);
    }

    public FamilyJoinPreview previewJoin(String inviteCode) {
        long familyId = parseInviteCode(inviteCode);
        FamilyProfile profile = getExistingProfile(familyId);
        return new FamilyJoinPreview(toInviteCode(profile.familyId()), profile.familyName(), profile.members().size());
    }

    @Transactional
    public FamilyProfile joinFamily(long userId, JoinFamilyRequest request) {
        long familyId = parseInviteCode(request == null ? null : request.inviteCode());
        getExistingProfile(familyId);
        jdbcTemplate.update("""
                INSERT INTO family_member(family_id, user_id, member_role, member_status)
                VALUES (?, ?, 'member', 'ACTIVE')
                ON DUPLICATE KEY UPDATE member_status = 'ACTIVE'
                """, familyId, userId);
        jdbcTemplate.update("UPDATE user_account SET current_family_id = ? WHERE id = ?", familyId, userId);
        return getProfile(familyId);
    }

    @Transactional
    public FamilyMemberItem addMember(long familyId, long requesterUserId, AddFamilyMemberRequest request) {
        requireFamilyOwner(familyId, requesterUserId);
        String nickname = request == null || request.nickname() == null || request.nickname().isBlank() ? "新成员" : request.nickname().trim();
        String avatarUrl = request == null || request.avatarUrl() == null ? "" : request.avatarUrl().trim();
        String role = normalizeMemberRole(request == null ? null : request.role());
        String openid = "invite-" + UUID.randomUUID().toString().replace("-", "").substring(0, 24);
        jdbcTemplate.update(
                "INSERT INTO user_account(openid, nickname, avatar_url) VALUES (?, ?, ?)",
                openid,
                nickname,
                avatarUrl
        );
        Long userId = jdbcTemplate.queryForObject("SELECT id FROM user_account WHERE openid = ?", Long.class, openid);
        if (userId == null) {
            throw new IllegalStateException("member user create failed");
        }
        jdbcTemplate.update(
                """
                INSERT INTO family_member(family_id, user_id, member_role, member_status)
                VALUES (?, ?, ?, 'ACTIVE')
                ON DUPLICATE KEY UPDATE member_role = VALUES(member_role), member_status = 'ACTIVE'
                """,
                familyId,
                userId,
                role
        );
        return new FamilyMemberItem(userId, nickname, avatarUrl, role, "ACTIVE");
    }

    /**
     * 仅允许 'member' 与 'admin' 两种可被赋予的角色；'owner' 不可通过加成员/改角色写入，
     * 防止普通成员借自定义 role 字段提权。
     */
    private String normalizeMemberRole(String requested) {
        if (requested == null || requested.isBlank()) {
            return "member";
        }
        String role = requested.trim().toLowerCase();
        return "admin".equals(role) ? "admin" : "member";
    }

    /** 校验 requesterUserId 是该家庭的 owner，否则 403。供加成员、移除成员等管理操作复用。 */
    private void requireFamilyOwner(long familyId, long requesterUserId) {
        Boolean owner = jdbcTemplate.query("""
                SELECT COUNT(1) > 0
                FROM family
                WHERE id = ? AND owner_user_id = ?
                """, rs -> rs.next() && rs.getBoolean(1), familyId, requesterUserId);
        if (!Boolean.TRUE.equals(owner)) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "owner role required");
        }
    }

    @Transactional
    public void removeMember(long familyId, long requesterUserId, long targetUserId) {
        if (requesterUserId == targetUserId) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cannot remove yourself");
        }
        requireFamilyOwner(familyId, requesterUserId);
        jdbcTemplate.update("""
                UPDATE family_member
                SET member_status = 'REMOVED'
                WHERE family_id = ? AND user_id = ? AND member_role <> 'owner'
                """, familyId, targetUserId);
    }

    public String inviteCode(long familyId) {
        return toInviteCode(familyId);
    }

    @Transactional
    public FamilyProfile removeMember(long familyId, long targetUserId) {
        Long ownerId = jdbcTemplate.query(
                "SELECT owner_user_id FROM family WHERE id = ?",
                rs -> rs.next() ? rs.getLong("owner_user_id") : null,
                familyId
        );
        if (ownerId == null) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "family not found");
        }
        if (ownerId == targetUserId) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "cannot remove family owner");
        }
        int affected = jdbcTemplate.update("""
                UPDATE family_member
                SET member_status = 'REMOVED'
                WHERE family_id = ? AND user_id = ? AND member_status = 'ACTIVE'
                """, familyId, targetUserId);
        if (affected == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "member not found");
        }
        jdbcTemplate.update("""
                UPDATE user_account
                SET current_family_id = NULL
                WHERE id = ? AND current_family_id = ?
                """, targetUserId, familyId);
        return getProfile(familyId);
    }

    private FamilyProfile getExistingProfile(long familyId) {
        FamilyProfile profile = getProfile(familyId);
        if (profile.ownerUserId() == 0L) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "family not found");
        }
        return profile;
    }

    private long parseInviteCode(String inviteCode) {
        if (inviteCode == null || inviteCode.isBlank()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invite code required");
        }
        try {
            return Long.parseLong(inviteCode.trim().toUpperCase(), 36);
        } catch (NumberFormatException ex) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid invite code");
        }
    }

    private String toInviteCode(long familyId) {
        return Long.toString(familyId, 36).toUpperCase();
    }

    private List<FamilyMemberItem> loadMembers(long familyId) {
        return jdbcTemplate.query("""
                        SELECT u.id, u.nickname, u.avatar_url, m.member_role, m.member_status
                        FROM family_member m
                        JOIN user_account u ON u.id = m.user_id
                        WHERE m.family_id = ? AND m.member_status = 'ACTIVE'
                        ORDER BY CASE WHEN m.member_role = 'owner' THEN 0 ELSE 1 END, u.id
                        """,
                (rs, rowNum) -> new FamilyMemberItem(
                        rs.getLong("id"),
                        rs.getString("nickname"),
                        rs.getString("avatar_url"),
                        rs.getString("member_role"),
                        rs.getString("member_status")
                ),
                familyId
        );
    }
}
