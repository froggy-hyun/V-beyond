CREATE TABLE ai_response_cache (
    cache_key varchar(64) PRIMARY KEY,
    response jsonb NOT NULL,
    expires_at timestamptz NOT NULL
);

CREATE INDEX ai_response_cache_expiry ON ai_response_cache (expires_at);
