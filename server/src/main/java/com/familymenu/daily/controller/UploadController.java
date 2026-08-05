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

    private static final long MAX_FILE_SIZE = 5 * 1024 * 1024L; // 5MB

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
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "file required");
        }
        if (file.getSize() > MAX_FILE_SIZE) {
            throw new ResponseStatusException(HttpStatus.PAYLOAD_TOO_LARGE, "文件不能超过 5MB");
        }
        String original = file.getOriginalFilename() == null ? "upload.bin" : file.getOriginalFilename();
        String ext = safeExtension(original);
        String stored = UUID.randomUUID().toString().replace("-", "") + ext;
        try {
            Files.createDirectories(uploadDir);
            Path target = uploadDir.resolve(stored).normalize();
            if (!target.startsWith(uploadDir)) {
                throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "invalid file path");
            }
            file.transferTo(target);
        } catch (IOException ex) {
            throw new ResponseStatusException(HttpStatus.INTERNAL_SERVER_ERROR, "upload failed");
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
        if (!ext.matches("\\.(jpg|jpeg|png|webp|gif|bmp|heic)")) {
            return ".bin";
        }
        return ext;
    }
}
