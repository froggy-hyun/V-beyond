package com.productlens.market;

import com.productlens.catalog.Catalog.Stock;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import org.springframework.stereotype.Component;

@Component
class MarketData {
    record Quote(String listingId, BigDecimal price, BigDecimal previousClose, BigDecimal change,
                 BigDecimal changePercent, long cumulativeVolume, String currency, Instant exchangeTimestamp,
                 String feedMode, String freshness, String session, String source) {}
    record Candle(Instant startAt, BigDecimal open, BigDecimal high, BigDecimal low,
                  BigDecimal close, long volume) {}

    static final Instant DAY = Instant.parse("2026-01-05T00:00:00Z");
    private static final Map<String, Integer> SAMPLE_PRICES = Map.of(
            "004370", 406500, "007310", 386000, "003230", 1189000, "017810", 12420,
            "NWL", 6, "WSM", 191, "CPB", 33, "GIS", 48, "KO", 69, "PEP", 143);

    Quote quote(Stock stock) {
        var bars = candles(stock, "1m", "1D");
        var last = bars.getLast();
        var previous = previousClose(stock);
        var change = last.close().subtract(previous);
        var percentage = change.movePointRight(2).divide(previous, 2, RoundingMode.HALF_UP);
        return new Quote(stock.id(), last.close(), previous, change, percentage,
                bars.stream().mapToLong(Candle::volume).sum(), stock.currency(), last.startAt(),
                "REPLAY", "FRESH", "CLOSED", "Product Lens 데모");
    }

    List<Candle> candles(Stock stock, String interval, String range) {
        double opening = opening(stock);
        if (interval.equals("1d")) return daily(stock, opening, range);
        Instant start = DAY.plusSeconds(stock.market().equals("KR") ? 0 : 14 * 3600 + 30 * 60);
        var bars = generate(stock, start, 390, 60, opening, 0.0008, "intraday");
        if (interval.equals("1m")) return bars;
        List<Candle> aggregate = new ArrayList<>();
        for (int i = 0; i < bars.size(); i += 5) {
            var group = bars.subList(i, Math.min(i + 5, bars.size()));
            aggregate.add(new Candle(group.getFirst().startAt(), group.getFirst().open(),
                    group.stream().map(Candle::high).max(BigDecimal::compareTo).orElseThrow(),
                    group.stream().map(Candle::low).min(BigDecimal::compareTo).orElseThrow(),
                    group.getLast().close(), group.stream().mapToLong(Candle::volume).sum()));
        }
        return aggregate;
    }

    private List<Candle> daily(Stock stock, double opening, String range) {
        int count = switch (range) { case "1M" -> 22; case "3M" -> 66; default -> 260; };
        var intraday = candles(stock, "1m", "1D");
        var days = new ArrayList<Candle>();
        days.add(new Candle(DAY, intraday.getFirst().open(),
                intraday.stream().map(Candle::high).max(BigDecimal::compareTo).orElseThrow(),
                intraday.stream().map(Candle::low).min(BigDecimal::compareTo).orElseThrow(),
                intraday.getLast().close(), intraday.stream().mapToLong(Candle::volume).sum()));
        var date = DAY.atZone(java.time.ZoneOffset.UTC).toLocalDate();
        var random = new Random((stock.id() + "daily").hashCode());
        var close = previousClose(stock);
        for (int i = 1; i < count; i++) {
            do { date = date.minusDays(1); } while (date.getDayOfWeek().getValue() > 5);
            var open = price(stock, close.doubleValue() + (random.nextDouble() - 0.5) * opening * 0.024);
            var high = price(stock, open.max(close).doubleValue() + random.nextDouble() * opening * 0.007);
            var low = price(stock, open.min(close).doubleValue() - random.nextDouble() * opening * 0.007);
            days.add(new Candle(date.atStartOfDay(java.time.ZoneOffset.UTC).toInstant(),
                    open, high, low, close, random.nextInt(24000, 150000)));
            close = open;
        }
        java.util.Collections.reverse(days);
        return days;
    }

    private List<Candle> generate(Stock stock, Instant start, int count, long step, double base, double volatility, String seed) {
        var random = new Random((stock.id() + seed).hashCode());
        var bars = new ArrayList<Candle>(count);
        double open = base;
        for (int i = 0; i < count; i++) {
            double close = open + (random.nextDouble() - 0.49) * base * volatility;
            bars.add(new Candle(start.plusSeconds(step * i), price(stock, open),
                    price(stock, Math.max(open, close) + random.nextDouble() * base * volatility / 2),
                    price(stock, Math.min(open, close) - random.nextDouble() * base * volatility / 2),
                    price(stock, close), random.nextInt(18, 980)));
            open = close;
        }
        return bars;
    }

    private BigDecimal previousClose(Stock stock) { return price(stock, opening(stock) * 0.997); }

    private double opening(Stock stock) { return SAMPLE_PRICES.get(stock.symbol()); }
    private BigDecimal price(Stock stock, double value) {
        return BigDecimal.valueOf(value).setScale(stock.currency().equals("KRW") ? 0 : 2, RoundingMode.HALF_UP);
    }
}
