package com.productlens.market;

import com.productlens.catalog.Catalog;
import jakarta.annotation.PreDestroy;
import jakarta.validation.constraints.Pattern;
import java.io.IOException;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicBoolean;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

@RestController
@RequestMapping("/api/v1/market")
class MarketApi {
    private final Catalog catalog;
    private final MarketData data;
    private final Semaphore connections = new Semaphore(96);
    private final java.util.concurrent.ScheduledExecutorService heartbeat = Executors.newScheduledThreadPool(2);

    MarketApi(Catalog catalog, MarketData data) { this.catalog = catalog; this.data = data; }

    @GetMapping("/quotes")
    List<MarketData.Quote> quotes(@RequestParam List<String> ids) {
        if (ids.isEmpty() || ids.size() > 10) throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "최대 10개 종목을 선택하세요.");
        return ids.stream().distinct().map(catalog::stock).map(data::quote).toList();
    }

    @GetMapping("/stocks/{id}/candles")
    List<MarketData.Candle> candles(@PathVariable String id,
            @RequestParam(defaultValue = "1m") @Pattern(regexp = "1m|5m|1d") String interval,
            @RequestParam(defaultValue = "1D") @Pattern(regexp = "1D|1M|3M|1Y") String range) {
        if (interval.equals("1d") == range.equals("1D")) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "조회 기간과 봉 단위를 확인하세요.");
        }
        return data.candles(catalog.stock(id), interval, range);
    }

    @GetMapping("/sessions")
    Map<String, String> session(@RequestParam @Pattern(regexp = "KR|US") String market, @RequestParam LocalDate date) {
        return Map.of("market", market, "date", date.toString(), "session", "UNKNOWN",
                "timezone", market.equals("KR") ? "Asia/Seoul" : "America/New_York", "feedMode", "REPLAY");
    }

    @GetMapping(path = "/stream", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
    SseEmitter stream(@RequestParam List<String> ids) {
        var initial = quotes(ids);
        if (!connections.tryAcquire()) throw new ResponseStatusException(HttpStatus.TOO_MANY_REQUESTS, "잠시 뒤 다시 연결하세요.");
        var emitter = new SseEmitter(120_000L);
        var pulse = heartbeat.scheduleAtFixedRate(() -> {
            try { emitter.send(SseEmitter.event().name("heartbeat").data("REPLAY")); }
            catch (IOException | IllegalStateException error) { emitter.complete(); }
        }, 15, 15, TimeUnit.SECONDS);
        var released = new AtomicBoolean();
        Runnable finish = () -> {
            if (released.compareAndSet(false, true)) {
                pulse.cancel(false);
                connections.release();
            }
        };
        emitter.onTimeout(finish);
        emitter.onCompletion(finish);
        emitter.onError(error -> finish.run());
        try {
            for (var quote : initial) emitter.send(SseEmitter.event().name("quote").data(quote));
        } catch (IOException error) {
            finish.run();
            emitter.completeWithError(error);
        }
        return emitter;
    }

    @PreDestroy void shutdown() { heartbeat.shutdownNow(); }
}
