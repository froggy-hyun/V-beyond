package com.productlens.catalog;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonInclude;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Arrays;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.simple.JdbcClient;
import org.springframework.stereotype.Service;
import org.springframework.web.server.ResponseStatusException;

@Service
public class Catalog {
    public enum Category {
        RAMEN, FRYING_PAN, CHICKEN_NOODLE_SOUP, COLA, RICE_COOKER, WATER_FILTER, AIR_PURIFIER,
        FROZEN_CHICKEN_NUGGETS, PEANUT_BUTTER, CHOCOLATE, MAC_AND_CHEESE, BEEF_FRANKS;

        public String nutritionBasis() {
            return switch (this) {
                case COLA -> "PER_100ML";
                case FROZEN_CHICKEN_NUGGETS, PEANUT_BUTTER, CHOCOLATE, MAC_AND_CHEESE, BEEF_FRANKS -> "PER_100G";
                default -> "PER_SERVING";
            };
        }
    }
    public enum Criterion {
        SODIUM, TOTAL_SUGAR, ADDED_SUGAR, SATURATED_FAT, CALORIES,
        AVOID_PTFE, AVOID_PFAS, AVOID_ASPARTAME;

        public boolean absence() { return name().startsWith("AVOID_"); }
    }
    public enum Scope { ALL_COMPANIES, SAME_COMPANY, OTHER_COMPANY }
    public record Stock(String id, String symbol, String name, String english, String market, String exchange,
                        String currency, String overview, String source) {}
    public record Fact(Criterion criterion, BigDecimal value, String unit, String basis, String source) {}
    public record Evidence(String title, String summary, String source,
                           @JsonInclude(JsonInclude.Include.NON_NULL) String topic) {}
    @JsonIgnoreProperties(ignoreUnknown = true)
    public record Product(String id, String symbol, String name, String brand, Category category, String market,
                          String relation, String size, String prep, String source, List<Fact> facts,
                          List<Evidence> evidence, String material, String description) {}
    public record Search(List<Stock> stocks, List<Product> products) {}
    public record Alternative(Product product, Stock stock, Fact fact, BigDecimal reductionPercent) {}
    public record Comparison(Stock stock, List<Product> products) {}
    public record Alternatives(Fact baseline, List<Alternative> matches, int excluded) {}
    public record HealthIssue(Criterion criterion, Fact baseline, Alternative alternative, List<Alternative> comparisons) {}
    public record ProductPeer(Product product, Stock stock) {}
    public record HealthComparison(Product product, List<HealthIssue> issues, List<ProductPeer> peers) {}
    private final JdbcClient db;
    private final ObjectMapper json;

    Catalog(JdbcClient db, ObjectMapper json) {
        this.db = db;
        this.json = json;
    }

    public List<Stock> stocks(String market) {
        return db.sql("SELECT * FROM listings WHERE (:market = '' OR market = :market) ORDER BY market, id")
                .param("market", market).query(Stock.class).list();
    }

    public Stock stock(String id) {
        return db.sql("SELECT * FROM listings WHERE id=:id").param("id", id).query(Stock.class).optional()
                .orElseThrow(() -> missing("종목을 찾을 수 없습니다."));
    }

    public List<Product> products(String listing) {
        stock(listing);
        return db.sql("SELECT details FROM products WHERE status='VERIFIED' AND listing_id=:id ORDER BY id")
                .param("id", listing).query((row, index) -> decode(row.getString(1))).list();
    }

    public Product product(String id) {
        return db.sql("SELECT details FROM products WHERE status='VERIFIED' AND id=:id")
                .param("id", id).query((row, index) -> decode(row.getString(1))).optional()
                .orElseThrow(() -> missing("상품을 찾을 수 없습니다."));
    }

    public List<Product> verifiedProducts() {
        return db.sql("SELECT details FROM products WHERE status='VERIFIED' ORDER BY name, id")
                .query((row, index) -> decode(row.getString(1))).list();
    }

