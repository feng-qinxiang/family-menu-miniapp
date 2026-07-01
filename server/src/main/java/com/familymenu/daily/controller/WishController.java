package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels.AddWishRequest;
import com.familymenu.daily.dto.ApiModels.WishItem;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.WishService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

/**
 * 许愿池端点：家庭共享，按 (date, slot) 分槽。
 * 读允许游客（看自家许愿）；写/删需登录。
 */
@RestController
@RequestMapping("/api/wishes")
public class WishController {

    private final WishService wishService;

    public WishController(WishService wishService) {
        this.wishService = wishService;
    }

    @GetMapping
    public List<WishItem> listWishes(@CurrentUser(orGuest = true) AuthUser user,
                                     @RequestParam(required = false) String date,
                                     @RequestParam(required = false) String slot) {
        return wishService.listWishes(user.familyId(), date, slot);
    }

    @PostMapping
    @RequiresAuth
    public WishItem addWish(@CurrentUser AuthUser user,
                            @Valid @RequestBody AddWishRequest request) {
        return wishService.addWish(user, request);
    }

    @DeleteMapping("/{wishId}")
    @RequiresAuth
    public void removeWish(@CurrentUser AuthUser user, @PathVariable String wishId) {
        wishService.removeWish(user.familyId(), wishId);
    }
}