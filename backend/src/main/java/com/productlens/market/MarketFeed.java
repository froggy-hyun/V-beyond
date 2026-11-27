package com.productlens.market;

import com.productlens.catalog.Catalog.Stock;
import java.util.List;

interface MarketFeed {
    MarketData.Quote quote(Stock stock);
    List<MarketData.Candle> candles(Stock stock, String interval, String range);
    String mode();
}
