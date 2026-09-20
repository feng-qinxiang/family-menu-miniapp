package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Callable;
import java.util.concurrent.CyclicBarrier;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 一家人同时动手时的菜单域写路径（R9）。
 *
 * 被钉住的语义：菜单域的每个写方法都是「先 ensureXxx 再改行」的读-改-写，写的是同一批
 * 家庭级行（daily_menu → daily_menu_item → shopping_list → shopping_list_item）。
 * 两条请求同时进门时会按相反的加锁顺序去改同一批行，互等成死锁（MySQL 1205）→ 全局处理器
 * 兜成 500，用户看到的是「点菜报错」，而菜单往往已经改了一半。
 * 实现侧的对策是 `TodayService#lockFamilyMenuWrites`：每个写方法进事务第一件事先锁 family 行。
 *
 * ⚠ 这不是"同一天插出两条菜单"的测试：daily_menu 有 uk_family_menu_date、shopping_list 有
 * uk_shopping_menu，重复插入本来就由数据库拦住。这里断言的是**并发下没有人拿到 5xx、且结果不多不少**。
 *
 * ⚠ 死锁是概率事件，一次跑绿不等于没风险；这条用例的作用是"锁被拿掉后行为变坏能被发现"，
 * 以及把「并发点菜不该报错」变成一条每次 CI 都跑的断言。
 */
