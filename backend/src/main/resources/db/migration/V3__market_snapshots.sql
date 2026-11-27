CREATE TABLE market_snapshots (
    instrument_id varchar(80) NOT NULL,
    series varchar(12) NOT NULL CHECK (series IN ('1D', '1Y', 'INDEX')),
    observed_at timestamptz NOT NULL,
    payload jsonb NOT NULL,
    PRIMARY KEY (instrument_id, series)
);

CREATE TABLE kis_access_tokens (
    credential_id char(64) PRIMARY KEY,
    sealed_token bytea,
    expires_at timestamptz,
    retry_after timestamptz NOT NULL DEFAULT '1970-01-01T00:00:00Z',
    CHECK ((sealed_token IS NULL) = (expires_at IS NULL))
);
