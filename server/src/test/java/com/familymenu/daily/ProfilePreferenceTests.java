package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 个人资料（口味画像）的读写与校验。
 *
 * 覆盖范围：
 *  - 性别 / 生日 / 口味偏好：写入后能被 /api/auth/me 读回
 *  - 校验：非法性别、非法日期、未来日期、超量标签、超长标签一律 400
 *  - 清洗：标签去空白、去重、丢空串
 *  - 清空语义：空串 / 空数组 = 清空（区别于 null = 不改动）
 *  - 忌口：走家庭成员接口，与「家庭 → 成员」页是同一份数据
 *
 * 这些字段以前只存在手机本地（storage），换手机就丢、家人也看不到，所以补了落库与校验。
 * 依赖本地 MySQL（与既有测试一致）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class ProfilePreferenceTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    /** 每个用例用独立设备指纹，拿到互不干扰的账号。 */
    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "profile-test-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    private JsonNode patchProfile(String token, Map<String, Object> payload) throws Exception {
        MvcResult result = mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(payload)))
                .andReturn();
        return objectMapper.readTree(
                result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    private JsonNode me(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(
                result.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
    }

    /** 取文本字段：字段缺失或为 null 都返回 null，避免 NPE。 */
    private static String text(JsonNode node, String field) {
        JsonNode value = node.get(field);
        return value == null || value.isNull() ? null : value.asText();
    }

    private static List<String> texts(JsonNode node, String field) {
        JsonNode value = node.get(field);
        if (value == null || !value.isArray()) {
            return List.of();
        }
        List<String> out = new ArrayList<>();
        value.forEach((item) -> out.add(item.asText()));
        return out;
    }

    @Test
    void preferenceRoundTripPersists() throws Exception {
        String token = guestLogin();
        patchProfile(token, Map.of(
                "gender", "female",
                "birthday", "1998-03-15",
                "tasteTags", List.of("微辣", "少油")
        ));

        JsonNode me = me(token);
        assertThat(text(me, "gender")).isEqualTo("female");
        assertThat(text(me, "birthday")).isEqualTo("1998-03-15");
        assertThat(texts(me, "tasteTags")).containsExactlyInAnyOrder("微辣", "少油");
    }

    @Test
    void invalidGenderIsRejected() throws Exception {
        String token = guestLogin();
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("gender", "别的东西"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void malformedBirthdayIsRejected() throws Exception {
        String token = guestLogin();
        for (String bad : List.of("1998/03/15", "1998-13-01", "昨天")) {
            mockMvc.perform(patch("/api/auth/me")
                            .header("X-Auth-Token", token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content(objectMapper.writeValueAsString(Map.of("birthday", bad))))
                    .andExpect(status().isBadRequest());
        }
    }

    @Test
    void futureBirthdayIsRejected() throws Exception {
        String token = guestLogin();
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("birthday", "2099-01-01"))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void tooManyTasteTagsIsRejected() throws Exception {
        String token = guestLogin();
        List<String> tags = new ArrayList<>();
        for (int i = 0; i < 21; i++) {
            tags.add("标签" + i);
        }
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("tasteTags", tags))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void tooLongTasteTagIsRejected() throws Exception {
        String token = guestLogin();
        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("tasteTags", List.of("这是一个超过十六个字的超长口味标签内容")))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void tasteTagsAreTrimmedDeduplicatedAndBlanksDropped() throws Exception {
        String token = guestLogin();
        patchProfile(token, Map.of("tasteTags", List.of(" 微辣 ", "微辣", "", "   ", "少盐")));
        assertThat(texts(me(token), "tasteTags")).containsExactlyInAnyOrder("微辣", "少盐");
    }

    @Test
    void emptyValuesClearTheFields() throws Exception {
        String token = guestLogin();
        Map<String, Object> set = new LinkedHashMap<>();
        set.put("gender", "male");
        set.put("birthday", "1990-01-02");
        set.put("tasteTags", List.of("中辣"));
        JsonNode afterSet = patchProfile(token, set);
        assertThat(text(afterSet, "gender")).isEqualTo("male");

        Map<String, Object> clear = new LinkedHashMap<>();
        clear.put("gender", "");
        clear.put("birthday", "");
        clear.put("tasteTags", List.of());
        JsonNode afterClear = patchProfile(token, clear);
        assertThat(text(afterClear, "gender")).isNull();
        assertThat(text(afterClear, "birthday")).isNull();
        assertThat(texts(afterClear, "tasteTags")).isEmpty();
    }

    /** 只传昵称时，已有的口味字段不能被顺手清掉。 */
    @Test
    void omittingFieldsLeavesThemUntouched() throws Exception {
        String token = guestLogin();
        patchProfile(token, Map.of("gender", "female", "tasteTags", List.of("清淡")));

        mockMvc.perform(patch("/api/auth/me")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"nickname\":\"改个名\"}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.nickname").value("改个名"));

        JsonNode me = me(token);
        assertThat(text(me, "gender")).isEqualTo("female");
        assertThat(texts(me, "tasteTags")).containsExactly("清淡");
    }

    /** 忌口存在家庭成员记录里：写入后家庭资料接口能读到（与「家庭 → 成员」页同一份数据）。 */
    @Test
    void avoidTagsRoundTripThroughFamilyEndpoint() throws Exception {
        String token = guestLogin();
        long selfId = me(token).get("userId").asLong();

        mockMvc.perform(put("/api/family/members/" + selfId + "/avoid")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"avoidTags\":[\"香菜\",\"海鲜\"]}"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.avoidTags[0]").exists());

        MvcResult profile = mockMvc.perform(get("/api/family/profile").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode members = objectMapper.readTree(
                profile.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("members");
        JsonNode self = null;
        for (JsonNode member : members) {
            if (member.get("userId").asLong() == selfId) {
                self = member;
            }
        }
        assertThat(self).isNotNull();
        assertThat(texts(self, "avoidTags")).containsExactlyInAnyOrder("香菜", "海鲜");
    }
}
