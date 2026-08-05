package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAdmin;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels;
import com.familymenu.daily.dto.ApiModels.AddCookHistoryRequest;
import com.familymenu.daily.dto.ApiModels.CommunityPost;
import com.familymenu.daily.dto.ApiModels.CommunityCommentItem;
import com.familymenu.daily.dto.ApiModels.CommunityCommentRequest;
import com.familymenu.daily.dto.ApiModels.CookHistoryItem;
import com.familymenu.daily.dto.ApiModels.CreateRecipeRequest;
import com.familymenu.daily.dto.ApiModels.HomeDashboard;
import com.familymenu.daily.dto.ApiModels.ImportPreview;
import com.familymenu.daily.dto.ApiModels.ParseImportRequest;
import com.familymenu.daily.dto.ApiModels.RecipeCard;
import com.familymenu.daily.dto.ApiModels.RecipeDetail;
import com.familymenu.daily.dto.ApiModels.CommunityReportItem;
import com.familymenu.daily.dto.ApiModels.CommunityReportReviewRequest;
import com.familymenu.daily.dto.ApiModels.CommunityReportRequest;
import com.familymenu.daily.dto.ApiModels.UpdateRecipeRequest;
import com.familymenu.daily.dto.ApiModels.VipStatus;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.MysqlKitchenStore;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import java.util.List;

@RestController
@RequestMapping("/api")
public class HomeController {

    private final MysqlKitchenStore store;

    public HomeController(MysqlKitchenStore store) {
        this.store = store;
    }

    @GetMapping("/home/dashboard")
    public HomeDashboard dashboard(@CurrentUser(orGuest = true) AuthUser user) {
        return store.dashboard(user.userId(), user.familyId());
    }

    @GetMapping("/recipes")
    public List<RecipeCard> recipes(@RequestParam(defaultValue = "owned") String source,
                                    @CurrentUser(orGuest = true) AuthUser user) {
        return store.listRecipes(source, user.userId(), user.familyId());
    }

    @PostMapping("/recipes")
    @RequiresAuth
    public RecipeCard createRecipe(@Valid @RequestBody CreateRecipeRequest request,
                                   @CurrentUser AuthUser user) {
        return store.createRecipe(request, user.userId(), user.familyId());
    }

    @GetMapping("/community/posts")
    public List<CommunityPost> communityPosts(@CurrentUser(orGuest = true) AuthUser user) {
        return store.communityPosts(user.userId());
    }

    @GetMapping("/me/favorites")
    @RequiresAuth
    public List<CommunityPost> myFavorites(@CurrentUser AuthUser user) {
        return store.myFavoritePosts(user.userId());
    }

    @PostMapping("/community/posts")
    @RequiresAuth
    public CommunityPost createCommunityPost(@Valid @RequestBody ApiModels.CreateCommunityPostRequest request,
                                             @CurrentUser AuthUser user) {
        return store.createCommunityPost(user.userId(), request);
    }

    @GetMapping("/community/posts/{postId}/comments")
    public List<CommunityCommentItem> communityComments(@PathVariable long postId) {
        return store.communityComments(postId);
    }

    @PostMapping("/community/posts/{postId}/comments")
    @RequiresAuth
    public CommunityCommentItem addCommunityComment(@PathVariable long postId,
                                                    @Valid @RequestBody CommunityCommentRequest request,
                                                    @CurrentUser AuthUser user) {
        return store.addCommunityComment(postId, user.userId(), request);
    }

    @PostMapping("/community/posts/{postId}/favorite")
    @RequiresAuth
    public CommunityPost toggleCommunityFavorite(@PathVariable long postId, @CurrentUser AuthUser user) {
        return store.toggleCommunityFavorite(postId, user.userId());
    }

    @PostMapping("/community/posts/{postId}/report")
    @RequiresAuth
    public void reportCommunityPost(@PathVariable long postId,
                                    @Valid @RequestBody CommunityReportRequest request,
                                    @CurrentUser AuthUser user) {
        store.reportCommunityPost(postId, user.userId(), request);
    }

    @GetMapping("/community/reports")
    @RequiresAdmin
    public List<CommunityReportItem> communityReports(@RequestParam(defaultValue = "PENDING") String status) {
        return store.communityReports(status);
    }

    @PostMapping("/community/reports/{reportId}/review")
    @RequiresAdmin
    public CommunityReportItem reviewCommunityReport(@PathVariable long reportId,
                                                     @Valid @RequestBody CommunityReportReviewRequest request,
                                                     @CurrentUser AuthUser user) {
        return store.reviewCommunityReport(reportId, user.userId(), request);
    }

    @PostMapping("/import/preview")
    public ImportPreview previewImport(@Valid @RequestBody ParseImportRequest request) {
        return store.previewImport(request.rawText());
    }

    @GetMapping("/vip/status")
    public VipStatus vipStatus(@CurrentUser(orGuest = true) AuthUser user) {
        return store.vipStatus(user.userId());
    }

    @PostMapping("/vip/activate")
    @RequiresAuth
    public VipStatus activateVip(@RequestBody(required = false) ApiModels.ActivateVipRequest request,
                                 @CurrentUser AuthUser user) {
        String plan = request == null ? null : request.planName();
        return store.activateVip(user.userId(), plan);
    }

    @GetMapping("/recipes/{recipeId}")
    public RecipeDetail recipeDetail(@PathVariable long recipeId,
                                     @CurrentUser(orGuest = true) AuthUser user) {
        return store.getRecipeDetail(recipeId, user.userId(), user.familyId());
    }

    @PutMapping("/recipes/{recipeId}")
    @RequiresAuth
    public RecipeDetail updateRecipe(@PathVariable long recipeId,
                                     @Valid @RequestBody UpdateRecipeRequest request,
                                     @CurrentUser AuthUser user) {
        return store.updateRecipe(recipeId, user.userId(), user.familyId(), request);
    }

    @GetMapping("/recipes/filter")
    public List<RecipeCard> filterRecipes(@RequestParam(required = false) String source,
                                          @RequestParam(required = false) String cuisine,
                                          @RequestParam(required = false) Integer maxTime,
                                          @RequestParam(required = false) Integer minServings,
                                          @RequestParam(required = false) String tag,
                                          @CurrentUser(orGuest = true) AuthUser user) {
        return store.filterRecipes(source, cuisine, maxTime, minServings, tag, user.userId(), user.familyId());
    }

    @PostMapping("/cook-history")
    @RequiresAuth
    public CookHistoryItem addCookHistory(@Valid @RequestBody AddCookHistoryRequest request,
                                          @CurrentUser AuthUser user) {
        return store.addCookHistory(user.userId(), user.familyId(), request);
    }

    @GetMapping("/cook-history")
    public List<CookHistoryItem> listCookHistory(@CurrentUser(orGuest = true) AuthUser user) {
        return store.listCookHistory(user.userId());
    }
}
