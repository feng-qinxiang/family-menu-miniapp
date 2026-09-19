package com.familymenu.daily.service;

import com.familymenu.daily.dto.ApiModels.RecipeCard;
import org.junit.jupiter.api.Test;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 忌口过滤的规则本身。核心是两端一致性：菜谱列表（前端）和今日推荐（这里）必须对同一个
 * 忌口标签给出同样的取舍，否则用户配了"辣"却仍会在首页看到麻婆豆腐。
 */
class AvoidTagFilterTests {

    private static RecipeCard card(String title, String cuisine, String... tasteTags) {
        return new RecipeCard(1L, title, "owned", cuisine, List.of(tasteTags),
                30, 2, 4.5, null, null, null, null, null);
    }

    @Test
    void presetTagMatchesTasteTagAndTitleNotJustEquality() {
        // 库里的口味标签是「酸辣 / 麻辣」，成员选的标签是「辣」——旧实现按相等比，永远命中不了
        assertThat(AvoidTagFilter.matchesAny(card("酸辣土豆丝", "川菜", "酸辣", "爽脆"), Set.of("辣"))).isTrue();
        assertThat(AvoidTagFilter.matchesAny(card("麻婆豆腐", "川菜", "麻辣", "下饭"), Set.of("辣"))).isTrue();
        assertThat(AvoidTagFilter.matchesAny(card("清炒时蔬", "家常菜", "清淡", "素"), Set.of("辣"))).isFalse();
        // 但「辣」不该顺手把整个川菜区端走：红烧肉也标着川菜，却一点不辣
        assertThat(AvoidTagFilter.matchesAny(card("红烧肉", "川菜", "咸甜", "浓香"), Set.of("辣"))).isFalse();
    }

    @Test
    void synonymDictionaryAppliesOnBothSidesOfTheKeyword() {
        // 「花生」的词典里有「宫保」：宫保鸡丁不含"花生"二字，但确实含花生
        assertThat(AvoidTagFilter.matchesAny(card("宫保鸡丁", "川菜", "香辣"), Set.of("花生"))).isTrue();
        // 「鸡蛋」→「蛋」：西红柿鸡蛋汤要能被"鸡蛋"这个标签挡掉
        assertThat(AvoidTagFilter.matchesAny(card("西红柿鸡蛋汤", "家常菜", "汤羹"), Set.of("鸡蛋"))).isTrue();
    }

    @Test
    void emptyOrNullTagsFilterNothing() {
        RecipeCard any = card("红烧肉", "家常菜", "下饭");
        assertThat(AvoidTagFilter.matchesAny(any, Set.of())).isFalse();
        assertThat(AvoidTagFilter.matchesAny(any, null)).isFalse();
    }

    @Test
    void blankTagDoesNotSwallowTheWholeList() {
        // 关键回归：String.contains("") 恒为 true，空标签若不走过滤会把推荐清空
        RecipeCard any = card("清炒时蔬", "家常菜", "清淡");
        assertThat(AvoidTagFilter.matchesAny(any, Set.of(""))).isFalse();
        assertThat(AvoidTagFilter.matchesAny(any, Set.of("   "))).isFalse();
    }

    @Test
    void customTagFallsBackToLiteralSubstring() {
        assertThat(AvoidTagFilter.matchesAny(card("葱花卷", "面点", "早餐"), Set.of("葱"))).isTrue();
        assertThat(AvoidTagFilter.matchesAny(card("白米饭", "主食", "清淡"), Set.of("葱"))).isFalse();
    }

    /**
     * 词典在两端各有一份（前端 constants.js / 后端 AvoidTagFilter），
     * 这是刻意的设计——列表要本地即时筛选，推荐要在服务端算——但漂移必须变成测试失败。
     */
    @Test
    void keywordDictionaryStaysInSyncWithMiniappConstants() throws IOException {
        Path js = Path.of("..", "miniapp", "utils", "constants.js").toAbsolutePath().normalize();
        assertThat(Files.exists(js)).as("前端词典 %s 必须可读（CI 与仓库同库）", js).isTrue();

        Map<String, List<String>> front = parseAvoidKeywords(Files.readString(js));
        assertThat(front).as("前端 AVOID_KEYWORDS 解析结果不应为空——文件结构变了要同步改这个测试")
                .isNotEmpty();
        assertThat(AvoidTagFilter.presetTags())
                .containsExactlyInAnyOrderElementsOf(front.keySet());
        for (Map.Entry<String, List<String>> e : front.entrySet()) {
            assertThat(AvoidTagFilter.keywordsFor(e.getKey()))
                    .as("忌口标签「%s」的关键词两端不一致：前端会过滤、服务端不会（或反之）", e.getKey())
                    .isEqualTo(e.getValue());
        }
    }

    private static Map<String, List<String>> parseAvoidKeywords(String source) {
        Map<String, List<String>> out = new LinkedHashMap<>();
        int start = source.indexOf("AVOID_KEYWORDS");
        if (start < 0) {
            return out;
        }
        String block = source.substring(start, source.indexOf("};", start) + 1);
        Matcher row = Pattern.compile("'([^']+)':\\s*\\[([^\\]]*)]").matcher(block);
        while (row.find()) {
            List<String> words = new ArrayList<>();
            Matcher word = Pattern.compile("'([^']+)'").matcher(row.group(2));
            while (word.find()) {
                words.add(word.group(1));
            }
            out.put(row.group(1), List.copyOf(words));
        }
        return out;
    }
}
