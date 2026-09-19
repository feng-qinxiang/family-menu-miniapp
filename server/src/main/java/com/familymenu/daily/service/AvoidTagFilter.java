package com.familymenu.daily.service;

import com.familymenu.daily.dto.ApiModels.RecipeCard;

import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 忌口匹配：把成员配置的忌口标签展开成关键词，在「菜名 + 菜系 + 口味标签」里做包含判断。
 *
 * <p>为什么不能只比口味标签是否相等：库里的真实标签是「酸辣 / 麻辣 / 香辣」，而成员能选的
 * 预设标签是「辣」。按相等比，八分之一的预设永远命中不了，于是「今日推荐」会照常推麻婆豆腐，
 * 而菜谱列表已经把它过滤掉了——同一个忌口在两个页面给出矛盾的答案。
 *
 * <p>词典与 {@code miniapp/utils/constants.js} 的 AVOID_KEYWORDS 一一对应，
 * 由 AvoidTagFilterTests 逐键比对守住（两端各写一份是事实，漂移不该靠人记）。
 */
public final class AvoidTagFilter {

    private static final Map<String, List<String>> KEYWORDS = Map.of(
            // 「川菜」不算辣味关键词：红烧肉也标着川菜却一点不辣，忌口要挡的是味道不是菜系
            "辣", List.of("辣", "麻婆", "水煮", "香辣", "麻辣"),
            "香菜", List.of("香菜", "芫荽"),
            "猪肉", List.of("猪", "红烧肉", "回锅肉", "小炒肉", "肉末", "排骨", "五花"),
            "牛肉", List.of("牛"),
            "羊肉", List.of("羊"),
            "海鲜", List.of("虾", "鱼", "蟹", "贝", "海鲜", "鱿鱼", "蚝"),
            "花生", List.of("花生", "宫保"),
            "鸡蛋", List.of("蛋")
    );

    private AvoidTagFilter() {
    }

    /** 命中任一忌口即应被排除。空标签集合 = 不过滤（无家庭 / 没人配置忌口）。 */
    public static boolean matchesAny(RecipeCard card, Set<String> avoidTags) {
        if (card == null || avoidTags == null || avoidTags.isEmpty()) {
            return false;
        }
        String hay = haystack(card);
        return avoidTags.stream()
                .filter(AvoidTagFilter::present)
                .anyMatch(tag -> keywordsFor(tag).stream().anyMatch(hay::contains));
    }

    /** 预设标签集合（测试用来和前端词典逐项比对，防两端漂移）。 */
    static Set<String> presetTags() {
        return KEYWORDS.keySet();
    }

    /** 预设标签走词典；自定义/历史值退化为「按标签原文包含」。 */
    static List<String> keywordsFor(String tag) {
        String key = tag == null ? "" : tag.trim();
        List<String> preset = KEYWORDS.get(key);
        if (preset == null) {
            return present(key) ? List.of(key) : List.of();
        }
        return preset;
    }

    static String haystack(RecipeCard card) {
        StringBuilder sb = new StringBuilder()
                .append(nvl(card.title())).append(' ')
                .append(nvl(card.cuisine()));
        if (card.tasteTags() != null) {
            for (String tag : card.tasteTags()) {
                sb.append(' ').append(nvl(tag));
            }
        }
        return sb.toString();
    }

    private static boolean present(String s) {
        return s != null && !s.isBlank();
    }

    private static String nvl(String s) {
        return s == null ? "" : s;
    }
}
