package com.familymenu.daily.config;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ArrayNode;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.fasterxml.jackson.databind.node.TextNode;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.MethodParameter;
import org.springframework.http.converter.HttpMessageConverter;
import org.springframework.http.converter.json.MappingJackson2HttpMessageConverter;
import org.springframework.stereotype.Component;
import org.springframework.web.bind.annotation.ControllerAdvice;
import org.springframework.web.servlet.mvc.method.annotation.ResponseBodyAdvice;
import org.springframework.http.server.ServerHttpRequest;
import org.springframework.http.server.ServerHttpResponse;
import org.springframework.web.servlet.HandlerInterceptor;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.MessageDigest;
import java.time.Instant;
import java.util.Locale;

/**
 * 上传文件的访问签名。
 *
 * 为什么需要：菜谱封面、做菜步骤图、头像、社区配图都是家庭实拍，落库后就是一个
 * 公开可访问的 {@code /uploads/xxx} 静态地址，任何人拿到链接就能长期看图，
 * 而且删号/下架也删不掉别人手里的 URL。UUID 文件名只能防"猜"，防不了"传"。
 *
 * 为什么不用归属鉴权：社区帖子的配图天然要跨用户可见，按上传者判断会直接把信息流打黑。
 * 所以走签名链接——服务端在响应里给每个 {@code /uploads/} 路径签上 {@code e}(过期秒) 与
 * {@code k}(HMAC)，读取时校验，过期或篡改即 403。
 *
 * 三档策略（避免"半开"状态）：
 *   - 配了 secret：签名 + 强制校验（生产形态）。
 *   - 没配 secret 且 profile=prod：启动直接失败，逼部署方显式决策。
 *   - 没配 secret 且非 prod（本地开发）：整体关闭，零配置可用。
 */
@Component
public class UploadSigner {

    private static final String PREFIX = "/uploads/";

    private final Mac mac;
    private final long ttlSeconds;

    public UploadSigner(@Value("${upload.access-secret:}") String secret,
                        @Value("${upload.link-ttl-seconds:604800}") long ttlSeconds,
                        @Value("${spring.profiles.active:}") String activeProfiles) {
        this.ttlSeconds = ttlSeconds <= 0 ? 604800 : ttlSeconds;
        boolean prod = false;
        for (String p : activeProfiles.split(",")) {
            if ("prod".equalsIgnoreCase(p.trim())) {
                prod = true;
            }
        }
        if (secret == null || secret.isBlank()) {
            if (prod) {
                throw new IllegalStateException(
                        "生产环境必须设置 UPLOAD_ACCESS_SECRET：否则 /uploads/** 仍是任何人可访问的公开链接。"
                        + "本地开发留空即可（会自动关闭签名，不影响调试）。");
            }
            this.mac = null;
            return;
        }
        try {
            Mac created = Mac.getInstance("HmacSHA256");
            created.init(new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
            this.mac = created;
        } catch (GeneralSecurityException ex) {
            throw new IllegalStateException("HMAC 初始化失败", ex);
        }
    }

    /** 签名功能是否启用（未启用时既不签名也不拦截）。 */
    public boolean enabled() {
        return mac != null;
    }

    /** 给站内上传路径追加签名参数；非上传路径原样返回。 */
    public String sign(String url) {
        if (!enabled() || url == null || !url.startsWith(PREFIX) || url.contains("k=")) {
            return url;
        }
        long exp = Instant.now().getEpochSecond() + ttlSeconds;
        return url + (url.indexOf('?') >= 0 ? "&" : "?") + "e=" + exp + "&k=" + signature(url, exp);
    }

    /** 校验：路径 + 过期秒 + 签名三者对得上才放行。 */
    public boolean accepts(String path, String expRaw, String sig) {
        if (!enabled()) {
            return true;
        }
        if (path == null || !path.startsWith(PREFIX) || expRaw == null || sig == null) {
            return false;
        }
        long exp;
        try {
            exp = Long.parseLong(expRaw);
        } catch (NumberFormatException ex) {
            return false;
        }
        if (Instant.now().getEpochSecond() > exp) {
            return false;
        }
        // 常量时间比较，避免用签名前缀逐字节试探
        return MessageDigest.isEqual(signature(path, exp).getBytes(StandardCharsets.UTF_8),
                sig.getBytes(StandardCharsets.UTF_8));
    }

    /** Mac 非线程安全，统一加锁；签名对象是"路径|过期秒"，换路径或改有效期都会失配。 */
    private synchronized String signature(String path, long exp) {
        String base = pathOf(path) + "|" + exp;
        byte[] raw = mac.doFinal(base.getBytes(StandardCharsets.UTF_8));
        StringBuilder hex = new StringBuilder(raw.length * 2);
        for (byte b : raw) {
            hex.append(String.format(Locale.ROOT, "%02x", b));
        }
        return hex.toString();
    }

    private static String pathOf(String url) {
        int q = url.indexOf('?');
        return q < 0 ? url : url.substring(0, q);
    }

    /** /uploads/** 的读取闸门。 */
    @Component
    public static class AccessInterceptor implements HandlerInterceptor {

        private final UploadSigner signer;

        public AccessInterceptor(UploadSigner signer) {
            this.signer = signer;
        }

        @Override
        public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler)
                throws IOException {
            if (!signer.enabled()) {
                return true;
            }
            if (signer.accepts(request.getRequestURI(), request.getParameter("e"), request.getParameter("k"))) {
                return true;
            }
            response.setStatus(HttpServletResponse.SC_FORBIDDEN);
            response.setContentType("application/json;charset=UTF-8");
            response.getWriter().write("{\"error\":\"图片链接已失效，请重新打开页面\"}");
            return false;
        }
    }

