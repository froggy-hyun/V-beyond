package com.productlens.market;

import com.fasterxml.jackson.databind.JsonNode;
import com.productlens.catalog.Catalog;
import com.productlens.catalog.Catalog.Stock;
import com.productlens.market.MarketData.Candle;
import com.productlens.market.MarketData.Quote;
import jakarta.annotation.PreDestroy;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DateTimeException;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.Executors;
import java.util.concurrent.Semaphore;
import java.util.concurrent.TimeUnit;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;
import org.springframework.web.server.ResponseStatusException;

@Component
@ConditionalOnProperty(name = "lens.market.mode", havingValue = "KIS")
class KisMarketFeed implements MarketFeed {
    private static final org.slf4j.Logger log = LoggerFactory.getLogger(KisMarketFeed.class);
    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    static final ZoneId NEW_YORK = ZoneId.of("America/New_York");
    static final DateTimeFormatter DATE = DateTimeFormatter.BASIC_ISO_DATE;
    static final DateTimeFormatter TIME = DateTimeFormatter.ofPattern("HHmmss");
    static final DateTimeFormatter CURSOR = DateTimeFormatter.ofPattern("uuuuMMddHHmmss");
    private final Catalog catalog;
    private final KisClient kis;
    private final Map<String, Quote> quotes = new ConcurrentHashMap<>();
    private final Map<ChartKey, Chart> charts = new ConcurrentHashMap<>();
    private volatile Instant refreshUntil = Instant.now().plusSeconds(90);
    private final Semaphore chartSlots = new Semaphore(2);
    private final java.util.concurrent.ScheduledExecutorService poller = Executors.newSingleThreadScheduledExecutor();

    private record ChartKey(String listingId, String range) {}
    private record Chart(List<Candle> bars, Instant refreshedAt) {}
    private record Fields(String date, String time, String open, String high, String low, String close, String volume) {}
    private static final Fields KR_MINUTE = new Fields("stck_bsop_date", "stck_cntg_hour", "stck_oprc", "stck_hgpr", "stck_lwpr", "stck_prpr", "cntg_vol");
    private static final Fields KR_DAILY = new Fields("stck_bsop_date", "", "stck_oprc", "stck_hgpr", "stck_lwpr", "stck_clpr", "acml_vol");
    private static final Fields US_MINUTE = new Fields("xymd", "xhms", "open", "high", "low", "last", "evol");
    private static final Fields US_DAILY = new Fields("xymd", "", "open", "high", "low", "clos", "tvol");

    KisMarketFeed(Catalog catalog, KisClient kis) {
        this.catalog = catalog;
        this.kis = kis;
    }

    @EventListener(ApplicationReadyEvent.class)
    void start() {
        poller.scheduleWithFixedDelay(this::refreshQuotes, 0, 10, TimeUnit.SECONDS);
    }

    @PreDestroy void stop() { poller.shutdownNow(); }

    @Override public String mode() { return "KIS_REST"; }

    @Override public Quote quote(Stock stock) {
        refreshUntil = Instant.now().plusSeconds(90);
        var quote = quotes.get(stock.id());
        if (quote == null) {
            return new Quote(stock.id(), null, null, null, null, 0, stock.currency(),
                    null, null, mode(), "UNAVAILABLE", "UNKNOWN", "한국투자증권");
        }
        if (quote.receivedAt().isAfter(Instant.now().minusSeconds(50))) return quote;
        return new Quote(quote.listingId(), quote.price(), quote.previousClose(), quote.change(), quote.changePercent(),
                quote.cumulativeVolume(), quote.currency(), null, quote.receivedAt(), mode(), "STALE", "UNKNOWN", quote.source());
    }

    private void refreshQuotes() {
        if (Instant.now().isAfter(refreshUntil)) return;
        try {
            for (var stock : catalog.stocks("")) {
                try { quotes.put(stock.id(), fetchQuote(stock)); }
                catch (KisClient.Unavailable | IllegalArgumentException error) {
                    log.debug("KIS 현재가 조회 실패 {} {}", stock.id(), error.getClass().getSimpleName());
                }
            }
        } catch (org.springframework.dao.DataAccessException ignored) {
            // 카탈로그 연결이 회복되면 다음 조회 주기에서 재시도
        }
    }

