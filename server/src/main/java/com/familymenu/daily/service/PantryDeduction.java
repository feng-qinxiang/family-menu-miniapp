package com.familymenu.daily.service;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;

/**
 * 做完菜后按菜谱用量扣减冰箱库存（ADR-0009 方案 A：默认按标准量自动扣）。
 *
 * <p>这里只做纯计算（{@link #plan}），落库由 {@code MysqlKitchenStore} 执行——
 * 扣减规则里最容易出错的是"什么情况下不扣"，把判断抽出来才能测干净。
 *
 * <p>刻意保守：宁可少扣、不可乱扣。
 * <ul>
 *   <li>食材名与单位都要**归一后完全相等**才扣（不做包含式模糊匹配，"香葱"不会被当成"葱"）；</li>
 *   <li>两边任一侧的用量解析不出数字（"适量"/"少许"/"1 把"）就不扣；</li>
 *   <li>同一种料在冰箱里有多行时，按调用方给定的顺序（临期优先）依次消耗；</li>
 *   <li>扣到 0 及以下才算用完（由调用方删行），不会扣成负数。</li>
 * </ul>
 */
public final class PantryDeduction {

    /** 一道菜需要的某种食材：名称 + 单位 + 合计用量。 */
    public record Needed(String name, String unit, double amount) {
    }

    /** 冰箱里的一行库存。 */
    public record Stock(long id, String name, String unit, String amount) {
    }

    /** 一次扣减：扣完剩多少（0 表示该行应被删除）。 */
    public record Change(long stockId, String name, String unit, double before, double after) {
    }

    private PantryDeduction() {
    }

    /** 取字符串开头的数字（支持小数）；解析不出或 ≤0 返回 null。 */
    public static Double parseAmount(String raw) {
        if (raw == null) {
            return null;
        }
        String s = raw.trim().replace(",", "");
        int i = 0;
        while (i < s.length() && (Character.isDigit(s.charAt(i)) || s.charAt(i) == '.')) {
            i++;
        }
        if (i == 0) {
            return null;
        }
        try {
            double v = Double.parseDouble(s.substring(0, i));
            return v > 0 ? v : null;
        } catch (NumberFormatException e) {
            return null;
        }
    }

    /** 归一：去空白、转小写。中文本身不受大小写影响，主要是为了空格和英文单位。 */
    public static String normalize(String s) {
        return s == null ? "" : s.replaceAll("\\s+", "").toLowerCase(Locale.ROOT);
    }

    /** 同名的多条菜谱用量先合并，避免同一行库存被重复计算多次。 */
    public static List<Needed> mergeNeeded(List<String[]> rows) {
        Map<String, Needed> byKey = new LinkedHashMap<>();
        for (String[] row : rows) {
            String name = row[0];
            String unit = row[1];
            Double amount = parseAmount(row[2]);
            if (name == null || name.isBlank() || amount == null) {
                continue;
            }
            String key = normalize(name) + "|" + normalize(unit);
            Needed current = byKey.get(key);
            byKey.put(key, new Needed(name.trim(), unit == null ? "" : unit.trim(),
                    (current == null ? 0 : current.amount()) + amount));
        }
        return new ArrayList<>(byKey.values());
    }

    /**
     * 算出要扣哪些行、每行剩多少。
     *
     * @param stock 冰箱行，顺序即消耗顺序（调用方按临期优先排）
     */
    public static List<Change> plan(List<Needed> needed, List<Stock> stock) {
        List<Change> changes = new ArrayList<>();
        if (needed == null || needed.isEmpty() || stock == null || stock.isEmpty()) {
            return changes;
        }
        Map<String, List<Stock>> stockByKey = new LinkedHashMap<>();
        for (Stock s : stock) {
            stockByKey.computeIfAbsent(normalize(s.name()) + "|" + normalize(s.unit()), k -> new ArrayList<>()).add(s);
        }
        for (Needed need : needed) {
            List<Stock> rows = stockByKey.get(normalize(need.name()) + "|" + normalize(need.unit()));
            if (rows == null) {
                continue;
            }
            double remaining = need.amount();
            for (Stock row : rows) {
                if (remaining <= 0) {
                    break;
                }
                Double have = parseAmount(row.amount());
                if (have == null) {
                    continue;   // 库存这行本身写的是"适量"之类，不动它
                }
                double used = Math.min(remaining, have);
                remaining -= used;
                changes.add(new Change(row.id(), need.name(), need.unit(), have, Math.max(0, have - used)));
            }
        }
        return changes;
    }
}
