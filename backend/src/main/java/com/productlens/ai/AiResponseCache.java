package com.productlens.ai;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Duration;
import java.time.Instant;
import java.util.HexFormat;
import java.util.Optional;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.dao.DataAccessException;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
public class AiResponseCache {
    public record Hit<T>(T value, Instant expiresAt) {}
    private record Stored(String response, Instant expiresAt) {}
    private final JdbcClient db;
    private final ObjectMapper json;
    private final String model;

    AiResponseCache(JdbcClient db, ObjectMapper json, @Value("${OPENAI_MODEL:gpt-4.1-mini}") String model) {
        this.db = db;
        this.json = json;
        this.model = model;
    }

    public String key(String scope, String input) {
        try {
            var data = String.join("\n", scope, model, input).getBytes(StandardCharsets.UTF_8);
            return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(data));
        } catch (NoSuchAlgorithmException error) {
            throw new IllegalStateException(error);
        }
    }

    public <T> Optional<Hit<T>> read(String key, Class<T> type) {
        try {
            var row = db.sql("""
                    SELECT response, expires_at FROM ai_response_cache
                    WHERE cache_key = :key AND expires_at > CURRENT_TIMESTAMP
                    """).param("key", key)
                    .query((result, index) -> new Stored(result.getString(1), result.getTimestamp(2).toInstant())).optional();
            if (row.isEmpty()) return Optional.empty();
            var stored = row.get();
            return Optional.of(new Hit<>(json.readValue(stored.response(), type), stored.expiresAt()));
        } catch (DataAccessException | JsonProcessingException error) {
            return Optional.empty();
        }
    }

    public void save(String key, Object response, Duration lifetime) {
        try {
            db.sql("DELETE FROM ai_response_cache WHERE expires_at <= CURRENT_TIMESTAMP").update();
            db.sql("""
                    INSERT INTO ai_response_cache (cache_key, response, expires_at)
                    VALUES (:key, CAST(:response AS jsonb), CURRENT_TIMESTAMP + :seconds * interval '1 second')
                    ON CONFLICT (cache_key) DO UPDATE SET response = EXCLUDED.response, expires_at = EXCLUDED.expires_at
                    """).param("key", key).param("response", json.writeValueAsString(response))
                    .param("seconds", lifetime.toSeconds()).update();
        } catch (DataAccessException | JsonProcessingException error) {
            // 캐시 저장에 실패해도 생성된 응답은 반환
        }
    }
}
