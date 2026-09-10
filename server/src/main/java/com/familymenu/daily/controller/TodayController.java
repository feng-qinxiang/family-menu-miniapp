package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels.AddMenuItemRequest;
import com.familymenu.daily.dto.ApiModels.AddShoppingItemRequest;
import com.familymenu.daily.dto.ApiModels.DailyMenuView;
import com.familymenu.daily.dto.ApiModels.ShoppingListView;
import com.familymenu.daily.dto.ApiModels.TogglePurchasedRequest;
import com.familymenu.daily.dto.ApiModels.UpdateMenuItemStatusRequest;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.NotificationService;
import com.familymenu.daily.service.TodayService;
import jakarta.validation.Valid;

import java.util.Map;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api")
public class TodayController {

    private final TodayService todayService;
    private final NotificationService notificationService;

    public TodayController(TodayService todayService, NotificationService notificationService) {
        this.todayService = todayService;
        this.notificationService = notificationService;
    }

    @GetMapping("/daily-menu/today")
    public DailyMenuView todayMenu(@CurrentUser AuthUser user) {
        return todayService.getTodayMenu(user.familyId());
    }

    @PostMapping("/daily-menu/today/items")
    @RequiresAuth
    public DailyMenuView addTodayMenuItem(@CurrentUser AuthUser user,
                                          @Valid @RequestBody AddMenuItemRequest request) {
        return todayService.addMenuItem(user.familyId(), user.nickname(), request);
    }

    @DeleteMapping("/daily-menu/today/items/{recipeId}")
    @RequiresAuth
    public DailyMenuView removeTodayMenuItem(@CurrentUser AuthUser user, @PathVariable long recipeId) {
        return todayService.removeMenuItem(user.familyId(), recipeId);
    }

    /** 菜单项状态流转：todo/cooking/done（菜单页「开做」「上桌」、烹饪模式完成回写共用） */
    @PatchMapping("/daily-menu/today/items/{itemId}/status")
    @RequiresAuth
    public DailyMenuView updateMenuItemStatus(@CurrentUser AuthUser user,
                                              @PathVariable long itemId,
                                              @Valid @RequestBody UpdateMenuItemStatusRequest request) {
        return todayService.updateItemStatus(user.familyId(), itemId, request.status());
    }

    /** 开饭广播：给家里其他成员发"开饭啦"站内通知（今日菜全部上桌后由大厨触发） */
    @PostMapping("/daily-menu/today/announce")
    @RequiresAuth
    public Map<String, Boolean> announceMeal(@CurrentUser AuthUser user) {
        String chef = user.nickname() == null || user.nickname().isBlank() ? "大厨" : user.nickname();
        notificationService.notifyFamily(
                user.familyId(), user.userId(), "meal",
                "开饭啦",
                chef + " 说：今天的菜都做好了，快来吃饭～",
                "menu"
        );
        return Map.of("ok", true);
    }

    @GetMapping("/shopping-list/today")
    public ShoppingListView shoppingList(@CurrentUser AuthUser user) {
        return todayService.getShoppingList(user.familyId());
    }

    @PostMapping("/shopping-list/today/rebuild")
    @RequiresAuth
    public ShoppingListView rebuildShoppingList(@CurrentUser AuthUser user) {
        return todayService.rebuildShoppingList(user.familyId());
    }

    @PatchMapping("/shopping-list/today/items/{itemId}")
    @RequiresAuth
    public ShoppingListView togglePurchased(@CurrentUser AuthUser user,
                                            @PathVariable long itemId,
                                            @Valid @RequestBody TogglePurchasedRequest request) {
        return todayService.togglePurchased(user.familyId(), itemId, request);
    }

    @PostMapping("/shopping-list/today/items")
    @RequiresAuth
    public ShoppingListView addShoppingItem(@CurrentUser AuthUser user,
                                            @Valid @RequestBody AddShoppingItemRequest request) {
        return todayService.addShoppingItem(user.familyId(), request);
    }

    @DeleteMapping("/shopping-list/today/items/{itemId}")
    @RequiresAuth
    public ShoppingListView deleteShoppingItem(@CurrentUser AuthUser user, @PathVariable long itemId) {
        return todayService.deleteShoppingItem(user.familyId(), itemId);
    }
}
