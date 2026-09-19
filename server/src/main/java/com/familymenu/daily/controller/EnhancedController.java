package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels.AddPantryItemRequest;
import com.familymenu.daily.dto.ApiModels.PantryItem;
import com.familymenu.daily.dto.ApiModels.PantryMatchResult;
import com.familymenu.daily.dto.ApiModels.PreferenceProfile;
import com.familymenu.daily.dto.ApiModels.WeeklyMenuView;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.EnhancedService;
import jakarta.validation.Valid;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class EnhancedController {

    // 与 WishController 同因：游客/未入家庭账号的 familyId 为 null，
    // 一路传进 service 会拆箱 NPE 变成 500，前端只显示"加载失败"。
    private static Long requireFamily(AuthUser user) {
        Long familyId = user.familyId();
        if (familyId == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "还没有家庭，请先创建或加入家庭");
        }
        return familyId;
    }

    private final EnhancedService enhancedService;

    public EnhancedController(EnhancedService enhancedService) {
        this.enhancedService = enhancedService;
    }

    @PostMapping("/weekly-menu/generate")
    @RequiresAuth
    public WeeklyMenuView generateWeeklyMenu(@CurrentUser AuthUser user) {
        return enhancedService.generateWeeklyMenu(requireFamily(user), user.userId());
    }

    @GetMapping("/weekly-menu/current")
    public WeeklyMenuView currentWeeklyMenu(@CurrentUser AuthUser user) {
        return enhancedService.generateWeeklyMenu(requireFamily(user), user.userId());
    }

    @GetMapping("/preference/profile")
    public PreferenceProfile preferenceProfile(@CurrentUser AuthUser user) {
        return enhancedService.getPreferenceProfile(user.userId());
    }

    @GetMapping("/pantry")
    public List<PantryItem> listPantry(@CurrentUser AuthUser user) {
        return enhancedService.listPantry(requireFamily(user));
    }

    @PostMapping("/pantry")
    @RequiresAuth
    public PantryItem addPantryItem(@CurrentUser AuthUser user,
                                    @Valid @RequestBody AddPantryItemRequest request) {
        return enhancedService.addPantryItem(requireFamily(user), request);
    }

    @DeleteMapping("/pantry/{itemId}")
    @RequiresAuth
    public void deletePantryItem(@CurrentUser AuthUser user, @PathVariable long itemId) {
        enhancedService.deletePantryItem(requireFamily(user), itemId);
    }

    @GetMapping("/pantry/match")
    public List<PantryMatchResult> pantryMatch(@CurrentUser AuthUser user) {
        return enhancedService.matchRecipesWithPantry(requireFamily(user), user.userId());
    }
}
