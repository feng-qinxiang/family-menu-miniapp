package com.familymenu.daily;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.familymenu.daily.config.UploadSigner;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;

import java.nio.charset.StandardCharsets;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * 上传文件签名访问。
 *
 * 覆盖两条最容易出事的性质：
 *   1) 没签名 / 篡改签名的 /uploads 地址读不到图（家庭实拍不再"拿到链接就能永久看"）；
 *   2) 服务端响应里的图片地址确实被签好了（漏签会让小程序端整片图裂）。
 * 以及三档策略本身：prod 缺 secret 必须启动失败，本地缺 secret 必须完全不影响。
 */
@SpringBootTest
@AutoConfigureMockMvc
@TestPropertySource(properties = {
        "upload.access-secret=test-upload-secret",
        "upload.link-ttl-seconds=604800",
        "upload.dir=target/test-uploads"
})
class UploadSignedAccessTests {

    @Autowired
    private MockMvc mockMvc;

    @Autowired
    private ObjectMapper objectMapper;

    @Autowired
    private UploadSigner signer;

    @Autowired
    private JdbcTemplate jdbcTemplate;

    /** 只放文件头，内容本身不是完整图片：上传只校验 magic bytes。 */
    private static final byte[] PNG_HEAD = new byte[]{
            (byte) 0x89, 'P', 'N', 'G', 0x0D, 0x0A, 0x1A, 0x0A,
            0, 0, 0, 13, 'I', 'H', 'D', 'R'
    };

    private String uploadPng() throws Exception {
        MvcResult result = mockMvc.perform(multipart("/api/upload")
                        .file(new MockMultipartFile("file", "shot.png", "image/png", PNG_HEAD))
                        .header("X-Auth-Token", guestToken()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("url").asText();
    }

    private String guestToken() throws Exception {
        MvcResult result = mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/auth/guest")
                        .header("X-Device-Id", "upload-sign-" + System.nanoTime()))
                .andExpect(status().isOk())
                .andReturn();
        return objectMapper.readTree(result.getResponse().getContentAsString()).get("token").asText();
    }

    @Test
    void apiResponsesCarrySignedUploadUrlsAndUnsignedAccessIsRejected() throws Exception {
        assertThat(signer.enabled()).as("配了 secret 应启用签名").isTrue();

        String signed = uploadPng();
        assertThat(signed).as("响应里的图片地址应已带签名参数").contains("?e=").contains("&k=");

        mockMvc.perform(get(signed)).andExpect(status().isOk());

        String unsigned = signed.substring(0, signed.indexOf('?'));
        mockMvc.perform(get(unsigned))
                .andExpect(status().isForbidden())
                .andExpect(org.springframework.test.web.servlet.result.MockMvcResultMatchers
                        .jsonPath("$.error").isNotEmpty());

        // 篡改签名：换掉最后一个字符
        String tampered = signed.substring(0, signed.length() - 1)
                + (signed.endsWith("a") ? "b" : "a");
        mockMvc.perform(get(tampered)).andExpect(status().isForbidden());

        // 签名与路径绑定：拿合法签名去换另一个文件名，必须拒（拦截器先于资源解析，所以是 403 不是 404）
        String exp = signed.substring(signed.indexOf("e=") + 2, signed.indexOf('&'));
        String sig = signed.substring(signed.lastIndexOf('=') + 1);
        mockMvc.perform(get("/uploads/0000000000000000000000000000000f.png?e=" + exp + "&k=" + sig))
                .andExpect(status().isForbidden());
    }

    @Test
    void expiredLinksAreRejected() throws Exception {
        UploadSigner shortLived = new UploadSigner("k", 1, "");
        String url = shortLived.sign("/uploads/whatever.png");
        String path = url.substring(0, url.indexOf('?'));
        String exp = url.substring(url.indexOf("e=") + 2, url.indexOf('&'));
        String sig = url.substring(url.lastIndexOf('=') + 1);

        assertThat(shortLived.accepts(path, exp, sig)).as("刚签好的链接应可用").isTrue();
        // 用过去的时间戳重放同一签名：必须拒（防"签一次永久有效"）
        assertThat(shortLived.accepts(path, String.valueOf(Long.parseLong(exp) - 10), sig)).isFalse();
        assertThat(shortLived.accepts("/uploads/other.png", exp, sig)).as("签名与路径绑定").isFalse();
        assertThat(shortLived.accepts(path, "not-a-number", sig)).isFalse();
        assertThat(shortLived.accepts(path, exp, null)).isFalse();
    }

    @Test
    void prodWithoutSecretFailsFastAndDevWithoutSecretStaysOpen() {
        assertThatThrownBy(() -> new UploadSigner("", 604800, "prod"))
                .isInstanceOf(IllegalStateException.class)
                .hasMessageContaining("UPLOAD_ACCESS_SECRET");
        assertThatThrownBy(() -> new UploadSigner("  ", 604800, "other,prod"))
                .isInstanceOf(IllegalStateException.class);

        UploadSigner off = new UploadSigner("", 604800, "");
        assertThat(off.enabled()).isFalse();
        assertThat(off.sign("/uploads/a.png")).as("未启用时不改写链接").isEqualTo("/uploads/a.png");
        assertThat(off.accepts("/uploads/a.png", null, null)).as("未启用时不拦本地开发").isTrue();
    }

    /**
     * 小程序会把"看到的图片地址"原样回传（改封面、发帖配图都是这么走的）。
     * 若带签名的链接被写进库，过期后图片就永久 404，且签名会在反复编辑中叠加。
     */
    @Test
    void signedUrlPostedBackByClientIsStoredWithoutSignature() throws Exception {
        String signed = uploadPng();
        assertThat(signed).contains("?e=").contains("&k=");
        String token = guestToken();
        String title = "签名回传用例-" + System.nanoTime();

        mockMvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                        .post("/api/recipes")
                        .header("X-Auth-Token", token)
                        .contentType(org.springframework.http.MediaType.APPLICATION_JSON)
                        .content("{\"title\":\"" + title + "\",\"cuisine\":\"家常\","
                                + "\"tasteTags\":[\"测试\"],\"coverImage\":\"" + signed + "\","
                                + "\"ingredients\":[{\"name\":\"豆腐\",\"amount\":\"1\",\"unit\":\"盒\"}],"
                                + "\"steps\":[{\"text\":\"一步\"}]}"))
                .andExpect(status().isOk());

        String stored = jdbcTemplate.queryForObject(
                "SELECT cover_image FROM recipe WHERE title = ?", String.class, title);
        assertThat(stored).as("库里必须存裸路径，否则签名一过期图就永久裂")
                .doesNotContain("?e=").doesNotContain("k=");

        long recipeId = jdbcTemplate.queryForObject("SELECT id FROM recipe WHERE title = ?", Long.class, title);
        MvcResult read = mockMvc.perform(get("/api/recipes/" + recipeId).header("X-Auth-Token", token))
                .andExpect(status().isOk())
                .andReturn();
        JsonNode detail = objectMapper.readTree(read.getResponse().getContentAsString());
        assertThat(detail.get("coverImage").asText())
                .as("读出来时要重新签名，展示侧不受影响").contains("?e=").contains("&k=");
    }

    @Test
    void nonUploadPathsAreLeftAlone() {
        String asset = "/assets/dishes/tomato-egg.jpg";
        assertThat(signer.sign(asset)).isEqualTo(asset);
        assertThat(new String(PNG_HEAD, StandardCharsets.ISO_8859_1)).isNotEmpty();
    }
}
