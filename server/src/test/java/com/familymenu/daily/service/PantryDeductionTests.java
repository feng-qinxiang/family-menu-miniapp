package com.familymenu.daily.service;

import com.familymenu.daily.service.PantryDeduction.Change;
import com.familymenu.daily.service.PantryDeduction.Needed;
import com.familymenu.daily.service.PantryDeduction.Stock;
import org.junit.jupiter.api.Test;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 做完菜扣冰箱的规则（ADR-0009 方案 A）。
 * 这里只测纯计算：最容易出事的正是"什么情况下不该扣"，
 * 因为扣错等于把用户冰箱里的东西变没了。
 */
class PantryDeductionTests {

    @Test
    void parsesLeadingNumberAndRejectsVagueAmounts() {
        assertThat(PantryDeduction.parseAmount("500")).isEqualTo(500.0);
        assertThat(PantryDeduction.parseAmount(" 2 个")).isEqualTo(2.0);
        assertThat(PantryDeduction.parseAmount("0.5")).isEqualTo(0.5);
        assertThat(PantryDeduction.parseAmount("适量")).isNull();
        assertThat(PantryDeduction.parseAmount("少许")).isNull();
        assertThat(PantryDeduction.parseAmount("")).isNull();
        assertThat(PantryDeduction.parseAmount(null)).isNull();
        assertThat(PantryDeduction.parseAmount("0")).isNull();
    }

    @Test
    void deductsWhenNameAndUnitBothMatch() {
        List<Change> changes = PantryDeduction.plan(
                List.of(new Needed("鸡蛋", "个", 2)),
                List.of(new Stock(7L, "鸡蛋", "个", "8")));
        assertThat(changes).hasSize(1);
        assertThat(changes.get(0).stockId()).isEqualTo(7L);
        assertThat(changes.get(0).before()).isEqualTo(8.0);
        assertThat(changes.get(0).after()).isEqualTo(6.0);
    }

    @Test
    void unitMismatchIsNotDeducted() {
        // 「1 包」和「8 个」是两回事，宁可不扣
        assertThat(PantryDeduction.plan(
                List.of(new Needed("紫菜", "包", 1)),
                List.of(new Stock(1L, "紫菜", "g", "50")))).isEmpty();
    }

    @Test
    void nameMismatchIsNotDeductedAndUsesNoFuzzyMatch() {
        // 不做包含式模糊匹配：香葱 ≠ 葱，否则会把用户没用的东西扣掉
        assertThat(PantryDeduction.plan(
                List.of(new Needed("葱", "根", 1)),
                List.of(new Stock(1L, "香葱", "根", "3")))).isEmpty();
    }

    @Test
    void stockRowWithUnparseableAmountIsLeftAlone() {
        assertThat(PantryDeduction.plan(
                List.of(new Needed("盐", "g", 3)),
                List.of(new Stock(1L, "盐", "g", "适量")))).isEmpty();
    }

    @Test
    void emptiesRowExactlyOnceUsedUp() {
        List<Change> changes = PantryDeduction.plan(
                List.of(new Needed("五花肉", "克", 500)),
                List.of(new Stock(3L, "五花肉", "克", "500")));
        assertThat(changes).hasSize(1);
        assertThat(changes.get(0).after()).isZero();
    }

    @Test
    void spreadsAcrossRowsInGivenOrderAndNeverGoesNegative() {
        // 调用方按临期优先传顺序：先扣 2 个的那瓶，再扣 1 个的那瓶
        List<Change> changes = PantryDeduction.plan(
                List.of(new Needed("鸡蛋", "个", 3)),
                List.of(new Stock(1L, "鸡蛋", "个", "2"), new Stock(2L, "鸡蛋", "个", "1")));
        assertThat(changes).hasSize(2);
        assertThat(changes.get(0).after()).isZero();
        assertThat(changes.get(1).after()).isZero();
        // 要 5 个但只有 3 个：扣光为止，不写负数
        List<Change> shortFall = PantryDeduction.plan(
                List.of(new Needed("鸡蛋", "个", 5)),
                List.of(new Stock(1L, "鸡蛋", "个", "2"), new Stock(2L, "鸡蛋", "个", "1")));
        assertThat(shortFall).allSatisfy(c -> assertThat(c.after()).isGreaterThanOrEqualTo(0.0));
    }

    @Test
    void mergesRepeatedIngredientLinesBeforeDeducting() {
        List<Needed> needed = PantryDeduction.mergeNeeded(List.of(
                new String[]{"鸡蛋", "个", "2"},
                new String[]{"鸡蛋", "个", "1"},
                new String[]{"盐", "g", "适量"},
                new String[]{"", "g", "3"}));
        assertThat(needed).hasSize(1);
        assertThat(needed.get(0).amount()).isEqualTo(3.0);
    }
}
