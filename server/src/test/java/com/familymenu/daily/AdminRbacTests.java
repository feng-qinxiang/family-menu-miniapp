package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.service.AdminService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.server.ResponseStatusException;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 管理端权限分级（RBAC）与 xlsx 导出。
 *
 * 权限矩阵见 {@link com.familymenu.daily.auth.AdminRole}；
 * 这里验证的是"后端真的拦得住"，而不是前端藏没藏按钮。
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminRbacTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    @Autowired
    private AdminService adminService;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "rbac-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private long userIdOf(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token)).andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("userId").asLong();
    }

    /** 造一个指定角色的临时管理员；调用方负责在 finally 里恢复。 */
    private String adminWithRole(String role, long[] outUserId) throws Exception {
        String token = guestLogin();
        long id = userIdOf(token);
        jdbcTemplate.update("UPDATE user_account SET is_admin = 1, admin_role = ? WHERE id = ?", role, id);
        if (outUserId != null && outUserId.length > 0) {
            outUserId[0] = id;
        }
        return token;
    }

    private void cleanup(long userId) {
        jdbcTemplate.update("UPDATE user_account SET is_admin = 0, admin_role = NULL WHERE id = ?", userId);
        jdbcTemplate.update("DELETE FROM user_session WHERE user_id = ?", userId);
    }

    // ---------- 内容审核员 ----------

    @Test
    void moderatorCanModerateContentButNotTouchUsersMoneyOrAudit() throws Exception {
        long[] id = new long[1];
        String moderator = adminWithRole("MODERATOR", id);
        Long commentId = jdbcTemplate.queryForObject(
                "SELECT id FROM community_post_comment ORDER BY id LIMIT 1", Long.class);
        try {
            // 能看能改内容
            mockMvc.perform(get("/api/admin/comments").header("X-Auth-Token", moderator))
                    .andExpect(status().isOk());
            mockMvc.perform(get("/api/admin/posts").header("X-Auth-Token", moderator))
                    .andExpect(status().isOk());
            mockMvc.perform(get("/api/admin/dashboard").header("X-Auth-Token", moderator))
                    .andExpect(status().isOk());
            mockMvc.perform(post("/api/admin/comments/" + commentId + "/status")
                            .header("X-Auth-Token", moderator)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"APPROVED\"}"))
                    .andExpect(status().isOk());

            // 碰不到用户、订单、审计
            mockMvc.perform(get("/api/admin/users").header("X-Auth-Token", moderator))
                    .andExpect(status().isForbidden());
            mockMvc.perform(get("/api/admin/orders").header("X-Auth-Token", moderator))
                    .andExpect(status().isForbidden());
            mockMvc.perform(get("/api/admin/audit").header("X-Auth-Token", moderator))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post("/api/admin/users/1/status")
                            .header("X-Auth-Token", moderator)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"status\":\"BANNED\"}"))
                    .andExpect(status().isForbidden());
        } finally {
            cleanup(id[0]);
        }
    }

    // ---------- 客服 ----------

    @Test
    void supportCanReadUsersAndOrdersButCannotManageThem() throws Exception {
        long[] id = new long[1];
        String support = adminWithRole("SUPPORT", id);
        try {
            mockMvc.perform(get("/api/admin/users").header("X-Auth-Token", support))
                    .andExpect(status().isOk());
            mockMvc.perform(get("/api/admin/orders").header("X-Auth-Token", support))
                    .andExpect(status().isOk());
            mockMvc.perform(get("/api/admin/feedback").header("X-Auth-Token", support))
                    .andExpect(status().isOk());

            mockMvc.perform(get("/api/admin/comments").header("X-Auth-Token", support))
                    .andExpect(status().isForbidden());
            mockMvc.perform(get("/api/admin/audit").header("X-Auth-Token", support))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post("/api/admin/users/1/vip")
                            .header("X-Auth-Token", support)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"planCode\":\"annual\"}"))
                    .andExpect(status().isForbidden());
            mockMvc.perform(post("/api/admin/users/1/role")
                            .header("X-Auth-Token", support)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"SUPER\"}"))
                    .andExpect(status().isForbidden());
        } finally {
            cleanup(id[0]);
        }
    }

    // ---------- 角色分配 ----------

    @Test
    void superAdminCanAssignRolesAndProfileReflectsPermissions() throws Exception {
        long[] actor = new long[1];
        String superAdmin = adminWithRole("SUPER", actor);
        long[] target = new long[1];
        guestLogin();
        String targetToken = guestLogin();
        target[0] = userIdOf(targetToken);
        try {
            mockMvc.perform(post("/api/admin/users/" + target[0] + "/role")
                            .header("X-Auth-Token", superAdmin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"MODERATOR\"}"))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.adminRole").value("MODERATOR"));
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT admin_role FROM user_account WHERE id = ?", String.class, target[0]))
                    .isEqualTo("MODERATOR");

            // 该账号自己的 /me 应反映角色与权限点
            MvcResult me = mockMvc.perform(get("/api/admin/me").header("X-Auth-Token", targetToken))
                    .andExpect(status().isOk())
                    .andExpect(jsonPath("$.role").value("MODERATOR"))
                    .andExpect(jsonPath("$.roleName").value("内容审核员"))
                    .andReturn();
            JsonNode perms = objectMapper.readTree(me.getResponse().getContentAsString()).get("permissions");
            List<String> list = new ArrayList<>();
            perms.forEach(p -> list.add(p.asText()));
            assertThat(list).contains("COMMENT_MODERATE", "EXPORT").doesNotContain("USER_MANAGE", "ORDER_MANAGE");

            // 不能改自己的角色
            mockMvc.perform(post("/api/admin/users/" + actor[0] + "/role")
                            .header("X-Auth-Token", superAdmin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"MODERATOR\"}"))
                    .andExpect(status().isForbidden());

            // 非法角色名 400
            mockMvc.perform(post("/api/admin/users/" + target[0] + "/role")
                            .header("X-Auth-Token", superAdmin)
                            .contentType(MediaType.APPLICATION_JSON).content("{\"role\":\"ROOT\"}"))
                    .andExpect(status().isBadRequest());
        } finally {
            cleanup(target[0]);
            cleanup(actor[0]);
        }
    }

    /** 最后一个超管不能被降级：直接打 service（API 层因为有"不能改自己"的守卫碰不到这个分支）。 */
    @Test
    void lastSuperAdminCannotBeDemoted() {
        List<Map<String, Object>> snapshot = jdbcTemplate.queryForList(
                "SELECT id, is_admin, admin_role FROM user_account WHERE is_admin = 1");
        long[] actor = new long[1];
        String token;
        try {
            token = guestLogin();
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
        actor[0] = userIdOfUnchecked(token);
        try {
            // 制造"只剩一个超管"的局面：其他管理员全部降为审核员
            jdbcTemplate.update(
                    "UPDATE user_account SET admin_role = 'MODERATOR' WHERE is_admin = 1 AND id <> ?", actor[0]);
            jdbcTemplate.update("UPDATE user_account SET is_admin = 1, admin_role = 'SUPER' WHERE id = ?", actor[0]);

            assertThatThrownBy(() -> adminService.setAdminRole(999999L, actor[0], "MODERATOR"))
                    .isInstanceOf(ResponseStatusException.class)
                    .hasMessageContaining("至少");
        } finally {
            // 精确还原快照
            for (Map<String, Object> row : snapshot) {
                long id = ((Number) row.get("id")).longValue();
                Object isAdmin = row.get("is_admin");
                Object role = row.get("admin_role");
                jdbcTemplate.update("UPDATE user_account SET is_admin = ?, admin_role = ? WHERE id = ?",
                        isAdmin, role, id);
            }
            cleanup(actor[0]);
        }
    }

    private long userIdOfUnchecked(String token) {
        try {
            return userIdOf(token);
        } catch (Exception ex) {
            throw new IllegalStateException(ex);
        }
    }

    // ---------- xlsx 导出 ----------

    @Test
    void exportProducesRealXlsxWorkbook() throws Exception {
        long[] id = new long[1];
        String admin = adminWithRole("SUPER", id);
        try {
            MvcResult result = mockMvc.perform(get("/api/admin/export/orders").header("X-Auth-Token", admin))
                    .andExpect(status().isOk())
                    .andReturn();
            byte[] body = result.getResponse().getContentAsByteArray();
            assertThat(body.length).as("xlsx 不能是空文件").isGreaterThan(1000);
            assertThat(result.getResponse().getContentType())
                    .contains("spreadsheetml.sheet");

            // 必须是一个能被解压的 zip，且包含 Excel 必需部件
            List<String> entries = new ArrayList<>();
            try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(body))) {
                ZipEntry entry;
                while ((entry = zip.getNextEntry()) != null) {
                    entries.add(entry.getName());
                }
            }
            assertThat(entries).contains(
                    "[Content_Types].xml", "xl/workbook.xml", "xl/styles.xml", "xl/worksheets/sheet1.xml");

            // 审计日志要留下导出记录
            Integer audited = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM admin_audit_log WHERE action = 'EXPORT_XLSX' AND actor_user_id = ?",
                    Integer.class, id[0]);
            assertThat(audited).isGreaterThan(0);

            // 不支持的导出类型要 400
            mockMvc.perform(get("/api/admin/export/secret").header("X-Auth-Token", admin))
                    .andExpect(status().isBadRequest());
        } finally {
            cleanup(id[0]);
        }
    }
}
