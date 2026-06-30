package com.familymenu.daily.payment;

import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 套餐目录：后端权威定义「卖什么、多少钱、给多久」（见 ADR-0006）。
 * 金额以分（整数）存储杜绝浮点；时长以天计。MVP 阶段硬编码常量，不建配置表。
 * 前端下单只传 plan_code，金额与时长一律以此处为准，前端传来的价格/时长一律忽略。
 */
public final class PlanCatalog {

    /** 一档套餐：code 唯一标识，displayName 面向用户展示，amountFen 售价（分），durationDays 时长（天）。 */
    public record Plan(String code, String displayName, long amountFen, int durationDays) {
    }

    private static final Map<String, Plan> PLANS = new LinkedHashMap<>();

    static {
        register(new Plan("monthly", "家庭月卡", 1990L, 30));
        register(new Plan("annual", "家庭年卡", 9900L, 365));
    }

    private PlanCatalog() {
    }

    private static void register(Plan plan) {
        PLANS.put(plan.code(), plan);
    }

    /** 按 code 查套餐；未知 code 抛 400，杜绝前端传入伪造档位。 */
    public static Plan require(String planCode) {
        Plan plan = planCode == null ? null : PLANS.get(planCode.trim());
        if (plan == null) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "未知套餐: " + planCode);
        }
        return plan;
    }

    /** 展示名兜底：已知 code 返回中文名，未知/空返回原值，供历史会员记录显示。 */
    public static String displayName(String planCode) {
        if (planCode == null || planCode.isBlank()) {
            return "";
        }
        Plan plan = PLANS.get(planCode.trim());
        return plan == null ? planCode.trim() : plan.displayName();
    }

    public static List<Plan> all() {
        return List.copyOf(PLANS.values());
    }
}
