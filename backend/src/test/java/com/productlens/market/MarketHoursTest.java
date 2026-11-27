package com.productlens.market;

import java.time.Instant;
import java.time.LocalDate;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class MarketHoursTest {
    @Test
    void respectsUsHolidayEarlyCloseAndDaylightSavingTime() {
        assertThat(MarketHours.window("US", LocalDate.parse("2026-11-26"))).isNull();
        var early = MarketHours.window("US", LocalDate.parse("2026-11-27"));
        assertThat(early.open()).isEqualTo(Instant.parse("2026-11-27T14:30:00Z"));
        assertThat(early.close()).isEqualTo(Instant.parse("2026-11-27T18:00:00Z"));
        assertThat(early.trading(early.close())).isFalse();
        assertThat(early.includesBar(early.close())).isTrue();
        var summer = MarketHours.window("US", LocalDate.parse("2026-06-18"));
        assertThat(summer.open()).isEqualTo(Instant.parse("2026-06-18T13:30:00Z"));
    }

    @Test
    void respectsKoreanWeekendAndDelayedExamSession() {
        assertThat(MarketHours.window("KR", LocalDate.parse("2026-11-28"))).isNull();
        var exam = MarketHours.window("KR", LocalDate.parse("2026-11-19"));
        assertThat(exam.open()).isEqualTo(Instant.parse("2026-11-19T01:00:00Z"));
        assertThat(exam.close()).isEqualTo(Instant.parse("2026-11-19T07:30:00Z"));
        var normal = MarketHours.window("KR", LocalDate.parse("2026-11-27"));
        assertThat(normal.close()).isEqualTo(Instant.parse("2026-11-27T06:30:00Z"));
    }
}
