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
import org.springframework.web.bind.annotation.*;

import java.util.List;

@RestController
@RequestMapping("/api")
public class EnhancedController {

    private final EnhancedService enhancedService;

    public EnhancedController(EnhancedService enhancedService) {
        this.enhancedService = enhancedService;
    }

    @PostMapping("/weekly-menu/generate")
    @RequiresAuth
    public WeeklyMenuView generateWeeklyMenu(@CurrentUser AuthUser user) {
        return enhancedService.generateWeeklyMenu(user.familyId(), user.userId());
    }

    @GetMapping("/weekly-menu/current")
    public WeeklyMenuView currentWeeklyMenu(@CurrentUser(orGuest = true) AuthUser user) {
        return enhancedService.generateWeeklyMenu(user.familyId(), user.userId());
    }

    @GetMapping("/preference/profile")
    public PreferenceProfile preferenceProfile(@CurrentUser(orGuest = true) AuthUser user) {
        return enhancedService.getPreferenceProfile(user.userId());
    }

    @GetMapping("/pantry")
    public List<PantryItem> listPantry(@CurrentUser(orGuest = true) AuthUser user) {
        return enhancedService.listPantry(user.familyId());
    }

    @PostMapping("/pantry")
    @RequiresAuth
    public PantryItem addPantryItem(@CurrentUser AuthUser user,
                                    @Valid @RequestBody AddPantryItemRequest request) {
        return enhancedService.addPantryItem(user.familyId(), request);
    }

    @DeleteMapping("/pantry/{itemId}")
    @RequiresAuth
    public void deletePantryItem(@CurrentUser AuthUser user, @PathVariable long itemId) {
        enhancedService.deletePantryItem(user.familyId(), itemId);
    }

    @GetMapping("/pantry/match")
    public List<PantryMatchResult> pantryMatch(@CurrentUser(orGuest = true) AuthUser user) {
        return enhancedService.matchRecipesWithPantry(user.familyId(), user.userId());
    }
}
