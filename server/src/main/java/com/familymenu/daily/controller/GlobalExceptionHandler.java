package com.familymenu.daily.controller;

import jakarta.servlet.http.HttpServletRequest;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.dao.EmptyResultDataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

import java.util.Map;

@RestControllerAdvice
public class GlobalExceptionHandler {

    private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

    @ExceptionHandler(ResponseStatusException.class)
    public ResponseEntity<Map<String, String>> handleStatus(ResponseStatusException ex) {
        return ResponseEntity.status(ex.getStatusCode())
                .body(Map.of("error", ex.getReason() != null ? ex.getReason() : "error"));
    }

    @ExceptionHandler(MethodArgumentNotValidException.class)
    public ResponseEntity<Map<String, String>> handleValidation(MethodArgumentNotValidException ex) {
        String message = ex.getBindingResult().getFieldErrors().stream()
                .map(fe -> fe.getField() + " " + fe.getDefaultMessage())
                .findFirst()
                .orElse("参数校验失败");
        return ResponseEntity.badRequest().body(Map.of("error", message));
    }

    @ExceptionHandler(IllegalArgumentException.class)
    public ResponseEntity<Map<String, String>> handleIllegalArgument(IllegalArgumentException ex) {
        String msg = ex.getMessage() == null || ex.getMessage().isBlank() ? "请求参数不合法" : ex.getMessage();
        return ResponseEntity.badRequest().body(Map.of("error", msg));
    }

    /**
     * 代码里的 IllegalStateException 全是内部失败（"insert failed, no generated key: <SQL>"、
     * "wechat access_token failed: <微信原文>"、"WechatPay not configured"……），
     * 原样回给客户端等于把 SQL 和第三方报错贴到用户脸上。消息只进日志，响应固定文案。
     */
    @ExceptionHandler(IllegalStateException.class)
    public ResponseEntity<Map<String, String>> handleIllegalState(IllegalStateException ex,
                                                                  HttpServletRequest request) {
        log.warn("illegal state on {} {}: {}", request.getMethod(), request.getRequestURI(), ex.getMessage());
        return ResponseEntity.status(HttpStatus.CONFLICT).body(Map.of("error", "当前状态无法继续，请稍后重试"));
    }

