package com.familymenu.daily.config;

import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/**
 * 出站 HTTP 客户端的统一构造点：只为一件事——**必须有超时**。
 *
 * 为什么不让各处直接 {@code RestClient.create()}：那是不带任何超时的默认值，
 * 而本项目所有出站调用都指向 api.weixin.qq.com（内容机审、access_token、code2session）。
 * 微信侧一慢，线程就永久挂在 socket 上：发帖要串行调最多 7 次（1 次文本 + 最多 6 张图），
 * 而 {@code WechatClient.accessToken()} 还整段在 {@code synchronized} 里，
 * 一个卡住的 token 请求会把所有并发发帖一起拖死，直到 Tomcat 线程耗尽 —— 全站不可用。
 * 加了超时以后最坏情况变成「这一次机审失败 → 内容进人工队列」，是可接受的降级。
 */
public final class WechatHttp {

    /** 建连：正常握手 <1s，3s 覆盖跨境抖动。 */
    private static final int CONNECT_TIMEOUT_MILLIS = 3_000;

    /** 读取：msgSecCheck 官方建议 5s 内返回，留 8s 余量。 */
    private static final int READ_TIMEOUT_MILLIS = 8_000;

    private WechatHttp() {
    }

    public static RestClient create() {
        SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
        factory.setConnectTimeout(CONNECT_TIMEOUT_MILLIS);
        factory.setReadTimeout(READ_TIMEOUT_MILLIS);
        return RestClient.builder().requestFactory(factory).build();
    }
}
