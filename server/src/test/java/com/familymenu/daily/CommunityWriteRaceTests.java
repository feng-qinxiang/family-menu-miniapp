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
 */
@SpringBootTest
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

    @Test
    void twoMembersCookingTheSameDishBothDeduct() throws Exception {
        // 同一个账号发两个并发请求就够复现"读-改-写丢扣减"了——竞态在库存行上，不在会话上。
        // （原来想拿两个 token 模拟两个家人，但同一设备号第二次取会话会让第一次的 token 失效，
        //  查不到 session 直接 EmptyResult，反而测不到想测的东西。）
        JsonNode me = newGuest("pantry");
        String token = me.get("token").asText();
        long familyId = me.get("user").get("familyId").asLong();
        long userId = me.get("user").get("userId").asLong();

        // 库存 8 个鸡蛋，菜谱 101 每份用 2 个；两人同时做完 → 应当扣到 4，不是各自写回 6
        jdbcTemplate.update("DELETE FROM pantry_item WHERE family_id = ?", familyId);
        jdbcTemplate.update("INSERT INTO pantry_item (family_id, ingredient_name, amount, unit) VALUES (?, '鸡蛋', '8', '个')", familyId);
        try {
            List<Integer> codes = twoConcurrent(t -> {
                try {
                    return mockMvc.perform(post("/api/cook-history")
                                    .header("X-Auth-Token", t)
                                    .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(java.util.Map.of("recipeId", 101, "remark", "竞态"))))
                            .andReturn().getResponse().getStatus();
                } catch (Exception e) {
                    throw new RuntimeException(e);
                }
            }, token, token);
            assertThat(codes).containsExactly(200, 200);
            String amount = jdbcTemplate.queryForObject(
                    "SELECT amount FROM pantry_item WHERE family_id = ? AND ingredient_name = '鸡蛋'", String.class, familyId);
            assertThat(Double.parseDouble(amount))
                    .as("两次上桌各扣 2 个：旧实现读-改-写会把第二次扣减吞掉（都写回 6）")
                    .isBetween(2.0, 4.0001);
        } finally {
            jdbcTemplate.update("DELETE FROM cook_history WHERE family_id = ? AND remark = '竞态'", familyId);
            jdbcTemplate.update("DELETE FROM pantry_item WHERE family_id = ?", familyId);
            assertThat(userId).isPositive();
        }
    }
}