    public Stock stockFor(Product product) {
        return db.sql("SELECT * FROM listings WHERE symbol=:symbol AND market=:market")
                .param("symbol", product.symbol()).param("market", product.market()).query(Stock.class).single();
    }

    public Search search(String query) {
        var term = query.strip().toLowerCase(Locale.ROOT);
        if (term.isEmpty()) return new Search(List.of(), List.of());
        var products = db.sql("""
                SELECT details FROM products WHERE status='VERIFIED'
                 AND strpos(lower(name || ' ' || brand), :term) > 0 ORDER BY id
                """).param("term", term).query((row, index) -> decode(row.getString(1))).list();
        var stocks = stocks("").stream().filter(stock ->
                (stock.name() + " " + stock.english() + " " + stock.symbol()).toLowerCase(Locale.ROOT).contains(term)
                || products.stream().anyMatch(item -> item.symbol().equals(stock.symbol()) && item.market().equals(stock.market())))
                .toList();
        return new Search(stocks, products);
    }

    public List<Product> group(Category category, String market) {
        return db.sql("""
                SELECT details FROM products WHERE status='VERIFIED' AND category=:category
                 AND (:market='' OR market=:market) ORDER BY id
                """).param("category", category.name()).param("market", market)
                .query((row, index) -> decode(row.getString(1))).list();
    }

    public List<Stock> competitors(String id) {
        return products(id).stream().flatMap(p -> group(p.category(), p.market()).stream())
                .map(this::stockFor).filter(s -> !s.id().equals(id)).distinct().toList();
    }

    public List<HealthComparison> healthComparisons(String id) {
        var products = products(id);
        var groups = new EnumMap<Category, List<Product>>(Category.class);
        return products.stream().map(origin -> {
            var competitors = groups.computeIfAbsent(origin.category(), category -> group(category, origin.market()).stream()
                    .filter(candidate -> !candidate.symbol().equals(origin.symbol())).toList());
            var criteria = switch (origin.category()) {
                case RAMEN, CHICKEN_NOODLE_SOUP, FROZEN_CHICKEN_NUGGETS, MAC_AND_CHEESE, BEEF_FRANKS -> List.of(Criterion.SODIUM);
                case COLA -> List.of(Criterion.TOTAL_SUGAR, Criterion.AVOID_ASPARTAME);
                case FRYING_PAN -> List.of(Criterion.AVOID_PTFE, Criterion.AVOID_PFAS);
                case PEANUT_BUTTER, CHOCOLATE -> List.of(Criterion.ADDED_SUGAR, Criterion.SATURATED_FAT);
                case RICE_COOKER, WATER_FILTER, AIR_PURIFIER -> List.<Criterion>of();
            };
            var issues = criteria.stream().map(criterion -> healthIssue(origin, competitors, criterion)).toList();
            var peers = competitors.stream().filter(product -> origin.prep().equals(product.prep())).limit(3)
                    .map(product -> new ProductPeer(product, stockFor(product))).toList();
            return new HealthComparison(origin, issues, peers);
        }).toList();
    }

    private HealthIssue healthIssue(Product origin, List<Product> competitors, Criterion criterion) {
        var basis = switch (criterion) {
            case AVOID_ASPARTAME -> "INGREDIENTS";
            case AVOID_PTFE, AVOID_PFAS -> "SURFACE";
            default -> origin.category().nutritionBasis();
        };
        var baseline = origin.facts().stream().filter(fact -> fact.criterion() == criterion && fact.basis().equals(basis))
                .findFirst().orElse(null);
        record Match(Product product, Fact fact) {}
        var comparisons = competitors.stream().filter(product -> origin.prep().equals(product.prep()))
                .flatMap(product -> product.facts().stream().filter(fact -> fact.criterion() == criterion && fact.basis().equals(basis)
                        && (baseline == null || baseline.unit().equals(fact.unit()))).limit(1).map(fact -> new Match(product, fact)))
                .sorted(Comparator.comparing(match -> match.fact().value())).limit(3)
                .map(match -> new Alternative(match.product(), stockFor(match.product()), match.fact(),
                        baseline != null && match.fact().value().compareTo(baseline.value()) < 0
                                ? reduction(baseline, match.fact(), criterion) : null)).toList();
        var best = comparisons.isEmpty() ? null : comparisons.getFirst();
        var alternative = best != null && baseline != null && best.fact().value().compareTo(baseline.value()) < 0 ? best : null;
        return new HealthIssue(criterion, baseline, alternative, comparisons);
    }

