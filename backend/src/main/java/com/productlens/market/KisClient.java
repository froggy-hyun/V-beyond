package com.productlens.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;
import org.springframework.web.util.UriComponentsBuilder;

@Component
@ConditionalOnProperty(name = "lens.market.mode", havingValue = "KIS")
class KisClient {
    static final String DOMESTIC = "/uapi/domestic-stock/v1/quotations/";
    static final String OVERSEAS = "/uapi/overseas-price/v1/quotations/";
    private static final org.slf4j.Logger log = LoggerFactory.getLogger(KisClient.class);
    private static final String BASE = "https://openapi.koreainvestment.com:9443";
    private static final Duration TIMEOUT = Duration.ofSeconds(5);
    private final HttpClient http = HttpClient.newBuilder().connectTimeout(TIMEOUT).version(HttpClient.Version.HTTP_1_1).build();
    private final ObjectMapper json;
    private final String key;
    private final String secret;
    private Token cached;
    private Instant nextAuthentication = Instant.EPOCH;
    private Instant nextRequest = Instant.EPOCH;

    private record Token(String value, Instant expiresAt) {}

    KisClient(ObjectMapper json, @Value("${KIS_APP_KEY:}") String key, @Value("${KIS_APP_SECRET:}") String secret) {
        if (key.isBlank() || secret.isBlank()) throw new IllegalStateException("KIS 시세 인증 설정 누락");
        this.json = json;
        this.key = key;
        this.secret = secret;
    }

    JsonNode query(String path, String transaction, Map<String, String> params) {
        String access = token();
        var uri = UriComponentsBuilder.fromUriString(BASE + path);
        params.forEach(uri::queryParam);
        var request = HttpRequest.newBuilder(uri.build().encode().toUri())
                .header("authorization", "Bearer " + access).header("appkey", key).header("appsecret", secret)
                .header("tr_id", transaction).header("custtype", "P").header("tr_cont", "").GET();
        var response = send(request);
        if (!"0".equals(response.path("rt_cd").asText())) {
            var code = response.path("msg_cd").asText();
            log.debug("KIS 조회 응답 오류 {} {}", transaction, code.matches("[A-Za-z0-9]{1,16}") ? code : "UNKNOWN");
            throw new Unavailable();
        }
        return response;
    }

    private synchronized String token() {
        var now = Instant.now();
        if (cached != null && now.isBefore(cached.expiresAt().minusSeconds(60))) return cached.value();
        if (now.isBefore(nextAuthentication)) throw new Unavailable();
        nextAuthentication = now.plusSeconds(60);
        try {
            String payload = json.writeValueAsString(Map.of("grant_type", "client_credentials",
                    "appkey", key, "appsecret", secret));
            var data = send(HttpRequest.newBuilder(URI.create(BASE + "/oauth2/tokenP"))
                    .header("content-type", "application/json").POST(HttpRequest.BodyPublishers.ofString(payload)));
            var access = data.path("access_token").asText();
            if (access.isBlank()) throw new Unavailable();
            var expiry = data.path("access_token_token_expired").asText();
            Instant expiresAt = expiry.isBlank() ? now.plusSeconds(data.path("expires_in").asLong(3600))
                    : LocalDateTime.parse(expiry, DateTimeFormatter.ofPattern("uuuu-MM-dd HH:mm:ss"))
                            .atZone(ZoneId.of("Asia/Seoul")).toInstant();
            cached = new Token(access, expiresAt);
            return access;
        } catch (IOException | java.time.DateTimeException error) {
            throw new Unavailable();
        }
    }

    private JsonNode send(HttpRequest.Builder request) {
        try {
            pace();
            var response = http.send(request.timeout(TIMEOUT).build(), HttpResponse.BodyHandlers.ofString());
            if (response.statusCode() != 200) {
                log.debug("KIS HTTP 오류 {}", response.statusCode());
                throw new Unavailable();
            }
            return json.readTree(response.body());
        } catch (InterruptedException error) {
            Thread.currentThread().interrupt();
            throw new Unavailable();
        } catch (IOException error) {
            throw new Unavailable();
        }
    }

    private synchronized void pace() throws InterruptedException {
        // 방문자와 시세 작업이 하나의 호출 한도를 공유
        var wait = Duration.between(Instant.now(), nextRequest);
        if (wait.isPositive()) Thread.sleep(wait);
        nextRequest = Instant.now().plusMillis(1050);
    }

    static class Unavailable extends RuntimeException {}
}
