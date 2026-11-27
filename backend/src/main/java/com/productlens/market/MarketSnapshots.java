package com.productlens.market;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.List;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "lens.market.mode", havingValue = "KIS")
class MarketSnapshots {
    private final JdbcClient jdbc;
    private final ObjectMapper json;

    record Snapshot(String instrument, String series, Instant observedAt, String payload) {}

    MarketSnapshots(JdbcClient jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    List<Snapshot> load() {
        return jdbc.sql("SELECT instrument_id, series, observed_at, payload FROM market_snapshots")
                .query((row, index) -> new Snapshot(row.getString(1), row.getString(2),
                        row.getObject(3, OffsetDateTime.class).toInstant(), row.getString(4))).list();
    }

    <T> T decode(String payload, TypeReference<T> type) {
        try { return json.readValue(payload, type); }
        catch (JsonProcessingException error) { throw new IllegalArgumentException("시세 저장 형식 확인 필요", error); }
    }

    void save(String instrument, String series, Instant observedAt, Object value) {
        final String payload;
        try { payload = json.writeValueAsString(value); }
        catch (JsonProcessingException error) { throw new IllegalArgumentException("시세 저장 형식 확인 필요", error); }
        jdbc.sql("""
                INSERT INTO market_snapshots (instrument_id, series, observed_at, payload)
                VALUES (:instrument, :series, :observedAt, CAST(:payload AS jsonb))
                ON CONFLICT (instrument_id, series) DO UPDATE
                  SET observed_at = excluded.observed_at, payload = excluded.payload
                  WHERE excluded.observed_at >= market_snapshots.observed_at
                """).param("instrument", instrument).param("series", series)
                .param("observedAt", observedAt.atOffset(ZoneOffset.UTC)).param("payload", payload).update();
    }
}
