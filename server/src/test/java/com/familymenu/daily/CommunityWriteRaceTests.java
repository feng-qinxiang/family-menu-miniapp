package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 三个写路径竞态的回归测试（R7）。
 *
 * 共同点：都是"先查再写"或"读进内存算完再写绝对值"，单线程永远复现不了，
 * 所以这里用栅栏把两条请求对齐到同一瞬间——这也是它们唯一的可测形式。
 * 每处都改了实现（INSERT IGNORE / 按生成键回显 / 带原始值的乐观条件），
 * 这些断言在改之前会红（点赞那条尤其明显：第二条拿 409）。
 *
 * properties 里钉住演示数据开关：newGuest() 会按 app.seed-demo-data 给新家庭预建 8 条
 * 做菜记录，其中就有下面去重用例的菜谱 101（紫菜蛋花汤）。断言数的是整张表，本地开着
 * APP_SEED_DEMO_DATA=true 联调时会连种子那条一起数 → 变成"连点两次落了两条"的假红
 * （实际只落了 1 条，去重是好的）。环境变量优先级高于 application.properties，
 * 只有这一层压得住。
 */
@SpringBootTest(properties = "app.seed-demo-data=false")
@AutoConfigureMockMvc
class CommunityWriteRaceTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private JsonNode newGuest(String tag) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "wrace-" + tag + "-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private long insertPost(long authorId) {
        jdbcTemplate.update("INSERT INTO community_post (author_user_id, title, content, like_count, comment_count, tags_json, audit_status)"
                        + " VALUES (?, ?, ?, 0, 0, '[]', 'APPROVED')",
                authorId, "竞态测试帖", "正文");
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    /** 两个线程同时打同一个端点，返回各自的结果（状态码或响应里的字段，看调用方要什么）。 */
    private <T> List<T> twoConcurrent(java.util.function.Function<String, T> call, String tokenA, String tokenB) throws Exception {
        CyclicBarrier barrier = new CyclicBarrier(2);
        ExecutorService pool = Executors.newFixedThreadPool(2);
        try {
            List<Future<T>> futures = new ArrayList<>();
            for (String token : List.of(tokenA, tokenB)) {
                futures.add(pool.submit(() -> {
                    barrier.await(10, TimeUnit.SECONDS);
                    return call.apply(token);
                }));
            }
            List<T> out = new ArrayList<>();
            for (Future<T> f : futures) {
                out.add(f.get(30, TimeUnit.SECONDS));
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    @Test
    void simultaneousLikesBothSucceedAndTheCounterMatchesTheRows() throws Exception {
        JsonNode author = newGuest("like-author");
        long authorId = author.get("user").get("userId").asLong();
        JsonNode other = newGuest("like-other");
        long postId = insertPost(authorId);
        try {
            // 两个人同时点同一个帖：旧实现都读到"没点过"→ 第二条 INSERT 撞 uk_post_user → 409
            List<Integer> codes = twoConcurrent(token -> {
                try {
                    return mockMvc.perform(post("/api/community/posts/" + postId + "/like").header("X-Auth-Token", token))
                            .andReturn().getResponse().getStatus();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, author.get("token").asText(), other.get("token").asText());

            assertThat(codes).as("并发点赞不该有人拿到 409").containsExactly(200, 200);
            Integer rows = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM community_post_like WHERE post_id = ?", Integer.class, postId);
            Integer counter = jdbcTemplate.queryForObject("SELECT like_count FROM community_post WHERE id = ?", Integer.class, postId);
            assertThat(counter).as("like_count 必须等于真实行数（计数改成从行重算）").isEqualTo(rows);
            assertThat(rows).isEqualTo(2);

            // 同一个人双击：第二次是取消，两端都得是 200，且行与计数一起回到 1
            List<Integer> toggled = twoConcurrent(token -> {
                try {
                    mockMvc.perform(post("/api/community/posts/" + postId + "/like").header("X-Auth-Token", token));
                    return mockMvc.perform(post("/api/community/posts/" + postId + "/like").header("X-Auth-Token", token))
                            .andReturn().getResponse().getStatus();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, author.get("token").asText(), other.get("token").asText());
            assertThat(toggled).containsExactly(200, 200);
            Integer rowsAfter = jdbcTemplate.queryForObject("SELECT COUNT(*) FROM community_post_like WHERE post_id = ?", Integer.class, postId);
            Integer counterAfter = jdbcTemplate.queryForObject("SELECT like_count FROM community_post WHERE id = ?", Integer.class, postId);
            assertThat(counterAfter).isEqualTo(rowsAfter);
        } finally {
            jdbcTemplate.update("DELETE FROM community_post_like WHERE post_id = ?", postId);
            jdbcTemplate.update("DELETE FROM community_post WHERE id = ?", postId);
        }
    }

    @Test
    void eachCommenterGetsBackTheirOwnComment() throws Exception {
        JsonNode author = newGuest("cmt-author");
        long authorId = author.get("user").get("userId").asLong();
        JsonNode first = newGuest("cmt-a");
        JsonNode second = newGuest("cmt-b");
        long postId = insertPost(authorId);
        try {
            // 旧实现回显用「该帖最新一条」，两条评论挤在一起时后插的会把先插的顶掉：
            // A 发完在页面上看到的是 B 的文字。改成按生成键回显后，各自拿回自己那条。
            List<String> texts = twoConcurrent(token -> {
                try {
                    String body = token.equals(first.get("token").asText()) ? "甲的评论" : "乙的评论";
                    mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                                    .header("X-Auth-Token", token)
                                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(java.util.Map.of("content", body))))
                            .andExpect(status().isOk());
                    MvcResult r = mockMvc.perform(post("/api/community/posts/" + postId + "/comments")
                                    .header("X-Auth-Token", token)
                                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(java.util.Map.of("content", body + "2"))))
                            .andReturn();
                    // MockMvc 的 getContentAsString() 默认按 ISO-8859-1 解，中文会变乱码，必须显式给 UTF-8
                    return objectMapper.readTree(r.getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8)).get("content").asText();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, first.get("token").asText(), second.get("token").asText());

            assertThat(texts).containsExactlyInAnyOrder("甲的评论2", "乙的评论2");
            Integer mine = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM community_post_comment WHERE post_id = ? AND content LIKE '%2'", Integer.class, postId);
            assertThat(mine).isEqualTo(2);
        } finally {
            jdbcTemplate.update("DELETE FROM community_post_comment WHERE post_id = ?", postId);
            jdbcTemplate.update("DELETE FROM community_post WHERE id = ?", postId);
        }
    }

    /** 冰箱里摆 8 个鸡蛋（菜谱 101 每份用 2 个）。扣减结果只差这一步的算法。 */
    private void seedEightEggs(long familyId) {
        jdbcTemplate.update("DELETE FROM pantry_item WHERE family_id = ?", familyId);
        jdbcTemplate.update("INSERT INTO pantry_item (family_id, ingredient_name, amount, unit) VALUES (?, '鸡蛋', '8', '个')", familyId);
    }

    private String eggAmount(long familyId) {
        return jdbcTemplate.queryForObject(
                "SELECT amount FROM pantry_item WHERE family_id = ? AND ingredient_name = '鸡蛋'", String.class, familyId);
    }

    /** 记一笔「这道菜上桌了」。两条竞态用例共用，只有 remark 一致才好在 finally 里收干净。 */
    private int cook(String token) throws Exception {
        return mockMvc.perform(post("/api/cook-history")
                        .header("X-Auth-Token", token)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("recipeId", 101, "remark", "竞态"))))
                .andReturn().getResponse().getStatus();
    }

    private List<Integer> cookTogether(String tokenA, String tokenB) throws Exception {
        return twoConcurrent(t -> {
            try {
                return cook(t);
            } catch (Exception e) {
                throw new RuntimeException(e);
            }
        }, tokenA, tokenB);
    }

    /** 第二个访客用邀请码进同一个家庭，返回他的 token。库存是家庭维度的：不进同一个家就不是同一行库存。 */
    private String joinFamily(String inviterToken, long inviterFamilyId, String tag) throws Exception {
        JsonNode code = objectMapper.readTree(mockMvc.perform(get("/api/family/invite-code")
                        .header("X-Auth-Token", inviterToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        String inviteCode = code.has("code") ? code.get("code").asText() : code.get("inviteCode").asText();
        String joinerToken = newGuest(tag).get("token").asText();
        mockMvc.perform(post("/api/family/join")
                        .header("X-Auth-Token", joinerToken)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(java.util.Map.of("inviteCode", inviteCode))))
                .andExpect(status().isOk());
        JsonNode me = objectMapper.readTree(mockMvc.perform(get("/api/auth/me").header("X-Auth-Token", joinerToken))
                .andExpect(status().isOk()).andReturn().getResponse().getContentAsString());
        assertThat(me.get("familyId").asLong()).as("没进到同一个家庭，那扣的就不是同一行库存").isEqualTo(inviterFamilyId);
        return joinerToken;
    }

    @Test
    void twoMembersCookingTheSameDishBothDeduct() throws Exception {
        // 竞态在库存行上，不在会话上——所以这里真的是**两个家人**：幂等去重按 user_id 走，
        // 同一个账号连发两次会被去重（那条语义由 repeatConfirmWithinTheWindowDeductsOnce 钉）。
        // 两个访客必须进同一个家庭，否则各扣各家的冰箱，测不到同一行。
        JsonNode me = newGuest("pantry");
        String token = me.get("token").asText();
        long familyId = me.get("user").get("familyId").asLong();
        String partnerToken = joinFamily(token, familyId, "pantry-partner");

        // 库存 8 个鸡蛋，菜谱 101 每份用 2 个；两人同时做完 → 应当扣到 4，不是各自写回 6
        seedEightEggs(familyId);
        try {
            List<Integer> codes = cookTogether(token, partnerToken);
            assertThat(codes).containsExactly(200, 200);
            assertThat(Double.parseDouble(eggAmount(familyId)))
                    .as("两次上桌各扣 2 个：旧实现读-改-写会把第二次扣减吞掉（都写回 6）")
                    .isBetween(2.0, 4.0001);
        } finally {
            jdbcTemplate.update("DELETE FROM cook_history WHERE family_id = ? AND remark = '竞态'", familyId);
            jdbcTemplate.update("DELETE FROM pantry_item WHERE family_id = ?", familyId);
        }
    }

    @Test
    void simultaneousDoubleClickIsNotA404() throws Exception {
        // 连点「确定」是**两个同时在途的请求**：一条插进去，另一条的去重判断是锁定读（看得见它），
        // 紧接着按 id 取回那条——这里曾经用普通快照读，快照停在对家提交之前，查不出行就直接 404。
        // 这个窗口靠运气（实测修复前每对约 4/5 会红），所以连发三对；每对都要重起一局，
        // 否则第二对在去重窗口内直接回显上一对那条，不再产生"新插入的行"。
        JsonNode me = newGuest("dblclick-race");
        String token = me.get("token").asText();
        long familyId = me.get("user").get("familyId").asLong();

        try {
            for (int i = 1; i <= 3; i++) {
                jdbcTemplate.update("DELETE FROM cook_history WHERE family_id = ?", familyId);
                seedEightEggs(familyId);
                assertThat(cookTogether(token, token))
                        .as("第 %d 对并发连点里有请求没拿到 200（取回那条查不出行会变成 404）", i)
                        .containsExactly(200, 200);
            }
        } finally {
            jdbcTemplate.update("DELETE FROM cook_history WHERE family_id = ?", familyId);
            jdbcTemplate.update("DELETE FROM pantry_item WHERE family_id = ?", familyId);
        }
    }

    @Test
    void repeatConfirmWithinTheWindowDeductsOnce() throws Exception {
        // 连点模态框「确定」实测 22ms 内发两次请求（两条 cook_history + 冰箱扣两遍）。
        // 页面级防重挡不住已经发出去的请求，所以这一层去重。这里顺序发两次，判据是确定的：
        // 第二条既不能报错（前端要拿回同一条记录渲染），也不能再落一条、更不能把冰箱再扣一遍。
        JsonNode me = newGuest("confirm-twice");
        String token = me.get("token").asText();
        long familyId = me.get("user").get("familyId").asLong();

        seedEightEggs(familyId);
        try {
            assertThat(cook(token)).isEqualTo(200);
            assertThat(cook(token)).as("重复提交不该报错").isEqualTo(200);
            assertThat(jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM cook_history WHERE family_id = ? AND recipe_id = 101", Integer.class, familyId))
                    .as("连点两次落了两条做菜记录").isEqualTo(1);
            assertThat(eggAmount(familyId)).as("连点两次把冰箱扣了两遍").isEqualTo("6");
        } finally {
            jdbcTemplate.update("DELETE FROM cook_history WHERE family_id = ? AND recipe_id = 101", familyId);
            jdbcTemplate.update("DELETE FROM pantry_item WHERE family_id = ?", familyId);
        }
    }
}
