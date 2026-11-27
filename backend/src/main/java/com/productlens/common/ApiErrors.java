package com.productlens.common;

import java.util.Map;
import java.util.UUID;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.http.HttpStatus;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.method.annotation.HandlerMethodValidationException;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.http.converter.HttpMessageNotReadableException;

@RestControllerAdvice
class ApiErrors {
    @ExceptionHandler(ResponseStatusException.class)
    ResponseEntity<Map<String, String>> status(ResponseStatusException error) {
        return ResponseEntity.status(error.getStatusCode()).body(body("HTTP_" + error.getStatusCode().value(), error.getReason()));
    }

    @ResponseStatus(HttpStatus.BAD_REQUEST)
    @ExceptionHandler({MethodArgumentNotValidException.class, HandlerMethodValidationException.class,
            MethodArgumentTypeMismatchException.class, MissingServletRequestParameterException.class,
            HttpMessageNotReadableException.class})
    Map<String, String> invalid() { return body("INVALID_INPUT", "입력하신 내용을 확인해 주세요."); }

    private Map<String, String> body(String code, String message) {
        return Map.of("code", code, "message", message == null ? "요청을 처리할 수 없습니다." : message,
                "requestId", UUID.randomUUID().toString());
    }
}
