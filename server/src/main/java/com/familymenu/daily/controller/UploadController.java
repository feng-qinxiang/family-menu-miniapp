package com.familymenu.daily.controller;

import com.familymenu.daily.auth.CurrentUser;
import com.familymenu.daily.auth.RequiresAuth;
import com.familymenu.daily.dto.ApiModels.UploadResult;
import com.familymenu.daily.dto.AuthModels.AuthUser;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;
import org.springframework.web.server.ResponseStatusException;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.Paths;
import java.util.Locale;
import java.util.UUID;

@RestController
@RequestMapping("/api")
public class UploadController {

    private static final long MAX_FILE_SIZE = 20 * 1024 * 1024L; // 20MB，短教学视频够用

    private final JdbcTemplate jdbcTemplate;
    private final Path uploadDir;

    public UploadController(JdbcTemplate jdbcTemplate,
                            @Value("${upload.dir:uploads}") String uploadDir) {
        this.jdbcTemplate = jdbcTemplate;
        this.uploadDir = Paths.get(uploadDir).toAbsolutePath().normalize();
    }

    @PostMapping("/upload")
    @RequiresAuth
    public UploadResult upload(@CurrentUser AuthUser user,
                               @RequestParam("file") MultipartFile file) {
        if (file == null || file.isEmpty()) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "请选择要上传的文件");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "文件不能超过 20MB");
        }
        String original = file.getOriginalFilename() == null ? "upload.bin" : file.getOriginalFilename();
        String ext = safeExtension(original);
        if (".bin".equals(ext)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST,
                    "不支持的文件类型（仅支持 jpg/png/webp/gif/bmp/heic/mp4/mov/m4v）");
        }
        // 内容嗅探：扩展名可以被随便改，必须校验真实文件头，避免把任意文件当图片托管
        if (!matchesMagic(file, ext)) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "文件内容与扩展名不符");
        }
        String stored = UUID.randomUUID().toString().replace("-", "") + ext;
        try {
            Files.createDirectories(uploadDir);
            Path target = uploadDir.resolve(stored).normalize();
            if (!target.startsWith(uploadDir)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "文件路径不合法");
            }
            file.transferTo(target);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "文件上传失败，请稍后重试");
        }
        String url = "/uploads/" + stored;
        jdbcTemplate.update("""
                        INSERT INTO uploaded_file(user_id, original_name, stored_name, url, size_bytes)
                        VALUES (?, ?, ?, ?, ?)
                        """,
                user.userId(),
                original,
                stored,
                url,
                file.getSize()
        );
        return new UploadResult(url, stored, file.getSize());
    }

    private String safeExtension(String name) {
        String lower = name.toLowerCase(Locale.ROOT);
        int idx = lower.lastIndexOf('.');
        if (idx < 0) {
            return ".bin";
        }
        String ext = lower.substring(idx);
        if (!ext.matches("\\.(jpg|jpeg|png|webp|gif|bmp|heic|mp4|mov|m4v)")) {
            return ".bin";
        }
        return ext;
    }

    /**
     * 按扩展名校验文件头（magic bytes）。
     * 只信任前 16 字节，不做完整解码 —— 目的是挡住"改扩展名上传任意文件"，
     * 不是做完整的媒体格式校验。
     */
    private boolean matchesMagic(MultipartFile file, String ext) {
        byte[] head = new byte[16];
        int read;
        try (java.io.InputStream in = file.getInputStream()) {
            read = in.readNBytes(head, 0, head.length);
        } catch (IOException ex) {
            return false;
        }
        if (read < 4) {
            return false;
        }
        return switch (ext) {
            case ".jpg", ".jpeg" -> (head[0] & 0xFF) == 0xFF && (head[1] & 0xFF) == 0xD8 && (head[2] & 0xFF) == 0xFF;
            case ".png" -> (head[0] & 0xFF) == 0x89 && head[1] == 'P' && head[2] == 'N' && head[3] == 'G';
            case ".gif" -> head[0] == 'G' && head[1] == 'I' && head[2] == 'F' && head[3] == '8';
            case ".bmp" -> head[0] == 'B' && head[1] == 'M';
            // RIFF....WEBP
            case ".webp" -> head[0] == 'R' && head[1] == 'I' && head[2] == 'F' && head[3] == 'F'
                    && read >= 12 && head[8] == 'W' && head[9] == 'E' && head[10] == 'B' && head[11] == 'P';
            // ISO BMFF：第 4~8 字节为 "ftyp"，brand 含 heic/heix/mif1
            case ".heic" -> read >= 12 && head[4] == 'f' && head[5] == 't' && head[6] == 'y' && head[7] == 'p'
                    && (brandIs(head, "heic") || brandIs(head, "heix") || brandIs(head, "mif1") || brandIs(head, "hevc"));
            // ISO BMFF 视频容器：mp4/mov/m4v 都是 ftyp box
            case ".mp4", ".mov", ".m4v" -> read >= 12 && head[4] == 'f' && head[5] == 't' && head[6] == 'y' && head[7] == 'p';
            default -> false;
        };
    }

    private static boolean brandIs(byte[] head, String brand) {
        for (int i = 0; i < brand.length(); i++) {
            if (head[8 + i] != brand.charAt(i)) {
                return false;
            }
        }
        return true;
    }
}
