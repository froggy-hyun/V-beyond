package com.productlens.catalog;

import com.productlens.catalog.Catalog.Criterion;
import com.productlens.catalog.Catalog.Fact;
import com.productlens.catalog.Catalog.Product;
import com.productlens.catalog.Catalog.Stock;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.util.Comparator;
import java.util.List;
import java.util.Optional;
import java.util.function.Function;
import java.util.stream.Collectors;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Service;

@Service
class HealthTopics {
    record Reference(String title, String url) {}
    record Topic(String id, String name, String category, List<String> aliases, String assessment,
                 List<Reference> sources, Criterion criterion) {}
    record Match(Stock stock, String productId, String productName, String market, String detail, String source, Fact fact) {}
    record Results(Topic topic, List<Match> matches) {}

    private final Catalog catalog;
    private final List<Topic> topics;

    HealthTopics(Catalog catalog, ObjectMapper json) throws IOException {
        this.catalog = catalog;
        try (var input = new ClassPathResource("catalog/health-topics.json").getInputStream()) {
            topics = json.readValue(input, new TypeReference<>() {});
        }
    }

    List<Results> results() {
        var stocks = catalog.stocks("").stream().collect(Collectors.toMap(
                stock -> stock.market() + ":" + stock.symbol(), Function.identity()));
        var products = catalog.verifiedProducts();
        return topics.stream().map(topic -> new Results(topic, products.stream().map(product ->
                        match(topic, product, stocks.get(product.market() + ":" + product.symbol())))
                .flatMap(Optional::stream).toList())).toList();
    }

    List<Topic> labeledTopics(Product product) {
        return topics.stream().filter(topic -> product.evidence().stream().anyMatch(item -> topic.id().equals(item.topic()))).toList();
    }

    private static Optional<Match> match(Topic topic, Product product, Stock stock) {
        var evidence = product.evidence().stream().filter(item -> topic.id().equals(item.topic())).findFirst();
        if (evidence.isPresent()) {
            var item = evidence.get();
            return Optional.of(new Match(stock, product.id(), product.name(), product.market(), item.summary(), item.source(), null));
        }
        return product.facts().stream().filter(fact -> fact.criterion() == topic.criterion() && fact.value().signum() > 0)
                .min(Comparator.comparingInt(fact -> product.category().nutritionBasis().equals(fact.basis()) ? 0 : 1))
                .map(fact -> new Match(stock, product.id(), product.name(), product.market(), null, fact.source(), fact));
    }
}
