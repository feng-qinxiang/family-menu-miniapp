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
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 三条核心链路的不变量测试（点菜 / 家庭协作 / 社区）。
 *
 * 这些行为此前只有人工走查证据，没有测试兜底：待审帖泄露、邀请加入后归属错乱、
 * 重复点菜写出多条菜单项，都是上线后会直接被用户看见的问题。
 */
@SpringBootTest
@AutoConfigureMockMvc
class CoreFlowInvariantsTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    /** 每个用例用独立设备号，拿到互不相干的游客账号与家庭。 */
    private JsonNode newGuest(String tag) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "invariants-" + tag + "-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private List<Long> feedIds(String token) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/community/posts").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        List<Long> ids = new ArrayList<>();
        for (JsonNode node : objectMapper.readTree(result.getResponse().getContentAsString())) {
            ids.add(node.get("id").asLong());
        }
        return ids;
    }

    @Test
    void pendingPostIsVisibleToAuthorAndInvisibleToOthers() throws Exception {
        JsonNode author = newGuest("author");
        String authorToken = author.get("token").asText();

        // 未配 WECHAT_APP_SECRET 时无法机审，新帖应落 PENDING（先审后发）
        MvcResult created = mockMvc.perform(post("/api/community/posts")
                        .header("X-Auth-Token", authorToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"待审可见性用例\",\"content\":\"这条帖应该只有作者能看到。\"}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode post = objectMapper.readTree(created.getResponse().getContentAsString());
        long postId = post.get("id").asLong();
        assertThat(post.get("auditStatus").asText()).isEqualTo("PENDING");

        assertThat(feedIds(authorToken)).as("作者要能看到自己的待审帖，否则用户以为发帖失败").contains(postId);
        assertThat(feedIds(newGuest("stranger").get("token").asText()))
                .as("未过审内容绝不能出现在别人的信息流里").doesNotContain(postId);
    }

    @Test
    void joiningByInviteCodeMovesAccountIntoInviterFamily() throws Exception {
        JsonNode inviter = newGuest("inviter");
        String inviterToken = inviter.get("token").asText();
        long inviterFamilyId = inviter.get("user").get("familyId").asLong();

        MvcResult codeResult = mockMvc.perform(get("/api/family/invite-code").header("X-Auth-Token", inviterToken))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode codeJson = objectMapper.readTree(codeResult.getResponse().getContentAsString());
        String inviteCode = codeJson.has("code")
                ? codeJson.get("code").asText()
                : codeJson.get("inviteCode").asText();
        assertThat(inviteCode).hasSize(8);

        String joinerToken = newGuest("joiner").get("token").asText();
        mockMvc.perform(post("/api/family/join")
                        .header("X-Auth-Token", joinerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"inviteCode\":\"" + inviteCode + "\"}"))
                .andExpect(status().isOk());

        MvcResult me = mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", joinerToken))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(objectMapper.readTree(me.getResponse().getContentAsString()).get("familyId").asLong())
                .as("加入后应归属邀请人的家庭").isEqualTo(inviterFamilyId);

        // 成员列表在 /api/family/profile 的 members 字段里（/family/members 只有增删改）
        MvcResult profile = mockMvc.perform(get("/api/family/profile").header("X-Auth-Token", inviterToken))
                .andExpect(status().isOk())
                .andReturn();
        assertThat(objectMapper.readTree(profile.getResponse().getContentAsString()).get("members"))
                .as("成员列表应出现新加入的家人").hasSizeGreaterThanOrEqualTo(2);
    }

    @Test
    void addingSameRecipeTwiceKeepsTodayMenuFreeOfDuplicates() throws Exception {
        String token = newGuest("menu").get("token").asText();
        for (int i = 0; i < 3; i++) {
            mockMvc.perform(post("/api/daily-menu/today/items")
                            .header("X-Auth-Token", token)
                            .contentType(MediaType.APPLICATION_JSON)
                            .content("{\"recipeId\":1,\"mealType\":\"dinner\"}"))
                    .andExpect(status().isOk());
        }

        MvcResult view = mockMvc.perform(get("/api/daily-menu/today").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        List<Long> recipeIds = new ArrayList<>();
        for (JsonNode item : objectMapper.readTree(view.getResponse().getContentAsString()).get("items")) {
            recipeIds.add(item.get("recipeId").asLong());
        }
        assertThat(recipeIds).as("连点三次「加到菜单」只应有一条").hasSize(1);
        assertThat(recipeIds).containsExactly(1L);
    }
}
