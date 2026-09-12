package com.familymenu.daily.dto;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

public final class ApiModels {

    private ApiModels() {
    }

    /**
     * 结构化烹饪步骤（text 必填；image/video 可空）。
     * 入参兼容三种形态：纯文本（种子/旧客户端/测试）、历史前端把 {text,image,video} 编码进字符串的旧格式
     * （服务端负责解开，见 utils/recipe-steps.js 的历史 hack）、以及新前端的结构化对象。
     */
    @JsonInclude(JsonInclude.Include.NON_NULL)
    public record RecipeStep(String text, String image, String video) {

        private static final ObjectMapper MAPPER = new ObjectMapper();

        @JsonCreator(mode = JsonCreator.Mode.DELEGATING)
        public static RecipeStep from(JsonNode node) {
            if (node == null || node.isNull()) {
                return new RecipeStep("", null, null);
            }
            if (node.isTextual()) {
                String raw = node.asText();
                if (raw.startsWith("{")) {
                    try {
                        JsonNode parsed = MAPPER.readTree(raw);
                        return new RecipeStep(
                                parsed.path("text").asText(""),
                                parsed.hasNonNull("image") ? parsed.get("image").asText() : null,
                                parsed.hasNonNull("video") ? parsed.get("video").asText() : null);
                    } catch (Exception ignored) {
                        // 非法 JSON：按纯文本保留，不让一条脏数据毁掉整道菜谱
                        return new RecipeStep(raw, null, null);
                    }
                }
                return new RecipeStep(raw, null, null);
            }
            return new RecipeStep(
                    node.path("text").asText(""),
                    node.hasNonNull("image") ? node.get("image").asText() : null,
                    node.hasNonNull("video") ? node.get("video").asText() : null);
        }
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
            String coverImage,
            // 当前家庭的烹饪统计（不涉及的语境为 null）
            Integer cookCount,
            String lastCookedAt,
            /**
             * 是否由当前用户本人创建。
             * 列表接口（菜谱库）必须显式传值：菜谱库里除了自家菜谱，还有对所有人可见的公共菜谱库
             * （recipe.is_public = 1，历史种子数据），只靠 sourceType 分不开这两者——
             * 公共菜谱的 source_type 也是 owned，会被误当成"自建"。
             */
            boolean mine
    ) {
        /** 兼容构造器：不关心归属的语境（今日菜单、帖子内嵌卡片等）默认按"非本人"处理。 */
        public RecipeCard(Long id, String title, String sourceType, String cuisine, List<String> tasteTags,
                          Integer timeCost, Integer servings, Double rating, String sourceUrl, String summary,
                          String coverImage, Integer cookCount, String lastCookedAt) {
            this(id, title, sourceType, cuisine, tasteTags, timeCost, servings, rating, sourceUrl, summary,
                    coverImage, cookCount, lastCookedAt, false);
        }
    }

    public record RecipeReviewItem(
            String nickname,
            Integer score,
            String remark,
            String cookedAt
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
            /** 当前用户是否点过赞（每人每帖一次） */
            boolean liked,
            List<String> tags,
            RecipeCard recipe,
            /** 当前用户是否是作者（作者本人才显示删帖入口） */
            boolean mine,
            /** 帖子配图（/uploads/ URL，最多 6 张，可为空） */
            List<String> images
    ) {
    }

    public record CommunityCommentItem(
            Long commentId,
            Long postId,
            String author,
            String content,
            String createdAt,
            /** 当前用户是否是评论者（作者本人才显示删评论入口） */
            boolean mine
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
            @NotBlank @Size(max = 128) String title,
            @Size(max = 16) String sourceType,
            @Size(max = 512) String sourceUrl,
            @NotBlank @Size(max = 32) String cuisine,
            @NotEmpty @Size(max = 20) List<String> tasteTags,
            Integer timeCost,
            Integer servings,
            @NotEmpty @Size(max = 50) List<RecipeStep> steps,
            @NotEmpty @Size(max = 50) List<IngredientItem> ingredients,
            @Size(max = 255) String summary,
            @Size(max = 512) String coverImage,
            @Size(max = 16) String difficulty
    ) {
    }

