package com.familymenu.daily.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.dto.ApiModels.PantryItem;
import com.familymenu.daily.dto.ApiModels.PantryMatchResult;
import com.familymenu.daily.dto.ApiModels.RecipeCard;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowCallbackHandler;

import java.sql.ResultSet;
import java.time.LocalDate;
import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 直接运行服务方法；不连接数据库，不改本机库存。 */
class PantryMatchTests {
    private static RecipeCard recipe(long id) {
        return new RecipeCard(id, "菜" + id, "owned", "家常", List.of(),
                15, 2, null, null, null, null, null, null);
    }

    private static PantryItem stock(long id, String name, String amount, String unit, LocalDate expiry) {
        return new PantryItem(id, name, amount, unit, expiry == null ? null : expiry.toString(), null, 1L);
    }

    @Test
    void skipsExpiredStockKeepsTodayAndPrioritizesOnlyMatchedExpiringIngredients() throws Exception {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        MysqlKitchenStore kitchen = mock(MysqlKitchenStore.class);
        EnhancedService service = spy(new EnhancedService(jdbc, kitchen, new ObjectMapper()));
        LocalDate today = LocalDate.now();
        List<PantryItem> pantry = List.of(
                stock(1, "番茄", "3", "个", today),
                stock(2, "鸡蛋", "10", "个", today.minusDays(1)),
                stock(3, "鸡蛋", "1", "个", today.plusDays(4)),
                stock(4, "盐", "3", "克", null),
                stock(5, "米", "2", "杯", today.plusDays(9)),
                stock(6, "香葱", "适量", "根", today.plusDays(1)));
        doReturn(pantry).when(service).listPantry(7L);
        when(kitchen.listRecipes("all", 1L, 7L)).thenReturn(List.of(recipe(1), recipe(2), recipe(3), recipe(4), recipe(5), recipe(6)));
        List<String[]> ingredients = List.of(
                new String[]{"1", "番茄", "个", "2"}, new String[]{"1", "鸡蛋", "个", "2"},
                new String[]{"2", "番茄", "个", "2"}, new String[]{"2", "盐", "克", "1"},
                new String[]{"3", "米", "杯", "1"},
                new String[]{"4", "番茄", "个", "2"}, new String[]{"4", "番茄", "个", "2"},
                new String[]{"5", "鸡蛋", "个", "1"},
                new String[]{"6", "番茄", "个", "1"}, new String[]{"6", "香葱", "根", "适量"});
        doAnswer(call -> {
            RowCallbackHandler handler = call.getArgument(1);
            for (String[] row : ingredients) {
                ResultSet rs = mock(ResultSet.class);
                when(rs.getLong("recipe_id")).thenReturn(Long.parseLong(row[0]));
                when(rs.getString("ingredient_name")).thenReturn(row[1]);
                when(rs.getString("unit")).thenReturn(row[2]);
                when(rs.getString("amount")).thenReturn(row[3]);
                handler.processRow(rs);
            }
            return null;
        }).when(jdbc).query(anyString(), any(RowCallbackHandler.class), any(Object[].class));

        List<PantryMatchResult> results = service.matchRecipesWithPantry(7L, 1L);
        assertThat(results).extracting(result -> result.recipe().id()).containsExactly(2L, 3L, 5L, 1L, 6L);
        assertThat(results.get(0).expiringIngredients()).containsExactly("番茄");
        assertThat(results.get(3).missingIngredients()).containsExactly("鸡蛋");
        assertThat(results.get(4).expiringIngredients()).containsExactly("番茄");
        assertThat(results.get(4).missingIngredients()).containsExactly("香葱");
        // 同名重复用料合计不足，不能复用同一份番茄；只有过期库存也不能推荐。
        doReturn(List.of(pantry.get(1))).when(service).listPantry(7L);
        assertThat(service.matchRecipesWithPantry(7L, 1L)).isEmpty();
    }
}