    public Alternatives alternatives(String id, Criterion criterion, String basis, Scope scope) {
        Product origin = product(id);
        var candidates = alternativeCandidates(origin, scope);
        var baseline = baseline(origin, criterion, basis);
        var matches = candidates.stream().flatMap(p -> p.facts().stream()
                .filter(f -> matchesAlternative(origin, p, criterion, baseline, f))
                .limit(1).map(f -> new Alternative(p, stockFor(p), f, reduction(baseline, f, criterion))))
                .sorted(Comparator.comparing(row -> row.fact().value())).toList();
        return new Alternatives(baseline, matches, candidates.size() - matches.size());
    }

    public List<Criterion> alternativeCriteria(String id, Scope scope) {
        var origin = product(id);
        var candidates = alternativeCandidates(origin, scope);
        return Arrays.stream(Criterion.values()).filter(criterion -> {
            var baseline = baseline(origin, criterion, criterion.absence() ? "" : origin.category().nutritionBasis());
            return candidates.stream().anyMatch(candidate -> candidate.facts().stream()
                    .anyMatch(fact -> matchesAlternative(origin, candidate, criterion, baseline, fact)));
        }).toList();
    }

    private List<Product> alternativeCandidates(Product origin, Scope scope) {
        return group(origin.category(), origin.market()).stream()
                .filter(product -> !product.id().equals(origin.id()))
                .filter(product -> scope == Scope.ALL_COMPANIES
                        || (scope == Scope.SAME_COMPANY) == product.symbol().equals(origin.symbol()))
                .toList();
    }

    private static Fact baseline(Product origin, Criterion criterion, String basis) {
        return origin.facts().stream().filter(fact -> fact.criterion() == criterion && (basis.isBlank() || fact.basis().equals(basis)))
                .findFirst().orElse(null);
    }

    private static boolean matchesAlternative(Product origin, Product candidate, Criterion criterion, Fact baseline, Fact fact) {
        if (fact.criterion() != criterion) return false;
        return criterion.absence() ? fact.value().signum() == 0 : baseline != null && comparable(origin, candidate, baseline, fact);
    }

    private static boolean comparable(Product origin, Product candidate, Fact baseline, Fact fact) {
        // 농축·완제품이나 식사·간식처럼 섭취 기준이 다른 제품 제외
        return origin.prep().equals(candidate.prep()) && baseline.basis().equals(fact.basis())
                && baseline.unit().equals(fact.unit()) && fact.value().compareTo(baseline.value()) < 0;
    }

    private static BigDecimal reduction(Fact baseline, Fact fact, Criterion criterion) {
        if (criterion.absence() || baseline == null || baseline.value().signum() <= 0) return null;
        return baseline.value().subtract(fact.value()).movePointRight(2)
                .divide(baseline.value(), 1, RoundingMode.HALF_UP);
    }

    private Product decode(String value) {
        try {
            return json.readValue(value, Product.class);
        } catch (JsonProcessingException error) {
            throw new IllegalStateException("상품 데이터 형식 오류", error);
        }
    }

    private static ResponseStatusException missing(String message) {
        return new ResponseStatusException(HttpStatus.NOT_FOUND, message);
    }
}
