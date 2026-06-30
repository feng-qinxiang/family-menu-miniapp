package com.familymenu.daily.service;

import java.util.Arrays;
import java.util.Collections;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;

/** 食材同义词匹配：把"鸡蛋/蛋/土鸡蛋"归到同一代表词。 */
public final class IngredientMatcher {

    /** 每组首项为代表词。 */
    private static final String[][] SYNONYM_GROUPS = new String[][]{
            {"鸡蛋", "蛋", "土鸡蛋", "笨鸡蛋", "草鸡蛋", "柴鸡蛋"},
            {"番茄", "西红柿", "圣女果"},
            {"土豆", "马铃薯", "洋芋"},
            {"青椒", "灯笼椒", "甜椒", "彩椒"},
            {"猪肉", "里脊", "梅花肉", "五花肉", "猪肉糜", "猪肉末"},
            {"牛肉", "牛腩", "牛腱", "牛里脊"},
            {"鸡肉", "鸡胸", "鸡腿", "鸡腿肉", "鸡胸肉"},
            {"葱", "大葱", "小葱", "香葱", "葱花"},
            {"姜", "生姜", "老姜", "姜片", "姜末"},
            {"蒜", "大蒜", "蒜瓣", "蒜末", "蒜泥", "蒜蓉"},
            {"香菜", "芫荽"},
            {"豆角", "四季豆", "扁豆", "豇豆"},
            {"白菜", "大白菜", "娃娃菜"},
            {"青菜", "小白菜", "上海青", "油菜"},
            {"萝卜", "白萝卜", "胡萝卜", "红萝卜"},
            {"辣椒", "小米椒", "朝天椒", "线椒", "二荆条"},
            {"生抽", "酱油", "老抽"},
            {"米", "大米", "粳米", "丝苗米"},
            {"面粉", "中筋面粉", "高筋面粉", "低筋面粉"},
            {"虾", "对虾", "基围虾", "明虾", "鲜虾"}
    };

    private static final Map<String, String> NORMALIZE_TO_CANON = buildIndex();

    private IngredientMatcher() { }

    private static Map<String, String> buildIndex() {
        Map<String, String> idx = new HashMap<>();
        for (String[] group : SYNONYM_GROUPS) {
            if (group.length == 0) continue;
            String canon = normalize(group[0]);
            for (String word : group) {
                idx.put(normalize(word), canon);
            }
        }
        return Collections.unmodifiableMap(idx);
    }

    public static String normalize(String raw) {
        if (raw == null) return "";
        String n = raw.toLowerCase(Locale.ROOT).trim();
        n = n.replaceAll("\\s+", "");
        return n;
    }

    public static String canonical(String raw) {
        String n = normalize(raw);
        if (n.isEmpty()) return "";
        String mapped = NORMALIZE_TO_CANON.get(n);
        if (mapped != null) return mapped;
        for (Map.Entry<String, String> e : NORMALIZE_TO_CANON.entrySet()) {
            String key = e.getKey();
            if (key.length() >= 2 && (n.contains(key) || key.contains(n))) {
                return e.getValue();
            }
        }
        return n;
    }

    public static boolean matches(String needle, Set<String> pantryCanonicalSet) {
        if (needle == null || pantryCanonicalSet == null || pantryCanonicalSet.isEmpty()) return false;
        String canon = canonical(needle);
        if (canon.isEmpty()) return false;
        if (pantryCanonicalSet.contains(canon)) return true;
        for (String p : pantryCanonicalSet) {
            if (p.isEmpty()) continue;
            if (p.length() >= 2 && canon.length() >= 2 && (p.contains(canon) || canon.contains(p))) {
                return true;
            }
        }
        return false;
    }

    public static Set<String> toCanonicalSet(List<String> ingredientNames) {
        if (ingredientNames == null || ingredientNames.isEmpty()) {
            return Collections.emptySet();
        }
        Set<String> result = new HashSet<>();
        for (String name : ingredientNames) {
            String c = canonical(name);
            if (!c.isEmpty()) result.add(c);
        }
        return result;
    }

    public static Set<String> toCanonicalSet(String... names) {
        return toCanonicalSet(Arrays.asList(names));
    }
}
