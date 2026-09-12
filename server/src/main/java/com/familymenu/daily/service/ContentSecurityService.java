package com.familymenu.daily.service;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClient;
import org.springframework.web.server.ResponseStatusException;

import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Map;

/**
 * UGC 内容安全校验（微信 msgSecCheck v2 / imgSecCheck，见小程序内容安全规范）。
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

    /** imgSecCheck 单图上限 1MB（微信接口硬限制），超过按"无法机审"转人工队列 */
    private static final long MAX_IMAGE_BYTES = 1024 * 1024;

    /** imgSecCheck 判定违规的错误码 */
    private static final int ERRCODE_IMAGE_RISK = 87014;

    /** 微信凭据与 access_token 统一从这里取（全站只有一份 token 缓存，见 WechatClient） */
    private final WechatClient wechatClient;
    private final RestClient restClient;
    private final Path uploadRoot;

    public ContentSecurityService(WechatClient wechatClient,
                                  @Value("${upload.dir:uploads}") String uploadDir) {
        this.wechatClient = wechatClient;
        this.restClient = RestClient.create();
        this.uploadRoot = Paths.get(uploadDir).toAbsolutePath().normalize();
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

    /**
     * 审核帖子配图（微信 imgSecCheck 同步版，单图 ≤1MB）。
     * 与 {@link #auditStatus} 同语义：通过 → APPROVED；违规 → 抛 400；无法机审 → PENDING。
     *
     * 只审本站 uploads 目录里的文件：URL 里取不到 /uploads/ 文件名、名字含可疑字符、
     * 文件不存在或超过 1MB，一律视为"无法机审"转人工，绝不直接放行。
     */
    public String auditImage(long userId, String imageUrl) {
        if (imageUrl == null || imageUrl.isBlank()) {
            return STATUS_APPROVED;
        }
        if (!wechatClient.configured()) {
            log.info("ContentSecurity image not configured: queued for manual review");
            return STATUS_PENDING;
        }
        byte[] bytes = readUploadedImage(imageUrl);
        if (bytes == null) {
            log.info("ContentSecurity image unreadable ({}), queued for manual review", imageUrl);
            return STATUS_PENDING;
        }
        if (bytes.length > MAX_IMAGE_BYTES) {
            log.info("ContentSecurity image too large ({} bytes), queued for manual review", bytes.length);
            return STATUS_PENDING;
        }
        try {
            String token = wechatClient.accessToken();
            @SuppressWarnings("unchecked")
            Map<String, Object> response = restClient.post()
                    .uri("https://api.weixin.qq.com/wxa/img_sec_check?access_token=" + token)
                    .contentType(MediaType.APPLICATION_OCTET_STREAM)
                    .body(bytes)
                    .retrieve()
                    .body(Map.class);
            Object errcode = response == null ? null : response.get("errcode");
            int code = errcode instanceof Number n ? n.intValue() : 0;
            if (code == ERRCODE_IMAGE_RISK) {
                log.info("ContentSecurity image reject: user={} image={}", userId, imageUrl);
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "图片涉嫌违规，请更换后再发布");
            }
            if (code != 0) {
                log.warn("ContentSecurity image errcode={}, queued for manual review", code);
                return STATUS_PENDING;
            }
            return STATUS_APPROVED;
        } catch (ResponseStatusException ex) {
            throw ex;
        } catch (Exception ex) {
            log.warn("ContentSecurity image check failed ({}), queued for manual review", ex.getMessage());
            return STATUS_PENDING;
        }
    }

    /** 从图片 URL 解出 uploads 目录内的文件并读取；不合法/读不到返回 null（调用方按无法机审处理）。 */
    private byte[] readUploadedImage(String imageUrl) {
        try {
            String marker = "/uploads/";
            int idx = imageUrl.lastIndexOf(marker);
            if (idx < 0) {
                return null;
            }
            String name = imageUrl.substring(idx + marker.length());
            // 白名单字符防路径穿越与外链；UUID 文件名天然满足
            if (!name.matches("[A-Za-z0-9._-]+")) {
                return null;
            }
            Path file = uploadRoot.resolve(name).normalize();
            if (!file.startsWith(uploadRoot) || !Files.isRegularFile(file)) {
                return null;
            }
            return Files.readAllBytes(file);
        } catch (Exception ex) {
            return null;
        }
    }
}
