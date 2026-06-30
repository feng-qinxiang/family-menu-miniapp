package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels.AddMenuItemRequest;
import com.familymenu.daily.dto.ApiModels.AddShoppingItemRequest;
import com.familymenu.daily.dto.ApiModels.DailyMenuView;
import com.familymenu.daily.dto.ApiModels.ShoppingListView;
import com.familymenu.daily.dto.ApiModels.TogglePurchasedRequest;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.TodayService;
import jakarta.validation.Valid;
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

    public TodayController(TodayService todayService) {
        this.todayService = todayService;
    }

    @GetMapping("/daily-menu/today")
    public DailyMenuView todayMenu(@CurrentUser(orGuest = true) AuthUser user) {
        return todayService.getTodayMenu(user.familyId());
    }

    @PostMapping("/daily-menu/today/items")
    @RequiresAuth
    public DailyMenuView addTodayMenuItem(@CurrentUser AuthUser user,
                                          @Valid @RequestBody AddMenuItemRequest request) {
        return todayService.addMenuItem(user.familyId(), request);
    }

    @DeleteMapping("/daily-menu/today/items/{recipeId}")
    @RequiresAuth
    public DailyMenuView removeTodayMenuItem(@CurrentUser AuthUser user, @PathVariable long recipeId) {
        return todayService.removeMenuItem(user.familyId(), recipeId);
    }

    @GetMapping("/shopping-list/today")
    public ShoppingListView shoppingList(@CurrentUser(orGuest = true) AuthUser user) {
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
