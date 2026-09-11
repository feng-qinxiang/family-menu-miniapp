package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.util.Map;

/**
 * UGC 内容安全校验（微信 msgSecCheck v2，见小程序内容安全规范）。
 *
 * 社区发帖/评论前调用，机器审核 + 站内举报审核队列（人工）构成双重机制。
 * 返回的 audit_status 决定内容是否立即可见：
 *  - 机审通过 → APPROVED，立即公开
 *  - 违规 → 抛 400 拒绝发布
 *  - 无法机审（凭据未配置 / 伪 openid 如 guest-、phone-、invite- / 微信接口异常）→ PENDING
 *    （进人工审核队列，作者本人可见，其他人看不到，管理员在 /admin 通过或下架）
 *
 * 注意：无法机审时不能放行。小程序以游客体验为主，多数作者没有真实微信 openid，
 * 一旦放行就等于 UGC 无审核直接公开。
 */
@Service
public class ContentSecurityService {

    private static final Logger log = LoggerFactory.getLogger(ContentSecurityService.class);

    /** 内容审核状态：通过 / 待人工审核（与 community_post.audit_status 取值一致） */
    public static final String STATUS_APPROVED = "APPROVED";
    public static final String STATUS_PENDING = "PENDING";

    /** msgSecCheck 场景值：2=评论，3=论坛发帖 */
    public static final int SCENE_COMMENT = 2;
    public static final int SCENE_FORUM = 3;

    /** msgSecCheck 单次内容上限 2500 字，超长取前段（标题+正文拼接一般不会超） */
    private static final int MAX_CONTENT_LENGTH = 2500;

    /** 微信凭据与 access_token 统一从这里取（全站只有一份 token 缓存，见 WechatClient） */
    private final WechatClient wechatClient;
    private final RestClient restClient;

    public ContentSecurityService(WechatClient wechatClient) {
        this.wechatClient = wechatClient;
        this.restClient = RestClient.create();
    }

    /**
     * 审核 UGC 文本，返回应写入的 audit_status。
     *
     * 返回 {@link #STATUS_APPROVED}：机审通过，可立即公开。
     * 返回 {@link #STATUS_PENDING}：无法机审（未配凭据 / 作者无真实微信 openid / 微信接口异常），
     *                              转人工审核队列，暂不对他人可见（作者本人可见自己的内容）。
     * 抛 400：机审判定违规。
     *
     * 关键：无法机审时一律转 PENDING，而不是"放行"。
     * 放行等于 UGC 无审核直接公开，既让"违规拒发"的承诺落空，也是微信审核驳回的常见原因。
     *
     * @param userId  发布者（查库取 openid）
     * @param content 待检文本
     * @param scene   SCENE_COMMENT / SCENE_FORUM
     */
    public String auditStatus(long userId, String content, int scene) {
        if (content == null || content.isBlank()) {
            return STATUS_APPROVED;
        }
        if (!wechatClient.configured()) {
            log.info("ContentSecurity not configured: content queued for manual review");
            return STATUS_PENDING;
        }
        String openid = wechatClient.realOpenid(userId);
        if (openid == null) {
            log.info("ContentSecurity skip: user {} has no real wechat openid, queued for manual review", userId);
            return STATUS_PENDING;
        }
        String text = content.length() > MAX_CONTENT_LENGTH ? content.substring(0, MAX_CONTENT_LENGTH) : content;
        try {
            String token = wechatClient.accessToken();
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri("https://api.weixin.qq.com/wxa/msg_sec_check?access_token=" + token)
                    .contentType(MediaType.APPLICATION_JSON)
                    .body(Map.of(
                            "version", 2,
                            "openid", openid,
                            "scene", scene,
                            "content", text
                    ))
                    .retrieve()
                    .body(Map.class);
            if (response == null) {
                log.warn("ContentSecurity: empty msgSecCheck response, queued for manual review");
                return STATUS_PENDING;
            }
            Object errcode = response.get("errcode");
            int code = errcode instanceof Number n ? n.intValue() : 0;
            if (code != 0) {
                // 61010=openid 超两小时不活跃，无法机审；其余错误码同样转人工审核
                log.warn("ContentSecurity: msgSecCheck errcode={} errmsg={}, queued for manual review",
                        code, response.get("errmsg"));
                return STATUS_PENDING;
            }
            Object result = response.get("result");
            String suggest = result instanceof Map<?, ?> m && m.get("suggest") != null
                    ? m.get("suggest").toString() : "pass";
            if (!"pass".equals(suggest)) {
                log.info("ContentSecurity reject: user={} scene={} suggest={}", userId, scene, suggest);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "内容涉嫌违规，请修改后再发布");
            }
            return STATUS_APPROVED;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            // 网络等异常：转人工审核，不阻断发布也不直接公开
            log.warn("ContentSecurity: check failed ({}), queued for manual review", ex.getMessage());
            return STATUS_PENDING;
        }
    }
}
