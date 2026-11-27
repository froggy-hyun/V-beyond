package com.productlens.market;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.Set;

final class MarketHours {
    static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    static final ZoneId NEW_YORK = ZoneId.of("America/New_York");
    private static final Set<String> US_HOLIDAYS = Set.of(
            "2026-01-01", "2026-01-19", "2026-02-16", "2026-04-03", "2026-05-25",
            "2026-06-19", "2026-07-03", "2026-09-07", "2026-11-26", "2026-12-25",
            "2027-01-01", "2027-01-18", "2027-02-15", "2027-03-26", "2027-05-31",
            "2027-06-18", "2027-07-05", "2027-09-06", "2027-11-25", "2027-12-24",
            "2028-01-17", "2028-02-21", "2028-04-14", "2028-05-29",
            "2028-06-19", "2028-07-04", "2028-09-04", "2028-11-23", "2028-12-25");
    private static final Set<String> US_EARLY_CLOSES = Set.of(
            "2026-11-27", "2026-12-24", "2027-11-26", "2028-07-03", "2028-11-24");

    record Window(Instant open, Instant close) {
        boolean trading(Instant time) { return !time.isBefore(open) && time.isBefore(close); }
        boolean includesBar(Instant time) { return !time.isBefore(open) && !time.isAfter(close); }
    }

    static ZoneId zone(String market) { return market.equals("KR") ? SEOUL : NEW_YORK; }

    static Window window(String market, LocalDate date) {
        if (date.getDayOfWeek().getValue() > 5) return null;
        if (market.equals("KR")) {
            if (date.equals(LocalDate.of(2026, 11, 19))) {
                return window(date, SEOUL, LocalTime.of(10, 0), LocalTime.of(16, 30));
            }
            boolean delayedOpening = date.equals(LocalDate.of(2026, 1, 2));
            return window(date, SEOUL, LocalTime.of(delayedOpening ? 10 : 9, 0), LocalTime.of(15, 30));
        }
        if (US_HOLIDAYS.contains(date.toString())) return null;
        return window(date, NEW_YORK, LocalTime.of(9, 30),
                LocalTime.of(US_EARLY_CLOSES.contains(date.toString()) ? 13 : 16, 0));
    }

    static boolean knownUsSchedule(LocalDate date) {
        return date.getYear() >= 2026 && date.getYear() <= 2028;
    }

    private static Window window(LocalDate date, ZoneId zone, LocalTime open, LocalTime close) {
        return new Window(date.atTime(open).atZone(zone).toInstant(), date.atTime(close).atZone(zone).toInstant());
    }

    private MarketHours() {}
}
