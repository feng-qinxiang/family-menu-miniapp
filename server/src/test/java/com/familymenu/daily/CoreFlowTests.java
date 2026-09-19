package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 主链路端到端冒烟：登录 -> 菜谱 -> 今日菜单 -> 购物清单，以及手机验证码登录与反馈提交。
 * 依赖本地 MySQL（与现有 contextLoads 测试环境一致），覆盖核心可交付路径。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = "auth.dev-otp-enabled=true")
class CoreFlowTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    private String guestLogin() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "test-device-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty())
                .andReturn();
        JsonNode body = objectMapper.readTree(result.getResponse().getContentAsString());
        return body.get("token").asText();
    }

    @Test
    void guestCanLoginAndReadDashboard() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/home/dashboard").header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    @Test
    void menuToShoppingListFlowWorks() throws Exception {
        String token = guestLogin();

        MvcResult recipesResult = mockMvc.perform(get("/api/recipes?source=all")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode recipes = objectMapper.readTree(recipesResult.getResponse().getContentAsString());
        assertThat(recipes.isArray()).isTrue();
        assertThat(recipes.size()).isGreaterThan(0);
        long recipeId = recipes.get(0).get("id").asLong();

        String addBody = objectMapper.writeValueAsString(
                java.util.Map.of("recipeId", recipeId, "mealType", "dinner"));
        mockMvc.perform(post("/api/daily-menu/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(addBody))
                .andExpect(status().isOk());

        MvcResult menuResult = mockMvc.perform(get("/api/daily-menu/today")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        String menuJson = menuResult.getResponse().getContentAsString();
        assertThat(menuJson).contains(String.valueOf(recipeId));

        mockMvc.perform(post("/api/shopping-list/today/rebuild")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk());

        mockMvc.perform(get("/api/shopping-list/today")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk());
    }

    /**
     * 「重新生成清单」的确认文案承诺的是：已勾的「买好了」保留、手动加的条目保留。
     * 这句文案曾经写反（说会清掉勾选），所以把真实行为钉在这里：
     * 服务端删掉 is_manual=0 的旧行后会按「食材名+单位」把 purchased 恢复回来（loadPreviousPurchasedMap），
     * is_manual=1 的行根本不删。注意重建会自动条目会换 itemId，所以断言只能按食材名找。
     */
    @Test
    void rebuildKeepsPurchasedFlagsAndManualItems() throws Exception {
        String token = guestLogin();

        MvcResult recipesResult = mockMvc.perform(get("/api/recipes?source=all")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        long recipeId = objectMapper.readTree(recipesResult.getResponse().getContentAsString(
                java.nio.charset.StandardCharsets.UTF_8)).get(0).get("id").asLong();
        mockMvc.perform(post("/api/daily-menu/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                java.util.Map.of("recipeId", recipeId, "mealType", "dinner"))))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/shopping-list/today/rebuild").header("X-Auth-Token", token))
                .andExpect(status().isOk());

        JsonNode before = shoppingItems(token);
        assertThat(before.size()).as("菜单里这道菜至少要算出一条食材，否则这个用例测不到东西").isGreaterThan(0);
        String autoName = before.get(0).get("ingredientName").asText();
        long autoItemId = before.get(0).get("itemId").asLong();

        mockMvc.perform(patch("/api/shopping-list/today/items/" + autoItemId)
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"purchased\":true}"))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/shopping-list/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"ingredientName\":\"测试-厨房纸\",\"amount\":\"1\",\"unit\":\"包\"}"))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/shopping-list/today/rebuild").header("X-Auth-Token", token))
                .andExpect(status().isOk());

        Boolean autoPurchased = null;
        boolean manualKept = false;
        for (JsonNode item : shoppingItems(token)) {
            String name = item.get("ingredientName").asText();
            if (name.equals(autoName)) {
                autoPurchased = item.get("purchased").asBoolean();
            }
            if ("测试-厨房纸".equals(name)) {
                manualKept = true;
            }
        }
        assertThat(autoPurchased)
                .as("重建前勾上的「买好了」必须保留——确认文案就是这么向用户承诺的")
                .isEqualTo(Boolean.TRUE);
        assertThat(manualKept).as("手动加的条目不该被按菜单重建删掉").isTrue();
    }

    private JsonNode shoppingItems(String token) throws Exception {
        MvcResult res = mockMvc.perform(get("/api/shopping-list/today")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString(
                java.nio.charset.StandardCharsets.UTF_8)).get("items");
    }

    @Test
    void phoneOtpLoginFlowWorks() throws Exception {
        String phone = "138" + String.format("%08d", (System.nanoTime() % 100000000));
        String reqBody = objectMapper.writeValueAsString(java.util.Map.of("phone", phone));
        MvcResult otpResult = mockMvc.perform(post("/api/auth/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(reqBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.phone").isNotEmpty())
                .andReturn();
        JsonNode otp = objectMapper.readTree(otpResult.getResponse().getContentAsString());
        String devCode = otp.get("devCode").asText();
        assertThat(devCode).isNotEmpty();

        String loginBody = objectMapper.writeValueAsString(
                java.util.Map.of("phone", phone, "code", devCode));
        mockMvc.perform(post("/api/auth/otp/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(loginBody))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.token").isNotEmpty());
    }

    @Test
    void otpLoginRejectsWrongCode() throws Exception {
        String phone = "139" + String.format("%08d", (System.nanoTime() % 100000000));
        mockMvc.perform(post("/api/auth/otp/request")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("phone", phone))))
                .andExpect(status().isOk());

        mockMvc.perform(post("/api/auth/otp/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(
                                java.util.Map.of("phone", phone, "code", "000000"))))
                .andExpect(status().isUnauthorized());
    }

    @Test
    void feedbackSubmissionPersistsTicket() throws Exception {
        String token = guestLogin();
        String body = objectMapper.writeValueAsString(java.util.Map.of(
                "types", java.util.List.of("bug"),
                "content", "测试反馈内容",
                "contact", "test@example.com"));
        mockMvc.perform(post("/api/feedback")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.id").isNotEmpty());
    }

    @Test
    void familyCreateInviteJoinAndRemoveFlowWorks() throws Exception {
        String ownerToken = guestLogin();
        String body = objectMapper.writeValueAsString(java.util.Map.of("name", "测试家庭" + System.nanoTime()));
        mockMvc.perform(post("/api/family")
                        .header("X-Auth-Token", ownerToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(body))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.familyName").isNotEmpty());

        MvcResult inviteResult = mockMvc.perform(get("/api/family/invite-code")
                        .header("X-Auth-Token", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.inviteCode").isNotEmpty())
                .andReturn();
        String inviteCode = objectMapper.readTree(inviteResult.getResponse().getContentAsString()).get("inviteCode").asText();

        mockMvc.perform(get("/api/family/join-preview")
                        .param("inviteCode", inviteCode)
                        .header("X-Auth-Token", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.familyName").isNotEmpty());

        String memberToken = guestLogin();
        MvcResult joined = mockMvc.perform(post("/api/family/join")
                        .header("X-Auth-Token", memberToken)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("inviteCode", inviteCode))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members").isArray())
                .andReturn();
        JsonNode members = objectMapper.readTree(joined.getResponse().getContentAsString()).get("members");
        long targetUserId = members.get(members.size() - 1).get("userId").asLong();

        mockMvc.perform(delete("/api/family/members/{userId}", targetUserId)
                        .header("X-Auth-Token", ownerToken))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.members").isArray());
    }

    @Test
    void notificationsCanBeListedAndMarkedRead() throws Exception {
        String token = guestLogin();
        mockMvc.perform(get("/api/notifications")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isArray());

        mockMvc.perform(patch("/api/notifications/read")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("ids", java.util.List.of()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.unreadCount").value(0));
    }

    @Test
    void communityPostLikeTogglesAndKeepsCountInSync() throws Exception {
        String token = guestLogin();
        // 自带一条帖子。以前这里直接读 feed 的第一条并断言"库里至少有帖子"，
        // 单跑本类时必现失败——CI 绿只是因为别的用例先建了帖，属顺序依赖。
        MvcResult created = mockMvc.perform(post("/api/community/posts")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "title", "点赞自检 " + System.nanoTime(),
                                "content", "用于验证点赞计数的增减"))))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode post = objectMapper.readTree(
                created.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        long postId = post.get("id").asLong();
        int before = post.has("likeCount") ? post.get("likeCount").asInt() : 0;
        assertThat(postId).isPositive();

        // 点赞：liked=true 且计数 +1
        MvcResult liked = mockMvc.perform(post("/api/community/posts/" + postId + "/like")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode after = objectMapper.readTree(
                liked.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(after.get("liked").asBoolean()).isTrue();
        assertThat(after.get("likeCount").asInt()).isEqualTo(before + 1);

        // 再点一次取消：liked=false 且计数回到原值
        MvcResult unliked = mockMvc.perform(post("/api/community/posts/" + postId + "/like")
                        .header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode back = objectMapper.readTree(
                unliked.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
        assertThat(back.get("liked").asBoolean()).isFalse();
        assertThat(back.get("likeCount").asInt()).isEqualTo(before);
    }

    @Test
    void protectedEndpointRejectsMissingToken() throws Exception {
        mockMvc.perform(post("/api/shopping-list/today/rebuild"))
                .andExpect(status().isUnauthorized());
    }

    /**
     * 做完一道菜要把用掉的食材从冰箱里扣掉（ADR-0009 方案 A：默认按标准量自动扣）。
     * 这条链跨 菜单 → 清单 → 冰箱 → 做菜记录 四个接口，所以走端到端：
     * 纯算法有 PantryDeductionTests 守着，这里证明的是"记一笔做完"真的会回写库存。
     */
    @Test
    void cookingDeductsPantryByRecipeAmount() throws Exception {
        String token = guestLogin();
        mockMvc.perform(post("/api/family")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "name", "扣料测试家庭" + System.nanoTime()))))
                .andExpect(status().isOk());

        long recipeId = firstRecipeId(token);
        mockMvc.perform(post("/api/daily-menu/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "recipeId", recipeId, "mealType", "dinner"))))
                .andExpect(status().isOk());
        mockMvc.perform(post("/api/shopping-list/today/rebuild").header("X-Auth-Token", token))
                .andExpect(status().isOk());

        // 从清单里挑一种用量写得成数字的食材，往冰箱放一份**一定够**的量。
        // （第一版这里放的是 99，结果排骨一道菜要 500 克，库存被扣到 0 直接删行，
        // 断言"还剩一点"就红了——那是设计行为，不是 bug：扣光即用完。）
        JsonNode chosen = null;
        for (JsonNode candidate : shoppingItems(token)) {
            if (candidate.get("amount").asText().trim().matches("\\d.*")) {
                chosen = candidate;
                break;
            }
        }
        assertThat(chosen).as("这道菜至少得有一种数字用量的食材，否则这个用例测不到扣减").isNotNull();
        String name = chosen.get("ingredientName").asText();
        String unit = chosen.hasNonNull("unit") ? chosen.get("unit").asText("") : "";

        mockMvc.perform(post("/api/pantry")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of(
                                "ingredientName", name, "amount", "999999", "unit", unit))))
                .andExpect(status().isOk());

        MvcResult cooked = mockMvc.perform(post("/api/cook-history")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{\"recipeId\":" + recipeId + "}"))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode cookedJson = read(cooked);
        assertThat(cookedJson.path("pantryDeducted").asInt())
                .as("记一笔做完之后，响应要告诉前端冰箱被扣了几行（0 表示没东西可扣）")
                .isGreaterThanOrEqualTo(1);

        MvcResult pantryRes = mockMvc.perform(get("/api/pantry").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode rows = objectMapper.readTree(pantryRes.getResponse().getContentAsString(
                java.nio.charset.StandardCharsets.UTF_8));
        boolean reduced = false;
        for (JsonNode row : rows) {
            if (name.equals(row.get("ingredientName").asText())) {
                double left = Double.parseDouble(row.get("amount").asText());
                assertThat(left).as("扣完不能是负数，也不该在这一笔里被扣光（放的是够用的大数）").isGreaterThan(0);
                reduced = left < 999999;
            }
        }
        assertThat(reduced).as("冰箱里「%s」的量应从 999999 减下来", name).isTrue();
    }

    private long firstRecipeId(String token) throws Exception {
        MvcResult res = mockMvc.perform(get("/api/recipes?source=all").header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(res.getResponse().getContentAsString(
                java.nio.charset.StandardCharsets.UTF_8)).get(0).get("id").asLong();
    }

    private JsonNode read(MvcResult result) throws Exception {
        return objectMapper.readTree(result.getResponse().getContentAsString(
                java.nio.charset.StandardCharsets.UTF_8));
    }
}
