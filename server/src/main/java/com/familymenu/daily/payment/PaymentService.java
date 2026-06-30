package com.familymenu.daily.payment;

import com.familymenu.daily.dto.ApiModels.CreateOrderResponse;
import com.familymenu.daily.dto.ApiModels.MembershipView;
import com.familymenu.daily.dto.ApiModels.OrderView;
import com.familymenu.daily.dto.ApiModels.PayResult;
import com.familymenu.daily.dto.ApiModels.PrepayResponse;
import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.server.ResponseStatusException;

import java.time.LocalDateTime;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.concurrent.ThreadLocalRandom;

/**
 * 支付订单服务：订单状态机与开通凭据的唯一来源（见 ADR-0003/0005/0006）。
 *
 * 状态机：PENDING（下单待支付）→ PAID（到账，触发开通）；旁路终态 CLOSED/REFUNDED。
 * 开通凭据：会员有效期延长只能由订单进入 PAID 触发，前端回调永不作为开通依据。
 * 当前阶段 PAID 由模拟开通端点（payment_method=MOCK）置位；未来由微信异步 notify 验签触发，
 * 届时只需新增一条 notify 入口复用 markPaid，零返工。
 */
@Service
public class PaymentService {

    private static final Logger log = LoggerFactory.getLogger(PaymentService.class);

    private final JdbcTemplate jdbcTemplate;
    private final MembershipService membershipService;
    private final WechatPayService wechatPayService;
    private final ObjectMapper objectMapper;

    public PaymentService(JdbcTemplate jdbcTemplate, MembershipService membershipService,
                          WechatPayService wechatPayService, ObjectMapper objectMapper) {
        this.jdbcTemplate = jdbcTemplate;
        this.membershipService = membershipService;
        this.wechatPayService = wechatPayService;
        this.objectMapper = objectMapper;
    }

    /**
     * 下单：按 plan_code 从后端目录锁定金额与时长，生成唯一 out_trade_no，落 PENDING 订单。
     * 前端传来的任何价格/时长一律忽略（金额防篡改，见 ADR-0006）。
     */
    @Transactional
    public CreateOrderResponse createOrder(long payerUserId, Long familyId, String planCode) {
        PlanCatalog.Plan plan = PlanCatalog.require(planCode);
        String outTradeNo = generateOutTradeNo();
        jdbcTemplate.update("""
                        INSERT INTO payment_order
                            (out_trade_no, payer_user_id, family_id, plan_code, amount_fen, duration_days, status, payment_method)
                        VALUES (?, ?, ?, ?, ?, ?, 'PENDING', 'MOCK')
                        """,
                outTradeNo, payerUserId, familyId, plan.code(), plan.amountFen(), plan.durationDays()
        );
        return new CreateOrderResponse(outTradeNo, plan.code(), plan.amountFen(), plan.durationDays(), "PENDING");
    }

