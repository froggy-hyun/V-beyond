package com.productlens.catalog;

import com.productlens.catalog.Catalog.*;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.server.ResponseStatusException;

@RestController
@RequestMapping("/api/v1")
class CatalogApi {
    private final Catalog catalog;

    CatalogApi(Catalog catalog) { this.catalog = catalog; }

    @GetMapping("/stocks")
    List<Stock> stocks(@RequestParam(defaultValue = "") @Pattern(regexp = "KR|US|") String market) {
        return catalog.stocks(market);
    }

    @GetMapping("/stocks/{id}")
    Stock stock(@PathVariable String id) { return catalog.stock(id); }

    @GetMapping("/stocks/{id}/products")
    List<Product> products(@PathVariable String id) { return catalog.products(id); }

    @GetMapping("/stocks/{id}/competitors")
    List<Stock> competitors(@PathVariable String id) { return catalog.competitors(id); }

    @GetMapping("/stocks/{id}/revenue-segments")
    Map<String, String> revenues(@PathVariable String id) {
        return Map.of("status", "UNAVAILABLE", "source", catalog.stock(id).source());
    }

    @GetMapping("/search")
    Search search(@RequestParam @Size(max = 100) String q) { return catalog.search(q); }

    @GetMapping("/products/{id}")
    Product product(@PathVariable String id) { return catalog.product(id); }

    @GetMapping("/products/{id}/evidence")
    List<Evidence> evidence(@PathVariable String id) { return catalog.product(id).evidence(); }

    @GetMapping("/products/{id}/alternatives")
    Alternatives alternatives(@PathVariable String id, @RequestParam Criterion criterion,
                              @RequestParam(defaultValue = "") String basis,
                              @RequestParam(defaultValue = "ALL_COMPANIES") Scope scope) {
        return catalog.alternatives(id, criterion, basis, scope);
    }

    @GetMapping("/comparisons/companies")
    List<Comparison> compare(@RequestParam List<String> ids) {
        pair(ids);
        return ids.stream().map(id -> new Comparison(catalog.stock(id), catalog.products(id))).toList();
    }

    @GetMapping("/comparisons/products")
    List<Product> compareProducts(@RequestParam List<String> ids) {
        pair(ids);
        return ids.stream().map(catalog::product).toList();
    }

    private void pair(List<String> ids) {
        if (ids.size() != 2 || ids.get(0).equals(ids.get(1))) {
            throw new ResponseStatusException(HttpStatus.BAD_REQUEST, "비교할 서로 다른 항목 두 개를 선택하세요.");
        }
    }
}
