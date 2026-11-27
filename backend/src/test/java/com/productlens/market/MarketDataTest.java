package com.productlens.market;

import com.productlens.catalog.Catalog.Stock;
import org.junit.jupiter.api.Test;
import static org.assertj.core.api.Assertions.assertThat;

class MarketDataTest {
    private final MarketData market = new MarketData();
    private final Stock stock = new Stock("KR:KOSPI:004370", "004370", "농심", "Nongshim",
            "KR", "KOSPI", "KRW", "", "");

    @Test
    void aggregatesFiveMinuteBarsWithoutChangingVolumeOrClosingPrice() {
        var minutes = market.candles(stock, "1m", "1D");
        var groups = market.candles(stock, "5m", "1D");
        var quote = market.quote(stock);
        var days = market.candles(stock, "1d", "1M");
        assertThat(groups).hasSize(78);
        assertThat(groups.getFirst().open()).isEqualByComparingTo(minutes.getFirst().open());
        assertThat(groups.getLast().close()).isEqualByComparingTo(quote.price());
        assertThat(groups.stream().mapToLong(MarketData.Candle::volume).sum()).isEqualTo(quote.cumulativeVolume());
        assertThat(days.getLast().close()).isEqualByComparingTo(quote.price());
        assertThat(days.get(days.size() - 2).close()).isEqualByComparingTo(quote.previousClose());
        assertThat(quote.feedMode()).isEqualTo("REPLAY");
    }
}