    /**
     * 微信支付预下单：查询订单，获取付款人 openid，调用 WechatPayService 生成预支付参数。
     * 商户未配置时返回 mockMode=true 降级响应。
     */
    public PrepayResponse prepay(long requesterUserId, String outTradeNo) {
        // 检查订单归属
        Map<String, Object> order = lockOrder(outTradeNo);
        long payerUserId = ((Number) order.get("payer_user_id")).longValue();
        if (payerUserId != requesterUserId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "无权操作他人订单");
        }
        String status = (String) order.get("status");
        if ("PAID".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "订单已支付，无需重复预下单");
        }
        if (!"PENDING".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "订单状态不可预下单: " + status);
        }

        if (!wechatPayService.isConfigured()) {
            log.warn("[Payment] WechatPay not configured, prepay returns mockMode for outTradeNo={}", outTradeNo);
            return new PrepayResponse(true, "", "", "", "", "RSA", "");
        }

        // 获取付款人 openid
        String openid = jdbcTemplate.query(
                "SELECT openid FROM user_account WHERE id = ?",
                rs -> rs.next() ? rs.getString("openid") : null,
                payerUserId
        );
        if (openid == null || openid.startsWith("guest-") || openid.startsWith("phone-")
                || openid.startsWith("invite-")) {
            log.warn("[Payment] user {} has no real WeChat openid, prepay mockMode", payerUserId);
            return new PrepayResponse(true, "", "", "", "", "RSA", "");
        }

        String planCode = (String) order.get("plan_code");
        long amountFen = ((Number) order.get("amount_fen")).longValue();
        String description = PlanCatalog.displayName(planCode);

        String prepayId = wechatPayService.createPrepayOrder(outTradeNo, openid, amountFen, description);
        if (prepayId == null) {
            log.warn("[Payment] prepayOrder returned null for outTradeNo={}, fallback mockMode", outTradeNo);
            return new PrepayResponse(true, "", "", "", "", "RSA", "");
        }

        Map<String, String> jsParams = wechatPayService.buildJsapiPayParams(prepayId);
        return new PrepayResponse(
                false,
                jsParams.get("appId"),
                jsParams.get("timeStamp"),
                jsParams.get("nonceStr"),
                jsParams.get("package"),
                "RSA",
                jsParams.get("paySign")
        );
    }

    /**
     * 处理微信支付回调：验签 + 解密 → 标记订单 PAID → 开通会员（幂等）。
     * 由 WechatPayService 完成验签解密，仅在成功后写库。
     */
    @Transactional
    public void handleWechatNotify(Map<String, String> headers, String body) {
        String decrypted = wechatPayService.verifyAndDecryptNotify(headers, body);
        try {
            JsonNode json = objectMapper.readTree(decrypted);
            String outTradeNo = json.get("out_trade_no").asText();
            String tradeState = json.get("trade_state").asText();
            if (!"SUCCESS".equals(tradeState)) {
                log.info("[WechatNotify] outTradeNo={} tradeState={}, skipping", outTradeNo, tradeState);
                return;
            }
            // 无需校验 requesterUserId，由微信通知驱动，按订单 payer_user_id 开通
            Map<String, Object> order = lockOrder(outTradeNo);
            String currentStatus = (String) order.get("status");
            if ("PAID".equals(currentStatus)) {
                log.info("[WechatNotify] outTradeNo={} already PAID, idempotent skip", outTradeNo);
                return;
            }
            if (!"PENDING".equals(currentStatus)) {
                log.warn("[WechatNotify] outTradeNo={} status={}, skip", outTradeNo, currentStatus);
                return;
            }
            long payerUserId = ((Number) order.get("payer_user_id")).longValue();
            String planCode = (String) order.get("plan_code");
            int durationDays = ((Number) order.get("duration_days")).intValue();

            jdbcTemplate.update(
                    "UPDATE payment_order SET status = 'PAID', payment_method = 'WECHAT', paid_at = NOW() WHERE out_trade_no = ?",
                    outTradeNo
            );
            membershipService.grant(payerUserId, planCode, durationDays);
            log.info("[WechatNotify] outTradeNo={} PAID, membership granted to user {}", outTradeNo, payerUserId);
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            throw new RuntimeException("handleWechatNotify parse failed: " + ex.getMessage(), ex);
        }
    }

    // 商户订单号：时间戳 + 随机串，全局唯一由表上 uk_order_out_trade_no 兜底。
    private String generateOutTradeNo() {
        String ts = LocalDateTime.now().format(DateTimeFormatter.ofPattern("yyyyMMddHHmmss", Locale.ROOT));
        String rand = String.format("%06d", ThreadLocalRandom.current().nextInt(0, 1_000_000));
        return "FMD" + ts + rand;
    }

    /**
     * 模拟开通：将订单从 PENDING 推到 PAID 并按套餐时长叠加开通会员。
     * 幂等：同一 out_trade_no 重复调用，已 PAID 则直接返回当前态、不重复延长有效期；
     * 终态 CLOSED/REFUNDED 拒绝再支付。开通与置 PAID 在同一事务内，避免半开通。
     */
    @Transactional
    public PayResult markPaid(long requesterUserId, String outTradeNo) {
        Map<String, Object> order = lockOrder(outTradeNo);
        long payerUserId = ((Number) order.get("payer_user_id")).longValue();
        if (payerUserId != requesterUserId) {
            throw new ResponseStatusException(HttpStatus.FORBIDDEN, "无权支付他人订单");
        }
        String status = (String) order.get("status");
        if ("PAID".equals(status)) {
            // 幂等返回：已开通，不重复叠加。
            return new PayResult(outTradeNo, "PAID", membershipService.vipStatus(payerUserId));
        }
        if (!"PENDING".equals(status)) {
            throw new ResponseStatusException(HttpStatus.CONFLICT, "订单状态不可支付: " + status);
        }
        String planCode = (String) order.get("plan_code");
        int durationDays = ((Number) order.get("duration_days")).intValue();

        jdbcTemplate.update(
                "UPDATE payment_order SET status = 'PAID', payment_method = 'MOCK', paid_at = NOW() WHERE out_trade_no = ?",
                outTradeNo
        );
        membershipService.grant(payerUserId, planCode, durationDays);
        return new PayResult(outTradeNo, "PAID", membershipService.vipStatus(payerUserId));
    }

    // 行级锁读取订单，防并发重复开通；订单不存在抛 404。
    private Map<String, Object> lockOrder(String outTradeNo) {
        try {
            return jdbcTemplate.queryForMap(
                    "SELECT payer_user_id, plan_code, amount_fen, duration_days, status FROM payment_order WHERE out_trade_no = ? FOR UPDATE",
                    outTradeNo
            );
        } catch (EmptyResultDataAccessException ex) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "订单不存在");
        }
    }

    /** 切换会员共享范围（SELF/FAMILY），仅购买者本人可改。 */
    @Transactional
    public void updateShareScope(long payerUserId, String shareScope) {
        String scope = "SELF".equalsIgnoreCase(shareScope) ? "SELF" : "FAMILY";
        int rows = jdbcTemplate.update(
                "UPDATE user_membership SET share_scope = ?, updated_at = NOW() WHERE payer_user_id = ?",
                scope, payerUserId
        );
        if (rows == 0) {
            throw new ResponseStatusException(HttpStatus.NOT_FOUND, "尚未持有会员，无法设置共享范围");
        }
    }

    /** 查询用户自己的订单列表（按下单时间倒序）。 */
    public List<OrderView> listMyOrders(long payerUserId) {
        return jdbcTemplate.query("""
                        SELECT out_trade_no, plan_code, amount_fen, duration_days, status, payment_method,
                               DATE_FORMAT(created_at, '%Y-%m-%d %H:%i:%s') AS created_at,
                               DATE_FORMAT(paid_at, '%Y-%m-%d %H:%i:%s') AS paid_at
                        FROM payment_order WHERE payer_user_id = ? ORDER BY id DESC
                        """,
                (rs, rowNum) -> new OrderView(
                        rs.getString("out_trade_no"),
                        rs.getString("plan_code"),
                        PlanCatalog.displayName(rs.getString("plan_code")),
                        rs.getLong("amount_fen"),
                        rs.getInt("duration_days"),
                        rs.getString("status"),
                        rs.getString("payment_method"),
                        rs.getString("created_at"),
                        rs.getString("paid_at")
                ),
                payerUserId
        );
    }

    /**
     * 查询用户本人持有的会员详情（用于前端展示到期时间与共享开关）。
     * 注意：这里查本人 payer_user_id 的记录，与「享有权益」的共享判定不同——
     * 本人可能无自购会员却因家庭共享而享有权益，那种情况此处返回 active=false。
     */
    public MembershipView myMembership(long payerUserId) {
        return jdbcTemplate.query("""
                        SELECT current_plan, share_scope,
                               DATE_FORMAT(expires_at, '%Y-%m-%d %H:%i:%s') AS expires_at_str,
                               UNIX_TIMESTAMP(expires_at) AS expires_epoch,
                               expires_at > NOW() AS active
                        FROM user_membership WHERE payer_user_id = ?
                        """,
                rs -> {
                    if (!rs.next()) {
                        return new MembershipView(false, "", "", "", "", 0L);
                    }
                    String planCode = rs.getString("current_plan");
                    return new MembershipView(
                            rs.getBoolean("active"),
                            planCode,
                            PlanCatalog.displayName(planCode),
                            rs.getString("share_scope"),
                            rs.getString("expires_at_str"),
                            rs.getLong("expires_epoch")
                    );
                },
                payerUserId
        );
    }
}

