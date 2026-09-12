package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
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
import com.familymenu.daily.dto.ApiModels.CommunityReportRequest;
import com.familymenu.daily.dto.ApiModels.UpdateRecipeRequest;
import com.familymenu.daily.dto.ApiModels.VipStatus;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.service.ContentSecurityService;
import com.familymenu.daily.service.MysqlKitchenStore;
import com.familymenu.daily.service.NotificationService;
import jakarta.validation.Valid;
import org.springframework.web.bind.annotation.DeleteMapping;
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
    private final NotificationService notificationService;

    public HomeController(MysqlKitchenStore store, ContentSecurityService contentSecurity,
                          NotificationService notificationService) {
        this.store = store;
        this.contentSecurity = contentSecurity;
        this.notificationService = notificationService;
    }

    /** 社区互动通知：给帖子作者写一条站内信（kind=com，通知页"去社区"直达）。旁路失败不影响主响应。 */
    private void notifyPostAuthor(long postId, AuthUser actor, boolean notify, String verb, String title) {
        if (!notify) {
            return;
        }
        try {
            MysqlKitchenStore.CommunityPostInfo info = store.communityPostInfo(postId);
            if (info == null || info.authorUserId() == actor.userId()) {
                return;
            }
            notificationService.notifyUser(info.authorUserId(), info.familyId(), "com", title,
                    (actor.nickname() == null || actor.nickname().isBlank() ? "有厨友" : actor.nickname())
                            + verb + "《" + info.title() + "》", "community");
        } catch (Exception ignored) {
            // 通知是旁路
        }
    }

    @GetMapping("/home/dashboard")
    public HomeDashboard dashboard(@CurrentUser AuthUser user) {
        return store.dashboard(user.userId(), user.familyId());
    }

    @GetMapping("/recipes")
    public List<RecipeCard> recipes(@RequestParam(defaultValue = "owned") String source,
                                    @CurrentUser AuthUser user) {
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

    /** C 端帖子详情：分享直达用。公开可读（APPROVED），PENDING 仅作者本人可见。 */
    @GetMapping("/community/posts/{postId}")
    public CommunityPost communityPostDetail(@PathVariable long postId,
                                             @CurrentUser AuthUser user) {
        return store.communityPostDetail(postId, user == null ? 0L : user.userId());
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
        CommunityCommentItem item = store.addCommunityComment(postId, user.userId(), request, auditStatus);
        // 只有公开发布的评论才打扰作者；自己评论自己不通知
        notifyPostAuthor(postId, user, ContentSecurityService.STATUS_APPROVED.equals(auditStatus),
                "评论了", "你的帖子收到新评论");
        return item;
    }

    /** 作者删自己的帖子：与运营下架同走 REMOVED。 */
    @DeleteMapping("/community/posts/{postId}")
    @RequiresAuth
    public void deleteCommunityPost(@PathVariable long postId, @CurrentUser AuthUser user) {
        store.deleteCommunityPost(postId, user.userId());
    }

    /** 评论者删自己的评论（软删）。 */
    @DeleteMapping("/community/posts/{postId}/comments/{commentId}")
    @RequiresAuth
    public void deleteCommunityComment(@PathVariable long postId,
                                       @PathVariable long commentId,
                                       @CurrentUser AuthUser user) {
        store.deleteCommunityComment(postId, commentId, user.userId());
    }

    @PostMapping("/community/posts/{postId}/favorite")
    @RequiresAuth
    public CommunityPost toggleCommunityFavorite(@PathVariable long postId, @CurrentUser AuthUser user) {
        return store.toggleCommunityFavorite(postId, user.userId());
    }

    /** 点赞 / 取消点赞（切换语义，返回最新帖子视图）。 */
    @PostMapping("/community/posts/{postId}/like")
    @RequiresAuth
    public CommunityPost toggleCommunityLike(@PathVariable long postId, @CurrentUser AuthUser user) {
        CommunityPost updated = store.toggleCommunityLike(postId, user.userId());
        // 只在"新增点赞"这一跳通知作者；自己赞自己不通知
        notifyPostAuthor(postId, user, updated.liked(), "赞了", "你的帖子收到新点赞");
        return updated;
    }

    @PostMapping("/community/posts/{postId}/report")
    @RequiresAuth
    public void reportCommunityPost(@PathVariable long postId,
                                    @Valid @RequestBody CommunityReportRequest request,
                                    @CurrentUser AuthUser user) {
        store.reportCommunityPost(postId, user.userId(), request);
    }

    // 举报队列的读取与处置已统一收进 /api/admin/reports（运营后台是唯一入口，
    // 小程序里的审核页已下线）。用户提交举报仍走上面的 /community/posts/{id}/report。

    @PostMapping("/import/preview")
    public ImportPreview previewImport(@Valid @RequestBody ParseImportRequest request) {
        return store.previewImport(request.rawText());
    }

    @GetMapping("/vip/status")
    public VipStatus vipStatus(@CurrentUser AuthUser user) {
        return store.vipStatus(user.userId());
    }

    // 遗留端点 POST /vip/activate 已删除：它只需登录即可免费开通会员（资损漏洞）。
    // 用户开通会员一律走 /api/payment/** 的订单 + 支付回调；运营人工开通见 /api/admin/**。

    @GetMapping("/recipes/{recipeId}")
    public RecipeDetail recipeDetail(@PathVariable long recipeId,
                                     @CurrentUser AuthUser user) {
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
                                          @CurrentUser AuthUser user) {
        return store.filterRecipes(source, cuisine, maxTime, minServings, tag, user.userId(), user.familyId());
    }

    @PostMapping("/cook-history")
    @RequiresAuth
    public CookHistoryItem addCookHistory(@Valid @RequestBody AddCookHistoryRequest request,
                                          @CurrentUser AuthUser user) {
        return store.addCookHistory(user.userId(), user.familyId(), request);
    }

    @GetMapping("/cook-history")
    public List<CookHistoryItem> listCookHistory(@CurrentUser AuthUser user) {
        return store.listCookHistory(user.familyId());
    }
}
