package com.productlens.market;

import com.productlens.catalog.Catalog.Stock;
import java.time.LocalDate;
import java.util.List;

interface MarketFeed {
    MarketData.Quote quote(Stock stock);
    List<MarketData.Candle> candles(Stock stock, String interval, String range);
    default List<MarketData.IndexQuote> indices(String market) { return List.of(); }
    default MarketHours.Schedule schedule(String market, LocalDate date) { return MarketHours.schedule(market, date, null); }
    String mode();
}
