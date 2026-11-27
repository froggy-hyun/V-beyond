CREATE TABLE listings (
    id varchar(80) PRIMARY KEY,
    symbol varchar(12) NOT NULL,
    name varchar(120) NOT NULL,
    english varchar(160) NOT NULL,
    market varchar(2) NOT NULL CHECK (market IN ('KR', 'US')),
    exchange varchar(12) NOT NULL,
    currency varchar(3) NOT NULL,
    overview text NOT NULL,
    source text NOT NULL,
    UNIQUE (market, exchange, symbol)
);
CREATE TABLE products (
    id varchar(120) PRIMARY KEY,
    listing_id varchar(80) NOT NULL REFERENCES listings(id),
    name varchar(250) NOT NULL,
    brand varchar(120) NOT NULL,
    category varchar(40) NOT NULL,
    market varchar(2) NOT NULL,
    status varchar(12) NOT NULL CHECK (status IN ('DRAFT','VERIFIED','RETIRED')),
    details jsonb NOT NULL
);
CREATE INDEX products_listing_idx ON products (listing_id) WHERE status='VERIFIED';
CREATE INDEX products_category_idx ON products (category, market) WHERE status='VERIFIED';
