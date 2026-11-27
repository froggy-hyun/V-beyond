package com.productlens.catalog;

import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.List;
import java.util.Map;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

@Component
class ProductMarketData {
    record QuarterSales(String quarter, String periodEnd, long amount, String source, String note) {}
    record Segment(String name, String scope, String currency, List<QuarterSales> quarters) {}
    record MarketQuarter(String quarter, long total) {}
    record Brand(String name, String stockId, String productId, List<Long> amounts) {}
    record RetailMarket(String name, String region, Catalog.Category category, String scope, String source,
                        List<MarketQuarter> quarters, List<Brand> brands) {}
    record Book(Map<String, List<Segment>> segments, List<RetailMarket> markets) {}
    record Overview(String status, String source, List<Segment> segments, List<RetailMarket> markets) {}

    private final Book book;

    ProductMarketData(ObjectMapper json) throws IOException {
        try (var file = new ClassPathResource("catalog/product-market.json").getInputStream()) {
            book = json.readValue(file, Book.class);
        }
    }

    Overview overview(Catalog.Stock stock, List<Catalog.Product> products) {
        var segments = book.segments().getOrDefault(stock.id(), List.of());
        var markets = book.markets().stream().filter(market -> market.region().equals(stock.market())
                && market.brands().stream().anyMatch(brand -> brand.stockId().equals(stock.id()))
                && products.stream().anyMatch(product -> product.category() == market.category())).toList();
        return new Overview(segments.isEmpty() && markets.isEmpty() ? "UNAVAILABLE" : "AVAILABLE",
                stock.source(), segments, markets);
    }
}