    private Quote fetchQuote(Stock stock) {
        boolean domestic = stock.market().equals("KR");
        var fields = domestic ? kis.query(KisClient.DOMESTIC + "inquire-price", "FHKST01010100", domestic(stock))
                : kis.query(KisClient.OVERSEAS + "price", "HHDFS00000300", overseas(stock));
        var data = fields.path("output");
        var price = decimal(data, domestic ? "stck_prpr" : "last");
        if (price.signum() <= 0) throw new KisClient.Unavailable();
        String reference = data.path(domestic ? "stck_sdpr" : "base").asText().trim();
        var previous = reference.isEmpty() ? null : new BigDecimal(reference);
        if (domestic) {
            int direction = switch (data.path("prdy_vrss_sign").asText()) {
                case "1", "2" -> 1;
                case "3" -> 0;
                case "4", "5" -> -1;
                default -> 0;
            };
            var rawChange = data.path("prdy_vrss").asText();
            if (!rawChange.isBlank() && !data.path("prdy_vrss_sign").asText().isBlank()) {
                previous = price.subtract(new BigDecimal(rawChange.trim()).abs().multiply(BigDecimal.valueOf(direction)));
            }
        }
        var change = previous != null && previous.signum() > 0 ? price.subtract(previous) : null;
        var rate = change != null ? change.movePointRight(2).divide(previous, 2, RoundingMode.HALF_UP) : null;
        long volume = data.path(domestic ? "acml_vol" : "tvol").asLong();
        // 현재가 REST 응답의 조회 시각과 실제 체결 시각 구분
        return new Quote(stock.id(), price, previous, change, rate, volume, stock.currency(), null, Instant.now(),
                mode(), "FRESH", "UNKNOWN", "한국투자증권");
    }

