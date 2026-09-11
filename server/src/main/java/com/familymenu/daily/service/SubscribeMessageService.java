package com.familymenu.daily.service;

import com.familymenu.daily.dto.ApiModels.SubscribeSetting;
import jakarta.annotation.PreDestroy;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;

import java.util.LinkedHashMap;
import java.util.Map;
import java.util.concurrent.ArrayBlockingQueue;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.ThreadPoolExecutor;
import java.util.concurrent.TimeUnit;

/**
 * 微信订阅消息（服务端推送）。
 *
 * 为什么模板 ID 走配置、留空即关闭：
 *   模板要先去小程序后台申请、审核通过才有 ID，代码不能假定它已经存在。
 *   留空时整个功能静默关闭（不发送、前端也不显示开关），配上就能用，不需要改代码。
 *
 * 为什么必须异步：推送要发起外部 HTTP 请求（最坏几秒超时）。它挂在许愿、开饭广播这类
 * 用户点击的同步接口上，同步发会把这些接口拖慢甚至拖挂。所以一律丢进单线程队列，
 * 业务线程立即返回。队列有界，满了就丢——推送是旁路，宁可少发一条也不能拖累主流程。
 *
 * 一次性订阅的配额语义：
 *   用户在客户端每同意一次，服务端才能发一条，微信不提供"还剩几条"的查询接口。
 *   所以这里不做配额记账，直接发，靠返回码判断：43101 = 用户没订阅或配额已用完，
 *   属正常情况，静默跳过即可。前端负责在用户点击时补充授权（见 miniapp/utils/subscribe.js）。
 */
@Service
public class SubscribeMessageService {

    private static final Logger log = LoggerFactory.getLogger(SubscribeMessageService.class);

    /** 事件类型：家人许愿 / 开饭提醒。同时是 application.yml 里模板配置的键名后缀。 */
    public static final String KIND_WISH = "wish";
    public static final String KIND_MEAL = "meal";

    /**
     * 消息字段名。必须与小程序后台申请到的模板字段**完全一致**，
     * 否则微信返回 47003（参数不匹配）。当前按「事项 + 说明」两字段的模板设计：
     * 申请模板时请选字段为 thing1 / thing2 的，若后台给的是别的字段名，改这两个常量即可。
     */
    private static final String FIELD_SUBJECT = "thing1";
    private static final String FIELD_DETAIL = "thing2";

    /** 微信 thing 类型字段上限 20 个字符，超长会被判参数不合法 */
    private static final int THING_MAX = 20;

    /** 用户没有订阅（或配额已用完）——预期内的结果，不当错误 */
    private static final int ERRCODE_NO_QUOTA = 43101;

    private final WechatClient wechatClient;
    private final JdbcTemplate jdbcTemplate;
    private final RestClient restClient;

    /** 事件类型 → 模板 ID；只装已配置的，没配的事件不会出现在这里 */
    private final Map<String, String> templates;

    /** 跳转的小程序版本：developer / trial / formal，本地联调时改成 trial 或 developer */
    private final String miniprogramState;

    private final ExecutorService sender;

    public SubscribeMessageService(WechatClient wechatClient,
                                   JdbcTemplate jdbcTemplate,
                                   @Value("${wechat.subscribe.template-wish:}") String wishTemplate,
                                   @Value("${wechat.subscribe.template-meal:}") String mealTemplate,
                                   @Value("${wechat.subscribe.miniprogram-state:formal}") String miniprogramState) {
        this.wechatClient = wechatClient;
        this.jdbcTemplate = jdbcTemplate;
        this.restClient = RestClient.create();
        this.miniprogramState = miniprogramState == null || miniprogramState.isBlank()
                ? "formal" : miniprogramState.trim();

        Map<String, String> configured = new LinkedHashMap<>();
        putIfPresent(configured, KIND_WISH, wishTemplate);
        putIfPresent(configured, KIND_MEAL, mealTemplate);
        this.templates = Map.copyOf(configured);

        // 单线程 + 有界队列：家庭事件频次极低，一条线程足够；守线程池也避免影响应用退出
        ThreadPoolExecutor pool = new ThreadPoolExecutor(
                1, 1, 0L, TimeUnit.MILLISECONDS,
                new ArrayBlockingQueue<>(500),
                runnable -> {
                    Thread thread = new Thread(runnable, "subscribe-message");
                    thread.setDaemon(true);
                    return thread;
                },
                new ThreadPoolExecutor.DiscardPolicy() // 队列积压时丢弃，绝不反压业务线程
        );
        this.sender = pool;

        if (this.templates.isEmpty()) {
            log.info("SubscribeMessage disabled: no template id configured "
                    + "(set WECHAT_SUBSCRIBE_TEMPLATE_WISH / WECHAT_SUBSCRIBE_TEMPLATE_MEAL to enable)");
        } else {
            log.info("SubscribeMessage enabled for kinds={} miniprogramState={}", this.templates.keySet(), this.miniprogramState);
        }
    }