@SpringBootTest
@AutoConfigureMockMvc
class MenuWriteRaceTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    private JsonNode newGuest(String tag) throws Exception {
        MvcResult result = mockMvc.perform(post("/api/auth/guest")
                        .header("X-Device-Id", "menurace-" + tag + "-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString());
    }

    /** 公共库里的菜，任何家庭都能点（family_id IS NULL 的种子菜谱）。 */
    private List<Long> publicRecipeIds(int n) {
        return jdbcTemplate.queryForList(
                "SELECT id FROM recipe WHERE status = 'ACTIVE' AND (is_public = 1 OR family_id IS NULL) ORDER BY id LIMIT ?",
                Long.class, n);
    }

    /** 把这家今天的菜单清空，让用例从"一张白纸"开始（自己造数据，不依赖别的用例跑过）。 */
    private void clearToday(long familyId) {
        jdbcTemplate.update("""
                DELETE sli FROM shopping_list_item sli
                JOIN shopping_list sl ON sl.id = sli.shopping_list_id
                WHERE sl.family_id = ?
                """, familyId);
        jdbcTemplate.update("DELETE FROM shopping_list WHERE family_id = ?", familyId);
        jdbcTemplate.update("""
                DELETE dmi FROM daily_menu_item dmi
                JOIN daily_menu dm ON dm.id = dmi.daily_menu_id
                WHERE dm.family_id = ?
                """, familyId);
        jdbcTemplate.update("DELETE FROM daily_menu WHERE family_id = ?", familyId);
    }

    /** 把所有调用对齐到同一瞬间起跑（单线程永远复现不了竞态）。 */
    private List<Integer> race(List<Callable<Integer>> calls) throws Exception {
        CyclicBarrier barrier = new CyclicBarrier(calls.size());
        ExecutorService pool = Executors.newFixedThreadPool(calls.size());
        try {
            List<Future<Integer>> futures = new ArrayList<>();
            for (Callable<Integer> call : calls) {
                futures.add(pool.submit(() -> {
                    barrier.await(10, TimeUnit.SECONDS);
                    return call.call();
                }));
            }
            List<Integer> out = new ArrayList<>();
            for (Future<Integer> f : futures) {
                out.add(f.get(30, TimeUnit.SECONDS));
            }
            return out;
        } finally {
            pool.shutdownNow();
        }
    }

    private int addDish(String token, long recipeId) throws Exception {
        return mockMvc.perform(post("/api/daily-menu/today/items")
                        .header("X-Auth-Token", token)
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(objectMapper.writeValueAsString(Map.of("recipeId", recipeId, "mealType", "dinner"))))
                .andReturn().getResponse().getStatus();
    }

    @Test
    void fiveFamilyMembersOrderAtOnceNobodyGets5xxAndAllDishesStay() throws Exception {
        JsonNode me = newGuest("order");
        String token = me.get("token").asText();
        long familyId = me.get("user").get("familyId").asLong();
        List<Long> recipes = publicRecipeIds(5);
        assertThat(recipes).as("公共菜谱库至少要有 5 道，否则这条用例测不到东西").hasSize(5);
        clearToday(familyId);
        try {
            List<Callable<Integer>> calls = new ArrayList<>();
            for (Long recipeId : recipes) {
                calls.add(() -> addDish(token, recipeId));
            }
            List<Integer> codes = race(calls);

            assertThat(codes).as("并发点菜不该有人拿到 5xx（死锁会被兜成 500）").allMatch(c -> c == 200);
            Integer menus = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM daily_menu WHERE family_id = ? AND menu_date = CURRENT_DATE()", Integer.class, familyId);
            assertThat(menus).as("一天一张菜单（uk_family_menu_date）").isEqualTo(1);
            Integer items = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM daily_menu_item dmi
                    JOIN daily_menu dm ON dm.id = dmi.daily_menu_id
                    WHERE dm.family_id = ? AND dm.menu_date = CURRENT_DATE()
                    """, Integer.class, familyId);
            assertThat(items).as("5 个人各点一道，一道都不能丢").isEqualTo(5);
            Integer lists = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM shopping_list WHERE family_id = ?", Integer.class, familyId);
            assertThat(lists).as("一家一天一张清单（uk_shopping_menu）").isEqualTo(1);
        } finally {
            clearToday(familyId);
        }
    }

    @Test
    void orderingWhileSomeoneChecksOffTheListDoesNotBlowUp() throws Exception {
        JsonNode me = newGuest("mixed");
        String token = me.get("token").asText();
        long familyId = me.get("user").get("familyId").asLong();
        List<Long> recipes = publicRecipeIds(2);
        assertThat(recipes).hasSize(2);
        clearToday(familyId);
        try {
            // 先把第一道菜点上，再拿到清单里的一条待买项——后面要"一边加菜一边勾买好"
            assertThat(addDish(token, recipes.get(0))).isEqualTo(200);
            JsonNode list = objectMapper.readTree(mockMvc.perform(get("/api/shopping-list/today")
                            .header("X-Auth-Token", token))
                    .andExpect(status().isOk())
                    .andReturn().getResponse().getContentAsString(java.nio.charset.StandardCharsets.UTF_8));
            JsonNode firstItem = list.get("items").get(0);
            assertThat(firstItem).as("第一道菜的食材应该派生出一条待买项").isNotNull();
            long itemId = firstItem.get("itemId").asLong();

            List<Integer> codes = race(List.of(
                    () -> addDish(token, recipes.get(1)),
                    () -> mockMvc.perform(patch("/api/shopping-list/today/items/" + itemId)
                                    .header("X-Auth-Token", token)
                                    .contentType(MediaType.APPLICATION_JSON)
                                    .content(objectMapper.writeValueAsString(Map.of("purchased", true))))
                            .andReturn().getResponse().getStatus(),
                    () -> mockMvc.perform(post("/api/shopping-list/today/rebuild")
                                    .header("X-Auth-Token", token))
                            .andReturn().getResponse().getStatus()
            ));

            assertThat(codes).as("加菜 / 勾买好 / 重建清单 同时来，谁都不该拿到 5xx").allMatch(c -> c == 200);
            Integer menus = jdbcTemplate.queryForObject(
                    "SELECT COUNT(*) FROM daily_menu WHERE family_id = ? AND menu_date = CURRENT_DATE()", Integer.class, familyId);
            assertThat(menus).isEqualTo(1);
            Integer items = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM daily_menu_item dmi
                    JOIN daily_menu dm ON dm.id = dmi.daily_menu_id
                    WHERE dm.family_id = ? AND dm.menu_date = CURRENT_DATE()
                    """, Integer.class, familyId);
            assertThat(items).as("两道菜都在：并发不能把刚点的那道吃掉").isEqualTo(2);
            // 清单里的自动条目允许被重建换过 itemId，但同一食材（名字+单位）不许出现两行
            Integer dupes = jdbcTemplate.queryForObject("""
                    SELECT COUNT(*) FROM (
                        SELECT sli.ingredient_name, sli.unit
                        FROM shopping_list_item sli
                        JOIN shopping_list sl ON sl.id = sli.shopping_list_id
                        WHERE sl.family_id = ?
                        GROUP BY sli.ingredient_name, sli.unit HAVING COUNT(*) > 1
                    ) t
                    """, Integer.class, familyId);
            assertThat(dupes).as("同一食材+单位只留一行").isZero();
        } finally {
            clearToday(familyId);
        }
    }
}
