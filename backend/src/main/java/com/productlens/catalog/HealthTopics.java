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
    record Reference(String title, String url, String finding) {}
    record Topic(String id, String name, String category, List<String> aliases, String condition, String assessment, String limits,
                 List<Reference> sources, Criterion criterion) {}
    record Support(String detail, String source, Fact fact) {}
    record Assessment(Topic topic, Support support) {}
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
        return topics.stream().map(topic -> new Results(topic, products.stream().flatMap(product ->
                support(topic, product).map(found -> new Match(stocks.get(product.market() + ":" + product.symbol()),
                        product.id(), product.name(), product.market(), found.detail(), found.source(), found.fact())).stream())
                .toList())).filter(result -> !result.matches().isEmpty()).toList();
    }

    List<Assessment> assessments(Product product) {
        return topics.stream().flatMap(topic -> support(topic, product).map(found -> new Assessment(topic, found)).stream()).toList();
    }

    Topic forCriterion(Criterion criterion) {
        var topicCriterion = criterion == Criterion.ADDED_SUGAR ? Criterion.TOTAL_SUGAR : criterion;
        return topics.stream().filter(topic -> topic.criterion() == topicCriterion).findFirst().orElseThrow();
    }

    private static Optional<Support> support(Topic topic, Product product) {
        var evidence = product.evidence().stream().filter(item -> topic.id().equals(item.topic())
                && item.source() != null && item.source().startsWith("https://")).findFirst();
        if (evidence.isPresent()) {
            var item = evidence.get();
            return Optional.of(new Support(item.summary(), item.source(), null));
        }
        return product.facts().stream().filter(fact -> fact.criterion() == topic.criterion()
                        && Catalog.sourced(fact) && fact.value().signum() > 0)
                .min(Comparator.comparingInt(fact -> Catalog.basisFor(product, fact.criterion()).equals(fact.basis()) ? 0 : 1))
                .map(fact -> new Support(null, fact.source(), fact));
    }
}
