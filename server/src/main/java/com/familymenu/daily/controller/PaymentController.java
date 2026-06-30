package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels.CreateOrderRequest;
import com.familymenu.daily.dto.ApiModels.CreateOrderResponse;
import com.familymenu.daily.dto.ApiModels.MockPayRequest;
import com.familymenu.daily.dto.ApiModels.MembershipView;
import com.familymenu.daily.dto.ApiModels.OrderView;
import com.familymenu.daily.dto.ApiModels.PayResult;
import com.familymenu.daily.dto.ApiModels.PlanOption;
import com.familymenu.daily.dto.ApiModels.PrepayResponse;
import com.familymenu.daily.dto.ApiModels.ShareScopeRequest;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import com.familymenu.daily.payment.PaymentService;
import com.familymenu.daily.payment.PlanCatalog;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.io.IOException;
import java.util.Enumeration;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 支付与会员开通端点（见 ADR-0003/0005/0006）。
 *
 * 套餐目录公开可读；下单、模拟支付、共享设置均需登录。
 * /mock-pay 是当前阶段替代微信 notify 的开通触发器，未来微信接入后由异步回调走同一开通逻辑。
 */
@RestController
@RequestMapping("/api/payment")
public class PaymentController {

    private static final Logger log = LoggerFactory.getLogger(PaymentController.class);

    private final PaymentService paymentService;

    public PaymentController(PaymentService paymentService) {
        this.paymentService = paymentService;
    }

    /** 套餐目录：金额/时长后端权威，前端只用于展示与回传 plan_code。 */
    @GetMapping("/plans")
    public List<PlanOption> plans() {
        return PlanCatalog.all().stream()
                .map(p -> new PlanOption(p.code(), p.displayName(), p.amountFen(), p.durationDays()))
                .toList();
    }

    /** 下单：仅传 plan_code，金额时长由后端锁定。任意登录用户均可购买（见 ADR-0005）。 */
    @PostMapping("/orders")
    @RequiresAuth
    public CreateOrderResponse createOrder(@CurrentUser AuthUser user,
                                           @Valid @RequestBody CreateOrderRequest request) {
        return paymentService.createOrder(user.userId(), user.familyId(), request.planCode());
    }

    /** 模拟支付：凭 out_trade_no 触发开通，仅下单者本人可调，幂等。 */
    @PostMapping("/mock-pay")
    @RequiresAuth
    public PayResult mockPay(@CurrentUser AuthUser user,
                             @Valid @RequestBody MockPayRequest request) {
        return paymentService.markPaid(user.userId(), request.outTradeNo());
    }

    /** 我的订单列表。 */
    @GetMapping("/orders")
    @RequiresAuth
    public List<OrderView> myOrders(@CurrentUser AuthUser user) {
        return paymentService.listMyOrders(user.userId());
    }

    /** 我的会员详情：到期时间与共享范围，供前端展示。 */
    @GetMapping("/membership")
    @RequiresAuth
    public MembershipView myMembership(@CurrentUser AuthUser user) {
        return paymentService.myMembership(user.userId());
    }

    /** 切换会员共享范围（SELF/FAMILY），仅购买者本人。 */
    @PostMapping("/share-scope")
    @RequiresAuth
    public void updateShareScope(@CurrentUser AuthUser user,
                                 @Valid @RequestBody ShareScopeRequest request) {
        paymentService.updateShareScope(user.userId(), request.shareScope());
    }

    /**
     * 微信支付预下单：生成 wx.requestPayment 所需参数。
     * 商户未配置时返回 mockMode=true，前端降级走 mock-pay。
     *
     * @param orderId 即 outTradeNo（下单接口返回的 out_trade_no）
     */
    @PostMapping("/orders/{orderId}/prepay")
    @RequiresAuth
    public PrepayResponse prepay(@CurrentUser AuthUser user,
                                 @PathVariable String orderId) {
        return paymentService.prepay(user.userId(), orderId);
    }

    /**
     * 微信支付异步回调（Public，无需登录）。
     * 验签 + 解密 → 标记订单 PAID → 开通会员（幂等）。
     * 商户未配置或验签失败时返回 {code:"FAIL"}，微信会按退避策略重试。
     */
    @PostMapping("/notify")
    public ResponseEntity<Map<String, String>> wechatNotify(HttpServletRequest request) {
        try {
            // 读取请求头
            Map<String, String> headers = new HashMap<>();
            Enumeration<String> names = request.getHeaderNames();
            if (names != null) {
                while (names.hasMoreElements()) {
                    String name = names.nextElement();
                    headers.put(name.toLowerCase(), request.getHeader(name));
                }
            }
            // 读取 body
            String body = new String(request.getInputStream().readAllBytes(),
                    java.nio.charset.StandardCharsets.UTF_8);
            paymentService.handleWechatNotify(headers, body);
            return ResponseEntity.ok(Map.of("code", "SUCCESS"));
        } catch (Exception ex) {
            log.warn("[WechatPay] notify failed: {}", ex.getMessage());
            return ResponseEntity.ok(Map.of("code", "FAIL", "message", ex.getMessage()));
        }
    }
}