    @Override public List<Candle> candles(Stock stock, String interval, String range) {
        var key = new ChartKey(stock.id(), range);
        var cached = charts.get(key);
        var ttl = range.equals("1D") ? Duration.ofSeconds(55) : Duration.ofMinutes(10);
        if (fresh(cached, ttl)) return interval(cached.bars(), interval);
        if (!chartSlots.tryAcquire()) {
            if (cached != null) return interval(cached.bars(), interval);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "시세 조회 중입니다. 잠시 뒤 다시 시도하세요.");
        }
        try {
            var chart = charts.compute(key, (ignored, current) -> {
                if (fresh(current, ttl)) return current;
                List<Candle> result = range.equals("1D") ? intraday(stock) : daily(stock, range);
                return new Chart(result, Instant.now());
            });
            return interval(chart.bars(), interval);
        } catch (KisClient.Unavailable | IllegalArgumentException | DateTimeException error) {
            log.debug("KIS 차트 조회 실패 {} {} {}", stock.id(), range, error.getClass().getSimpleName());
            if (cached != null) return interval(cached.bars(), interval);
            throw new ResponseStatusException(HttpStatus.SERVICE_UNAVAILABLE, "KIS 차트를 일시적으로 불러올 수 없습니다.");
        } finally {
            chartSlots.release();
        }
    }

    private static boolean fresh(Chart chart, Duration ttl) {
        return chart != null && chart.refreshedAt().plus(ttl).isAfter(Instant.now());
    }

    private static List<Candle> interval(List<Candle> bars, String interval) {
        return interval.equals("5m") ? MarketData.fiveMinuteBars(bars) : bars;
    }

    private List<Candle> intraday(Stock stock) {
        return stock.market().equals("KR") ? domesticIntraday(stock) : overseasIntraday(stock);
    }

    private List<Candle> domesticIntraday(Stock stock) {
        var now = LocalDateTime.now(SEOUL);
        var recent = queryWith(domestic(stock), KisClient.DOMESTIC + "inquire-daily-itemchartprice", "FHKST03010100",
                "FID_INPUT_DATE_1", DATE.format(now.minusDays(14)), "FID_INPUT_DATE_2", DATE.format(now),
                "FID_PERIOD_DIV_CODE", "D", "FID_ORG_ADJ_PRC", "1").path("output2");
        var date = java.util.stream.StreamSupport.stream(recent.spliterator(), false)
                .map(row -> row.path(KR_DAILY.date()).asText()).filter(value -> !value.isBlank())
                .map(value -> LocalDate.parse(value, DATE)).max(LocalDate::compareTo).orElse(null);
        if (date == null) return List.of();
        var cursor = date.equals(now.toLocalDate()) ? TIME.format(now) : "235959";
        var bars = new TreeMap<Instant, Candle>();
        for (int i = 0; i < 5; i++) {
            var oldest = bars.isEmpty() ? Instant.MAX : bars.firstKey();
            var page = queryWith(domestic(stock), KisClient.DOMESTIC + "inquire-time-dailychartprice", "FHKST03010230",
                    "FID_INPUT_DATE_1", DATE.format(date), "FID_INPUT_HOUR_1", cursor,
                    "FID_PW_DATA_INCU_YN", "N", "FID_FAKE_TICK_INCU_YN", "N").path("output2");
            collect(bars, page, KR_MINUTE, SEOUL, date, date);
            if (page.size() < 120 || bars.isEmpty() || !bars.firstKey().isBefore(oldest)) break;
            var earlier = bars.firstKey().atZone(SEOUL).minusSeconds(1);
            if (!earlier.toLocalDate().equals(date)) break;
            cursor = TIME.format(earlier);
        }
        return List.copyOf(bars.values());
    }

    private List<Candle> overseasIntraday(Stock stock) {
        var bars = new TreeMap<Instant, Candle>();
        var cursor = "";
        LocalDate date = null;
        for (int i = 0; i < 9; i++) {
            var reply = queryWith(overseas(stock), KisClient.OVERSEAS + "inquire-time-itemchartprice", "HHDFS76950200",
                    "NMIN", "1", "PINC", "1", "NREC", "120", "FILL", "", "NEXT", i == 0 ? "" : "1", "KEYB", cursor);
            var page = reply.path("output2");
            if (page.isEmpty()) break;
            if (date == null) date = LocalDate.parse(page.get(0).path(US_MINUTE.date()).asText(), DATE);
            var oldest = bars.isEmpty() ? Instant.MAX : bars.firstKey();
            collect(bars, page, US_MINUTE, NEW_YORK, date, date);
            if (bars.isEmpty() || !bars.firstKey().isBefore(oldest)) break;
            var time = bars.firstKey().atZone(NEW_YORK).minusMinutes(1);
            if (!time.toLocalDate().equals(date)
                    || !date.equals(LocalDate.parse(page.get(page.size() - 1).path(US_MINUTE.date()).asText(), DATE))) break;
            cursor = CURSOR.format(time);
        }
        return List.copyOf(bars.values());
    }

    private List<Candle> daily(Stock stock, String range) {
        boolean domestic = stock.market().equals("KR");
        var zone = domestic ? SEOUL : NEW_YORK;
        var end = LocalDate.now(zone);
        var start = end.minusMonths(switch (range) { case "1M" -> 1; case "3M" -> 3; default -> 12; });
        var bars = new TreeMap<Instant, Candle>();
        for (int i = 0; i < 4 && !end.isBefore(start); i++) {
            var reply = domestic
                    ? queryWith(domestic(stock), KisClient.DOMESTIC + "inquire-daily-itemchartprice", "FHKST03010100",
                            "FID_INPUT_DATE_1", DATE.format(start), "FID_INPUT_DATE_2", DATE.format(end),
                            "FID_PERIOD_DIV_CODE", "D", "FID_ORG_ADJ_PRC", "1")
                    : queryWith(overseas(stock), KisClient.OVERSEAS + "dailyprice", "HHDFS76240000",
                            "GUBN", "0", "BYMD", DATE.format(end), "MODP", "0");
            var oldest = bars.isEmpty() ? Instant.MAX : bars.firstKey();
            collect(bars, reply.path("output2"), domestic ? KR_DAILY : US_DAILY, zone, start, end);
            if (bars.isEmpty() || !bars.firstKey().isBefore(oldest)) break;
            end = bars.firstKey().atZone(ZoneOffset.UTC).toLocalDate().minusDays(1);
        }
        return List.copyOf(bars.values());
    }

    private static void collect(TreeMap<Instant, Candle> bars, JsonNode page, Fields fields, ZoneId zone,
                                LocalDate from, LocalDate to) {
        for (var row : page) {
            String sessionDate = row.path(fields.date()).asText();
            if (sessionDate.isBlank() || row.path(fields.close()).asText().isBlank()) continue;
            var date = LocalDate.parse(sessionDate, DATE);
            if (date.isBefore(from) || date.isAfter(to)) continue;
            var time = fields.time().isEmpty() ? date.atStartOfDay(ZoneOffset.UTC).toInstant()
                    : LocalDateTime.parse(sessionDate + row.path(fields.time()).asText(), CURSOR).atZone(zone).toInstant();
            var close = decimal(row, fields.close());
            if (close.signum() <= 0) continue;
            bars.put(time, new Candle(time, decimal(row, fields.open()), decimal(row, fields.high()),
                    decimal(row, fields.low()), close, row.path(fields.volume()).asLong()));
        }
    }

    private JsonNode queryWith(Map<String, String> params, String path, String transaction, String... extra) {
        var query = new HashMap<>(params);
        for (int i = 0; i < extra.length; i += 2) query.put(extra[i], extra[i + 1]);
        return kis.query(path, transaction, query);
    }

    private static Map<String, String> domestic(Stock stock) {
        return Map.of("FID_COND_MRKT_DIV_CODE", "J", "FID_INPUT_ISCD", stock.symbol());
    }

    private static Map<String, String> overseas(Stock stock) {
        return Map.of("AUTH", "", "EXCD", stock.exchange().equals("NASDAQ") ? "NAS" : "NYS", "SYMB", stock.symbol());
    }

    private static BigDecimal decimal(JsonNode data, String field) {
        return new BigDecimal(data.path(field).asText().trim());
    }
}
