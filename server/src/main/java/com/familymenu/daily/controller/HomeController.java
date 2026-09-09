package com.familymenu.daily.controller;

import com.familymenu.daily.auth.AdminPermission;
import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.auth.RequiresPermission;
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
import com.familymenu.daily.service.ContentSecurityService;
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
    private final ContentSecurityService contentSecurity;
    private final com.familymenu.daily.service.AdminAuditService auditService;

    public HomeController(MysqlKitchenStore store, ContentSecurityService contentSecurity,
                          com.familymenu.daily.service.AdminAuditService auditService) {
        this.store = store;
        this.contentSecurity = contentSecurity;
        this.auditService = auditService;
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
    public List<CommunityPost> communityPosts(@CurrentUser AuthUser user) {
        // 只读公开接口：未带 token 也能浏览（user 为 null 时不返回"我收藏的"标记）
        return store.communityPosts(user == null ? 0L : user.userId());
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
        // UGC 机审：标题+正文+标签一起送微信 msgSecCheck。
        // 违规直接 400；无法机审（未配凭据 / 游客账号无真实 openid）→ PENDING，进人工审核队列。
        String text = request.title() + "\n" + request.content()
                + (request.tags() == null ? "" : "\n" + String.join(" ", request.tags()));
        String auditStatus = contentSecurity.auditStatus(user.userId(), text, ContentSecurityService.SCENE_FORUM);
        return store.createCommunityPost(user.userId(), request, auditStatus);
    }

    @GetMapping("/community/posts/{postId}/comments")
    public List<CommunityCommentItem> communityComments(@PathVariable long postId,
                                                        @CurrentUser AuthUser user) {
        // 只读公开接口：未登录只看得到已通过审核的评论
        return store.communityComments(postId, user == null ? 0L : user.userId());
    }

    @PostMapping("/community/posts/{postId}/comments")
    @RequiresAuth
    public CommunityCommentItem addCommunityComment(@PathVariable long postId,
                                                    @Valid @RequestBody CommunityCommentRequest request,
                                                    @CurrentUser AuthUser user) {
        // UGC 机审：评论文本送微信 msgSecCheck，违规直接 400，无法机审转人工审核
        String auditStatus = contentSecurity.auditStatus(user.userId(), request.content(),
                ContentSecurityService.SCENE_COMMENT);
        return store.addCommunityComment(postId, user.userId(), request, auditStatus);
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
    @RequiresPermission(AdminPermission.REPORT_REVIEW)
    public List<CommunityReportItem> communityReports(@RequestParam(defaultValue = "PENDING") String status) {
        return store.communityReports(status);
    }

    @PostMapping("/community/reports/{reportId}/review")
    @RequiresPermission(AdminPermission.REPORT_REVIEW)
    public CommunityReportItem reviewCommunityReport(@PathVariable long reportId,
                                                     @Valid @RequestBody CommunityReportReviewRequest request,
                                                     @CurrentUser AuthUser user) {
        try {
            CommunityReportItem item = store.reviewCommunityReport(reportId, user.userId(), request);
            auditService.record(user.userId(), user.nickname(), "REVIEW_REPORT", "report", reportId,
                    request == null ? null : request.status(), true);
            return item;
        } catch (RuntimeException ex) {
            auditService.record(user.userId(), user.nickname(), "REVIEW_REPORT", "report", reportId,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    /** 批量处置举报：一次下架/忽略多条。 */
    @PostMapping("/community/reports/batch-review")
    @RequiresPermission(AdminPermission.REPORT_REVIEW)
    public java.util.Map<String, Object> batchReviewCommunityReports(
            @RequestBody(required = false) com.familymenu.daily.dto.AdminModels.AdminBatchStatusRequest request,
            @CurrentUser AuthUser user) {
        List<Long> ids = request == null ? null : request.ids();
        String status = request == null ? null : request.status();
        String note = request == null ? null : request.note();
        try {
            int done = store.batchReviewCommunityReports(ids, user.userId(), status, note);
            auditService.record(user.userId(), user.nickname(), "BATCH_REVIEW_REPORT", "report",
                    ids == null ? null : String.valueOf(ids.size()), status + " × " + done, true);
            return java.util.Map.of("ok", true, "changed", done);
        } catch (RuntimeException ex) {
            auditService.record(user.userId(), user.nickname(), "BATCH_REVIEW_REPORT", "report", null,
                    ex.getMessage(), false);
            throw ex;
        }
    }

    @PostMapping("/import/preview")
    public ImportPreview previewImport(@Valid @RequestBody ParseImportRequest request) {
        return store.previewImport(request.rawText());
    }

    @GetMapping("/vip/status")
    public VipStatus vipStatus(@CurrentUser(orGuest = true) AuthUser user) {
        return store.vipStatus(user.userId());
    }

    // 遗留端点 POST /vip/activate 已删除：它只需登录即可免费开通会员（资损漏洞）。
    // 用户开通会员一律走 /api/payment/** 的订单 + 支付回调；运营人工开通见 /api/admin/**。

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