    /**
     * 在 JSON 响应出网前，把所有 {@code /uploads/} 字符串换成带签名的链接。
     * 放在这一层而不是逐个 DTO 里改：图片路径散落在菜谱封面、步骤图、头像、帖子配图、
     * 反馈截图等多处，逐处改写必然漏。
     */
    @ControllerAdvice
    public static class UrlSigningAdvice implements ResponseBodyAdvice<Object> {

        private final UploadSigner signer;
        private final ObjectMapper objectMapper;

        public UrlSigningAdvice(UploadSigner signer, ObjectMapper objectMapper) {
            this.signer = signer;
            this.objectMapper = objectMapper;
        }

        @Override
        public boolean supports(MethodParameter returnType, Class<? extends HttpMessageConverter<?>> converterType) {
            return signer.enabled() && MappingJackson2HttpMessageConverter.class.isAssignableFrom(converterType);
        }

        @Override
        public Object beforeBodyWrite(Object body, MethodParameter returnType,
                                      org.springframework.http.MediaType selectedContentType,
                                      Class<? extends HttpMessageConverter<?>> converterType,
                                      ServerHttpRequest request, ServerHttpResponse response) {
            if (body == null) {
                return null;
            }
            JsonNode tree = objectMapper.valueToTree(body);
            return rewrite(tree) ? tree : body;
        }

        private boolean rewrite(JsonNode node) {
            boolean changed = false;
            if (node instanceof ObjectNode object) {
                var fieldNames = object.fieldNames();
                while (fieldNames.hasNext()) {
                    String name = fieldNames.next();
                    JsonNode child = object.get(name);
                    if (child instanceof TextNode text && text.asText().startsWith(PREFIX)) {
                        object.put(name, signer.sign(text.asText()));
                        changed = true;
                    } else {
                        changed |= rewrite(child);
                    }
                }
            } else if (node instanceof ArrayNode array) {
                for (int i = 0; i < array.size(); i++) {
                    JsonNode child = array.get(i);
                    if (child instanceof TextNode text && text.asText().startsWith(PREFIX)) {
                        array.set(i, TextNode.valueOf(signer.sign(text.asText())));
                        changed = true;
                    } else {
                        changed |= rewrite(child);
                    }
                }
            }
            return changed;
        }
    }
}
