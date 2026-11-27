UPDATE products
SET details = jsonb_set(details, '{evidence}', (
    SELECT jsonb_agg(
        CASE WHEN item->>'topic' IN ('potassium-benzoate', 'caramel-color', 'pfas', 'caffeine', 'potassium-sorbate', 'pfas-filter')
            THEN item - 'topic' ELSE item END ORDER BY position
    )
    FROM jsonb_array_elements(details->'evidence') WITH ORDINALITY AS evidence(item, position)
))
WHERE jsonb_path_exists(details, '$.evidence[*] ? (@.topic == "potassium-benzoate" || @.topic == "caramel-color" || @.topic == "pfas" || @.topic == "caffeine" || @.topic == "potassium-sorbate" || @.topic == "pfas-filter")');

ALTER TABLE products ADD CONSTRAINT verified_product_evidence CHECK (
    status <> 'VERIFIED' OR (
        COALESCE(details->>'source', '') ~ '^https://[^/[:space:]]+'
        AND jsonb_path_exists(details, '$.evidence[*] ? (@.source like_regex "^https://[^/ ]+" && @.summary like_regex "[^ ]")')
    )
);
