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
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 社区信息流改成「UNION ALL 两段」之后的分页不变量。
 *
 * 拆段的动机是实测出来的：`audit_status='APPROVED' OR (PENDING AND author=?)` 这个 OR
 * 让 idx_post_audit 退化成 range + filesort（作者要能看见自己待审的帖，语义不能丢）。
 * 但拆段本身引入两类新风险——**同一条被两段各返回一次**、以及**翻页时漏掉某段**，
 * 所以这里钉的是：不重、不漏、顺序仍是 like_count DESC → id DESC、
 * 待审只对作者可见、收藏数按行相关子查询算出来要和直接 COUNT 一致。
 *
 * 另钉一条语法层面的坑：UNION 分支里的 ORDER BY ... LIMIT 必须整段加括号，
 * 不加的话 MySQL 直接 1064，接口全 500（第一版就栽在这儿，6 个用例同时红）。
 */
@SpringBootTest
@AutoConfigureMockMvc
class CommunityFeedUnionTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private JsonNode newGuest() throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "feedunion-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    private long insertPost(long authorUserId, String status, int likeCount) {
        jdbcTemplate.update(
                "INSERT INTO community_post (author_user_id, title, content, like_count, comment_count, tags_json, audit_status)"
                        + " VALUES (?, ?, ?, ?, 0, '[]', ?)",
                authorUserId, "union-" + likeCount + "-" + status, "正文", likeCount, status);
        return jdbcTemplate.queryForObject("SELECT LAST_INSERT_ID()", Long.class);
    }

    private List<Long> pageIds(String token, int page, int size) throws Exception {
        MvcResult result = mockMvc.perform(get("/api/community/posts")
                        .header("X-Auth-Token", token)
                        .param("page", String.valueOf(page))
                        .param("size", String.valueOf(size)))
                .andExpect(status().isOk())
                .andReturn();
        List<Long> ids = new ArrayList<>();
        for (JsonNode node : objectMapper.readTree(result.getResponse().getContentAsString())) {
            ids.add(node.get("id").asLong());
        }
        return ids;
    }

    @Test
    void pagedFeedNeverDuplicatesOrDropsAcrossTheTwoBranches() throws Exception {
        JsonNode author = newGuest();
        long authorId = author.get("user").get("userId").asLong();
        String authorToken = author.get("token").asText();
        JsonNode stranger = newGuest();
        String strangerToken = stranger.get("token").asText();

        // 已过审 6 条（故意让 like_count 有并列，逼出 tiebreak）+ 作者自己 1 条待审且赞数最高
        int[] likes = {40, 40, 10, 25, 0, 25};
        List<Long> approved = new ArrayList<>();
        for (int like : likes) {
            approved.add(insertPost(authorId, "APPROVED", like));
        }
        long pending = insertPost(authorId, "PENDING", 999);

        try {
            // ① 作者视角逐页走完：不重、不漏、待审那条必须在
            Set<Long> seen = new HashSet<>();
            List<Long> order = new ArrayList<>();
            for (int page = 1; page <= 20; page++) {
                List<Long> ids = pageIds(authorToken, page, 2);
                for (Long id : ids) {
                    assertThat(seen.add(id)).as("第 %d 页出现重复条目 %d（UNION 两段没互斥）", page, id).isTrue();
                }
                order.addAll(ids);
                if (ids.isEmpty()) {
                    break;
                }
            }
            assertThat(order).containsAll(approved);
            assertThat(order).contains(pending);
            // 不断言总条数：测试库里还会有别的用例留下的帖子（本类跑在共享库上）。
            // 顺序的判据改成"**我这批帖子的相对次序**"——全局按 like_count DESC, id DESC 排，
            // 抽出来必然还是这个顺序，和库里有多少别的帖子无关。
            List<Long> mine = new ArrayList<>();
            Set<Long> mineSet = new HashSet<>(approved);
            mineSet.add(pending);
            for (Long id : order) {
                if (mineSet.contains(id)) {
                    mine.add(id);
                }
            }
            // 999 赞的待审帖最前；两条 40 赞按 id 大的在前；两条 25 赞同理；最后 10 赞、0 赞
            assertThat(mine).containsExactly(pending,
                    approved.get(1), approved.get(0),
                    approved.get(5), approved.get(3),
                    approved.get(2), approved.get(4));

            // ② 别人视角：待审那条不能出现，其余都在。
            // 走到空页为止（库里可能有别的用例留下的帖子，固定页数会走不全）
            Set<Long> othersSeen = new HashSet<>();
            for (int page = 1; page <= 20; page++) {
                List<Long> ids = pageIds(strangerToken, page, 2);
                othersSeen.addAll(ids);
                if (ids.isEmpty()) {
                    break;
                }
            }
            assertThat(othersSeen).doesNotContain(pending);
            assertThat(othersSeen).containsAll(approved);
        } finally {
            jdbcTemplate.update("DELETE FROM community_post WHERE id IN (?, ?, ?, ?, ?, ?, ?)",
                    approved.get(0), approved.get(1), approved.get(2), approved.get(3),
                    approved.get(4), approved.get(5), pending);
        }
    }

    @Test
    void favoriteCountMatchesTheActualRowsPerPost() throws Exception {
        JsonNode author = newGuest();
        long authorId = author.get("user").get("userId").asLong();
        JsonNode fan = newGuest();
        long fanId = fan.get("user").get("userId").asLong();
        long postId = insertPost(authorId, "APPROVED", 7);
        try {
            jdbcTemplate.update("INSERT INTO community_post_favorite (post_id, user_id) VALUES (?, ?)", postId, authorId);
            jdbcTemplate.update("INSERT INTO community_post_favorite (post_id, user_id) VALUES (?, ?)", postId, fanId);

            MvcResult result = mockMvc.perform(get("/api/community/posts").header("X-Auth-Token", fan.get("token").asText()))
                    .andExpect(status().isOk())
                    .andReturn();
            JsonNode found = null;
            for (JsonNode node : objectMapper.readTree(result.getResponse().getContentAsString())) {
                if (node.get("id").asLong() == postId) {
                    found = node;
                    break;
                }
            }
            assertThat(found).as("新建的帖子应当出现在信息流里").isNotNull();
            // 收藏数改成"按行相关子查询"之后，值必须仍然等于实际行数（原来是整表派生表）
            assertThat(found.get("favoriteCount").asInt()).isEqualTo(2);
            assertThat(found.get("favorited").asBoolean()).isTrue();
        } finally {
            jdbcTemplate.update("DELETE FROM community_post_favorite WHERE post_id = ?", postId);
            jdbcTemplate.update("DELETE FROM community_post WHERE id = ?", postId);
        }
    }
}