    @PreDestroy
    void shutdown() {
        sender.shutdown();
    }

    /** 是否配置了至少一个模板。false 时前端不显示"消息通知"开关。 */
    public boolean available() {
        return !templates.isEmpty();
    }

    /** 下发给前端的模板 ID（客户端调 wx.requestSubscribeMessage 需要它）。 */
    public Map<String, String> templateIds() {
        return templates;
    }

    /** 读取订阅设置：功能是否可用 + 用户自己的开关 + 模板 ID。 */
    public SubscribeSetting setting(long userId) {
        return new SubscribeSetting(available(), userEnabled(userId), templates);
    }

    /** 更新用户的订阅开关，返回更新后的设置（前端据此回填 UI，不再自己猜状态）。 */
    public SubscribeSetting updateEnabled(long userId, boolean enabled) {
        jdbcTemplate.update(
                "UPDATE user_account SET subscribe_enabled = ? WHERE id = ?",
                enabled ? 1 : 0, userId
        );
        return setting(userId);
    }

    /**
     * 异步推送一条订阅消息。三种情况会直接跳过：该事件没配模板 / 用户关掉了通知开关 / 用户没有真实 openid。
     * 本方法永不抛异常——调用方是业务主流程。
     *
     * @param userId   接收者
     * @param kind     {@link #KIND_WISH} / {@link #KIND_MEAL}
     * @param subject  第一行（对应 thing1，会被截到 20 字）
     * @param detail   第二行（对应 thing2，会被截到 20 字）
     * @param page     点击消息跳转的页面路径，空则不跳转
     */
    public void sendAsync(long userId, String kind, String subject, String detail, String page) {
        if (!templates.containsKey(kind)) {
            return;
        }
        try {
            sender.execute(() -> send(userId, kind, subject, detail, page));
        } catch (Exception ex) {
            // execute 本身可能因线程池已关闭而抛出；推送不能影响业务
            log.debug("SubscribeMessage submit skipped: {}", ex.getMessage());
        }
    }

    private void send(long userId, String kind, String subject, String detail, String page) {
        try {
            if (!wechatClient.configured() || !userEnabled(userId)) {
                return;
            }
            String openid = wechatClient.realOpenid(userId);
            if (openid == null) {
                return; // 游客等自造 openid 发不出去
            }

            Map<String, Object> data = new LinkedHashMap<>();
            data.put(FIELD_SUBJECT, Map.of("value", clip(subject)));
            data.put(FIELD_DETAIL, Map.of("value", clip(detail)));

            Map<String, Object> body = new LinkedHashMap<>();
            body.put("touser", openid);
            body.put("template_id", templates.get(kind));
            body.put("miniprogram_state", miniprogramState);
            body.put("lang", "zh_CN");
            body.put("data", data);
            if (page != null && !page.isBlank()) {
                body.put("page", page);
            }

            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri("https://api.weixin.qq.com/cgi-bin/message/subscribe/send?access_token="
                            + wechatClient.accessToken())
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(body)
                    .retrieve()
                    .body(Map.class);

            int code = response != null && response.get("errcode") instanceof Number n ? n.intValue() : -1;
            if (code == 0) {
                log.debug("SubscribeMessage sent: user={} kind={}", userId, kind);
            } else if (code == ERRCODE_NO_QUOTA) {
                // 用户没订阅、或这次用完就没了：正常现象，前端会在用户点击时再补授权
                log.info("SubscribeMessage skipped (user not subscribed): user={} kind={}", userId, kind);
            } else {
                // 47003 常是模板字段名对不上；40003 是 openid 无效。都要能一眼看出来
                log.warn("SubscribeMessage failed: user={} kind={} errcode={} errmsg={}",
                        userId, kind, code, response == null ? "empty response" : response.get("errmsg"));
            }
        } catch (Exception ex) {
            // 推送是旁路：网络异常、模板被删、token 取不到，都不允许影响业务
            log.warn("SubscribeMessage error: user={} kind={} {}", userId, kind, ex.getMessage());
        }
    }

    /** 用户是否在设置里打开了通知开关（默认关：不打扰是默认值）。 */
    private boolean userEnabled(long userId) {
        Boolean enabled = jdbcTemplate.query(
                "SELECT subscribe_enabled FROM user_account WHERE id = ?",
                rs -> rs.next() ? rs.getBoolean("subscribe_enabled") : null,
                userId
        );
        return Boolean.TRUE.equals(enabled);
    }

    /** 截到微信 thing 字段允许的长度，超长补省略号（宁可少显示，也不能被判参数不合法）。 */
    private static String clip(String text) {
        String value = text == null ? "" : text.trim();
        return value.length() <= THING_MAX ? value : value.substring(0, THING_MAX - 1) + "…";
    }

    private static void putIfPresent(Map<String, String> target, String kind, String templateId) {
        if (templateId != null && !templateId.isBlank()) {
            target.put(kind, templateId.trim());
        }
    }
}