    public record ParseImportRequest(
            // 纯文本导入：限长防止把超大文本丢进解析器刷 CPU
            @NotBlank @Size(max = 20000) String rawText
    ) {
    }

    public record CommunityCommentRequest(
            @NotBlank @Size(max = 500) String content
    ) {
    }

    public record CreateCommunityPostRequest(
            @NotBlank @Size(max = 128) String title,
            @NotBlank @Size(max = 5000) String content,
            Long recipeId,
            @Size(max = 10) List<@Size(max = 32) String> tags,
            @Size(max = 6) List<@Size(max = 512) String> images
    ) {
    }

    public record CommunityReportRequest(
            @NotBlank @Size(max = 64) String reason,
            @Size(max = 500) String description
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
            String phone,
            // 绑定/换绑手机号必须同时提供验证码，防止把他人手机号绑到自己账号（账号接管）
            String phoneCode,
            // ---- 个人资料（口味画像）：只传要改的项，null 表示不动 ----
            /** 性别 male / female / other；传空串表示清空 */
            String gender,
            /** 生日 yyyy-MM-dd；传空串表示清空 */
            String birthday,
            /** 口味偏好标签（整体替换）；null 表示不动，空数组表示清空 */
            List<String> tasteTags
    ) {
    }

    public record FamilyJoinPreview(
            String inviteCode,
            String familyName,
            int memberCount,
            // 前 3 位成员昵称（加入前预览用，不暴露敏感信息）
            List<String> memberNicknames
    ) {
    }

    public record DailyMenuItemView(
            Long itemId,
            Long recipeId,
            String mealType,
            String status,
            String addedByName,
            RecipeCard recipe
    ) {
    }

    public record UpdateMenuItemStatusRequest(
            @NotBlank String status
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
            boolean purchased,
            // 该食材来自今日菜单中的哪些菜谱（手动补充的条目为空列表）
            List<String> sourceRecipes
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
            List<RecipeStep> steps,
            List<IngredientItem> ingredients,
            String createdAt,
            String coverImage,
            String difficulty,
            // 当前家庭做过次数与家人评价（取自 cook_history）
            Integer cookCount,
            List<RecipeReviewItem> reviews
    ) {
    }

    public record UpdateRecipeRequest(
            String title,
            String cuisine,
            List<String> tasteTags,
            Integer timeCost,
            Integer servings,
            List<RecipeStep> steps,
            List<IngredientItem> ingredients,
            String summary,
            String coverImage,
            String difficulty
    ) {
    }

    public record CookHistoryItem(
            Long id,
            Long recipeId,
            String recipeTitle,
            String cookedAt,
            Integer score,
            String remark,
            String cookedByName
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
            @NotEmpty @Size(max = 10) List<String> types,
            @NotBlank @Size(max = 2000) String content,
            @Size(max = 128) String contact,
            @Size(max = 9) List<String> images
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
            @NotBlank @Size(max = 20) String date,
            @NotBlank @Size(max = 16) String slot,
            @NotBlank @Size(max = 128) String text,
            Long recipeId
    ) {
    }

    // ===== 微信订阅消息（设置页的"消息通知"开关）=====
    /**
     * 订阅设置。模板 ID 由后端下发，客户端调 wx.requestSubscribeMessage 时需要它
     * —— 这样模板只维护在后端配置一处，不必在小程序里再写一份。
     *
     * @param available 服务端是否配了模板；false 时前端不显示开关（配了才显示，避免点了没反应）
     * @param enabled   用户自己的开关；默认 false，不打扰是默认值
     * @param templates 事件类型 → 模板 ID，只含已配置的
     */
    public record SubscribeSetting(
            boolean available,
            boolean enabled,
            Map<String, String> templates
    ) {
    }

    public record UpdateSubscribeRequest(
            @NotNull Boolean enabled
    ) {
    }
}