    @ExceptionHandler(HttpMessageNotReadableException.class)
    public ResponseEntity<Map<String, String>> handleNotReadable(HttpMessageNotReadableException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "请求体格式有误"));
    }

    @ExceptionHandler(EmptyResultDataAccessException.class)
    public ResponseEntity<Map<String, String>> handleNotFound(EmptyResultDataAccessException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "资源不存在"));
    }

    @ExceptionHandler(NoResourceFoundException.class)
    public ResponseEntity<Map<String, String>> handleNoResource(NoResourceFoundException ex) {
        return ResponseEntity.status(HttpStatus.NOT_FOUND)
                .body(Map.of("error", "接口不存在"));
    }

    /**
     * 唯一键冲突。只记「哪个接口撞了」，不记 {@code ex.getMessage()}：
     * Spring 的 DataAccessException 消息里带着失败 SQL 和 MySQL 原文，而 MySQL 的
     * {@code Duplicate entry 'xxx' for key 'user_account.uk_user_phone'} 里 xxx 就是
     * 冲突的那个值——手机号、openid、邀请码都会从这里进日志。
     * 定位用 URI 足够（每个唯一键只属于一个接口），排查需要细节时看代码不看日志。
     */
    @ExceptionHandler(DuplicateKeyException.class)
    public ResponseEntity<Map<String, String>> handleDuplicateKey(DuplicateKeyException ex,
                                                                  HttpServletRequest request) {
        log.warn("duplicate key on {} {}", request.getMethod(), request.getRequestURI());
        return ResponseEntity.status(HttpStatus.CONFLICT)
                .body(Map.of("error", "记录已存在，请勿重复操作"));
    }

    @ExceptionHandler(DataIntegrityViolationException.class)
    public ResponseEntity<Map<String, String>> handleDataIntegrity(DataIntegrityViolationException ex,
                                                                   HttpServletRequest request) {
        // 同上：这条消息同样会带出用户填的冲突值
        log.warn("data integrity violation on {} {}", request.getMethod(), request.getRequestURI());
        return ResponseEntity.badRequest()
                .body(Map.of("error", "数据不符合要求"));
    }

    @ExceptionHandler(MethodArgumentTypeMismatchException.class)
    public ResponseEntity<Map<String, String>> handleTypeMismatch(MethodArgumentTypeMismatchException ex) {
        return ResponseEntity.badRequest()
                .body(Map.of("error", "参数格式有误"));
    }

    /** 方法用错（例如对只支持 POST 的接口发 GET）应返回 405，而不是"服务器内部错误"。 */
    @ExceptionHandler(org.springframework.web.HttpRequestMethodNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMethodNotSupported(
            org.springframework.web.HttpRequestMethodNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.METHOD_NOT_ALLOWED)
                .body(Map.of("error", "请求方法不支持"));
    }

    /** 内容类型不对（例如给 JSON 接口发 text/plain）是客户端问题：415，且不该在日志里记成 ERROR。 */
    @ExceptionHandler(org.springframework.web.HttpMediaTypeNotSupportedException.class)
    public ResponseEntity<Map<String, String>> handleMediaTypeNotSupported(
            org.springframework.web.HttpMediaTypeNotSupportedException ex) {
        return ResponseEntity.status(HttpStatus.UNSUPPORTED_MEDIA_TYPE)
                .body(Map.of("error", "请求内容类型不支持"));
    }

    /** 上传超过 20MB：413（真机拍图很容易撞到，报"服务器内部错误"会让用户重试同一张图）。 */
    @ExceptionHandler(org.springframework.web.multipart.MaxUploadSizeExceededException.class)
    public ResponseEntity<Map<String, String>> handleUploadTooLarge(
            org.springframework.web.multipart.MaxUploadSizeExceededException ex) {
        return ResponseEntity.status(HttpStatus.PAYLOAD_TOO_LARGE)
                .body(Map.of("error", "文件过大，请压缩后重试"));
    }

    /** 上传接口收到不是 multipart 的请求：400，不是 500（实测 JSON 打 /api/upload 曾报"服务器内部错误"）。 */
    @ExceptionHandler(org.springframework.web.multipart.MultipartException.class)
    public ResponseEntity<Map<String, String>> handleMultipart(
            org.springframework.web.multipart.MultipartException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "请上传文件"));
    }

    /**
     * multipart 里没有名为 file 的 part：同样是客户端问题，400。
     *
     * 它继承的是 ServletException（不是 MultipartException），所以上面那个处理器接不住，
     * 以前会一路掉到最后的兜底里 —— 用户看到"服务器内部错误"，日志里多一条 ERROR 堆栈。
     * 字段名写错、旧版客户端、提交了空表单都会走到这里。
     */
    @ExceptionHandler(org.springframework.web.multipart.support.MissingServletRequestPartException.class)
    public ResponseEntity<Map<String, String>> handleMissingPart(
            org.springframework.web.multipart.support.MissingServletRequestPartException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "请上传文件"));
    }

    /** 缺必填 query 参数（如邀请码为空）：400，不是 500。 */
    @ExceptionHandler(org.springframework.web.bind.MissingServletRequestParameterException.class)
    public ResponseEntity<Map<String, String>> handleMissingParam(
            org.springframework.web.bind.MissingServletRequestParameterException ex) {
        return ResponseEntity.badRequest().body(Map.of("error", "缺少必填参数：" + ex.getParameterName()));
    }

    @ExceptionHandler(Exception.class)
    public ResponseEntity<Map<String, String>> handleGeneric(Exception ex) {
        log.error("服务器开小差了，请稍后重试", ex);
        return ResponseEntity.status(HttpStatus.INTERNAL_SERVER_ERROR)
                .body(Map.of("error", "服务器内部错误"));
    }
}
