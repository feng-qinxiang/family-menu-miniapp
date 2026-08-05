package com.familymenu.daily.dto;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;

import java.time.LocalDate;
import java.util.List;

public final class ApiModels {

    private ApiModels() {
    }

    public record IngredientItem(
            String name,
            String amount,
            String unit
    ) {
    }

    public record RecipeCard(
            Long id,
            String title,
            String sourceType,
            String cuisine,
            List<String> tasteTags,
            Integer timeCost,
            Integer servings,
            Double rating,
            String sourceUrl,
            String summary,
            String coverImage
    ) {
    }

    public record CommunityPost(
            Long id,
            String title,
            String author,
            String content,
            Integer likeCount,
            Integer commentCount,
            Integer favoriteCount,
            boolean favorited,
            List<String> tags,
            RecipeCard recipe
    ) {
    }

    public record CommunityCommentItem(
            Long commentId,
            Long postId,
            String author,
            String content,
            String createdAt
    ) {
    }

    public record VipStatus(
            boolean vip,
            String planName,
            List<String> benefits,
            List<String> adPlacements
    ) {
    }

    public record HomeDashboard(
            String headline,
            List<String> todayModes,
            List<RecipeCard> todayRecommendations,
            List<RecipeCard> ownedRecipes,
            List<RecipeCard> communityRecipes,
            List<RecipeCard> importedRecipes,
            List<CommunityPost> featuredPosts,
            VipStatus vipStatus
    ) {
    }

    public record ImportPreview(
            String title,
            String sourceType,
            String sourceUrl,
            String detectedCuisine,
            List<IngredientItem> ingredients,
            List<String> steps,
            double confidence,
            List<String> notes
    ) {
    }

    public record CreateRecipeRequest(
            @NotBlank String title,
            String sourceType,
            String sourceUrl,
            @NotBlank String cuisine,
            @NotEmpty List<String> tasteTags,
            Integer timeCost,
            Integer servings,
            @NotEmpty List<String> steps,
            @NotEmpty List<IngredientItem> ingredients,
            String summary
    ) {
    }

    public record ParseImportRequest(
            @NotBlank String rawText
    ) {
    }

    public record CommunityCommentRequest(
            @NotBlank String content
    ) {
    }

    public record CreateCommunityPostRequest(
            @NotBlank String title,
            @NotBlank String content,
            Long recipeId,
            List<String> tags
    ) {
    }

    public record CommunityReportRequest(
            @NotBlank String reason,
            String description
    ) {
    }

    public record CommunityReportReviewRequest(
            String status,
            String note
    ) {
    }

    public record CommunityReportItem(
              Long reportId,
              Long postId,
              String postTitle,
              String reporter,
              String reason,
              String description,
              String status,
              String reviewer,
              String note,
              String createdAt,
              String resolvedAt
      ) {
      }

    public record FamilyMemberItem(
            Long userId,
            String nickname,
            String avatarUrl,
            String role,
            String status,
            List<String> avoidTags
    ) {
    }

    public record FamilyProfile(
            Long familyId,
            String familyName,
            Long ownerUserId,
            List<FamilyMemberItem> members
    ) {
    }

    public record AddFamilyMemberRequest(
            @NotBlank String nickname,
            String avatarUrl,
            String role,
            List<String> avoidTags
    ) {
    }

    public record UpdateMemberAvoidRequest(
            List<String> avoidTags
    ) {
    }

    public record CreateFamilyRequest(
            @NotBlank String name,
            String avatarUrl,
            String region
    ) {
    }

    public record JoinFamilyRequest(
            @NotBlank String inviteCode
    ) {
    }

    public record UpdateProfileRequest(
            String nickname,
            String avatarUrl,
            String phone
    ) {
    }

    public record FamilyJoinPreview(
            String inviteCode,
            String familyName,
            int memberCount
    ) {
    }

    public record DailyMenuItemView(
            Long recipeId,
            String mealType,
            RecipeCard recipe
    ) {
    }

    public record DailyMenuView(
            Long menuId,
            LocalDate menuDate,
            Long familyId,
            String status,
            List<DailyMenuItemView> items
    ) {
    }

    public record AddMenuItemRequest(
            @NotNull Long recipeId,
            String mealType
    ) {
    }

    public record ShoppingListItemView(
            Long itemId,
            String ingredientName,
            String amount,
            String unit,
            boolean purchased
    ) {
    }

    public record ShoppingListView(
            Long shoppingListId,
            Long dailyMenuId,
            Long familyId,
            String status,
            List<ShoppingListItemView> items
    ) {
    }

    public record TogglePurchasedRequest(
            boolean purchased
    ) {
    }

    public record RecipeDetail(
            Long id,
            String title,
            String sourceType,
            String sourceUrl,
            String cuisine,
            List<String> tasteTags,
            Integer timeCost,
            Integer servings,
            Double rating,
            String summary,
            List<String> steps,
            List<IngredientItem> ingredients,
            String createdAt
    ) {
    }

