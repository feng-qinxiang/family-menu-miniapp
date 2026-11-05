package com.familymenu.daily.service;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.dto.ApiModels.IngredientPhotoRequest;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

/** 不连接数据库；验证上传归属、家庭范围与恢复文字语义。 */
class IngredientPhotoTests {
    @Test
    void bindsOnlyOwnUploadsAndScopesChangesToFamily() {
        JdbcTemplate jdbc = mock(JdbcTemplate.class);
        EnhancedService service = spy(new EnhancedService(jdbc, mock(MysqlKitchenStore.class), new ObjectMapper()));
        doReturn(Map.of()).when(service).ingredientPhotos(7);
        String photo = "/uploads/abcdef0123456789abcdef0123456789.jpg";
        assertThatThrownBy(() -> service.saveIngredientPhoto(7, 1, new IngredientPhotoRequest("番茄", "https://example.com/photo.jpg")))
                .isInstanceOf(ResponseStatusException.class);
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(1L), eq(photo))).thenReturn(false);
        assertThatThrownBy(() -> service.saveIngredientPhoto(7, 1, new IngredientPhotoRequest("番茄", photo)))
                .isInstanceOf(ResponseStatusException.class);
        verify(jdbc, never()).update(startsWith("INSERT"), any(Object[].class));
        when(jdbc.queryForObject(anyString(), eq(Boolean.class), eq(1L), eq(photo))).thenReturn(true);
        assertThat(service.saveIngredientPhoto(7, 1, new IngredientPhotoRequest(" 番茄 ", photo))).isEmpty();
        verify(jdbc).update(contains("ON DUPLICATE KEY"), eq(7L), eq("番茄"), eq(photo));
        service.saveIngredientPhoto(7, 1, new IngredientPhotoRequest("番茄", ""));
        verify(jdbc).update("DELETE FROM ingredient_photo WHERE family_id = ? AND ingredient_name = ?", 7L, "番茄");
    }
}