    public record UpdateRecipeRequest(
            String title,
            String cuisine,
            List<String> tasteTags,
            Integer timeCost,
            Integer servings,
            List<String> steps,
            List<IngredientItem> ingredients,
            String summary
    ) {
    }

    public record CookHistoryItem(
            Long id,
            Long recipeId,
            String recipeTitle,
            String cookedAt,
            Integer score,
            String remark
    ) {
    }

    public record AddCookHistoryRequest(
            @NotNull Long recipeId,
            Integer score,
            String remark
    ) {
    }

    public record AddShoppingItemRequest(
            @NotBlank String ingredientName,
            String amount,
            String unit
    ) {
    }

    // Phase 4: Weekly menu
    public record WeeklyMenuDay(
            String date,
            String dayLabel,
            List<RecipeCard> recipes
    ) {
    }

    public record WeeklyMenuView(
            String weekStart,
            String weekEnd,
            List<WeeklyMenuDay> days
    ) {
    }

    // Phase 4: Preference learning
    public record PreferenceProfile(
            List<PreferenceItem> cuisinePrefs,
            List<PreferenceItem> tagPrefs,
            int totalCooks,
            String favoriteCuisine
    ) {
    }

    public record PreferenceItem(
            String name,
            int count,
            double weight
    ) {
    }

    // Phase 4: Pantry
    public record PantryItem(
            Long id,
            String ingredientName,
            String amount,
            String unit,
            String expiresAt,
            String addedAt
    ) {
    }

    public record AddPantryItemRequest(
            @NotBlank String ingredientName,
            String amount,
            String unit,
            String expiresAt
    ) {
    }

    public record PantryMatchResult(
            RecipeCard recipe,
            int matchedCount,
            int totalCount,
            double matchRate,
            List<String> missingIngredients
    ) {
    }

    public record ActivateVipRequest(
            String planName
    ) {
    }

    // ===== 支付与会员（见 ADR-0002/0003/0005/0006）=====

    /** 套餐档位展示：金额以分返回，前端负责格式化，禁止用前端值回传定价。 */
    public record PlanOption(
            String planCode,
            String displayName,
            long amountFen,
            int durationDays
    ) {
    }

    /** 下单请求：只传 plan_code，金额与时长一律后端按 code 查出。 */
    public record CreateOrderRequest(
            @NotBlank String planCode,
            String shareScope
    ) {
    }

    /** 下单响应：返回商户订单号供后续支付/模拟开通引用，并回显后端权威金额。 */
    public record CreateOrderResponse(
            String outTradeNo,
            String planCode,
            long amountFen,
            int durationDays,
            String status
    ) {
    }

    /** 模拟开通请求：仅凭 out_trade_no 置 PAID 并触发开通（替代未来微信 notify）。 */
    public record MockPayRequest(
            @NotBlank String outTradeNo
    ) {
    }

    /** 支付结果：开通后回传最新会员展示态，供前端刷新 UI（非开通依据）。 */
    public record PayResult(
            String outTradeNo,
            String status,
            VipStatus vipStatus
    ) {
    }

    public record OrderView(
            String outTradeNo,
            String planCode,
            String planName,
            long amountFen,
            int durationDays,
            String status,
            String paymentMethod,
            String createdAt,
            String paidAt
    ) {
    }

    public record ShareScopeRequest(
            @NotBlank String shareScope
    ) {
    }

    /**
     * 预下单响应：mockMode=true 时商户未配置，前端降级走 mock-pay；
     * mockMode=false 时包含 wx.requestPayment 所需全部参数。
     */
    public record PrepayResponse(
            boolean mockMode,
            String appId,
            String timeStamp,
            String nonceStr,
            String packageValue,   // "prepay_id=xxx"，前端映射到 package 字段
            String signType,
            String paySign
    ) {
    }

    /** 会员详情视图：供前端展示到期时间与共享范围；expiresAtEpoch 为到期时刻的 epoch 秒。 */
    public record MembershipView(
            boolean active,
            String planCode,
            String planName,
            String shareScope,
            String expiresAt,
            long expiresAtEpoch
    ) {
    }

    public record FeedbackRequest(
            @NotEmpty List<String> types,
            @NotBlank String content,
            String contact,
            List<String> images
    ) {
    }

    public record FeedbackReceipt(
            Long id,
            String status,
            String message
    ) {
    }

    public record NotificationItem(
            Long id,
            String group,
            String kind,
            String title,
            String time,
            boolean unread,
            String bodyText,
            String actionType
    ) {
    }

    public record NotificationSummary(
            List<NotificationItem> items,
            int unreadCount
    ) {
    }

    public record MarkNotificationsReadRequest(
            List<Long> ids
    ) {
    }

    public record UploadResult(
            String url,
            String filename,
            long size
    ) {
    }

    // ===== 许愿池（家庭共享，按日期+餐次分槽）=====
    public record WishItem(
            String id,
            String text,
            String by,
            Long recipeId,
            String date,
            String slot,
            long at
    ) {
    }

    public record AddWishRequest(
            @NotBlank String date,
            @NotBlank String slot,
            @NotBlank String text,
            Long recipeId
    ) {
    }
}
