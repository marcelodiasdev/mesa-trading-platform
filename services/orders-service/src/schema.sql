PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS orders (
  id                  TEXT PRIMARY KEY,
  account_id          TEXT NOT NULL,
  ticker              TEXT NOT NULL,
  side                TEXT NOT NULL CHECK (side IN ('BUY','SELL')),
  type                TEXT NOT NULL CHECK (type IN ('MARKET','LIMIT','STOP')),
  status              TEXT NOT NULL CHECK (status IN (
                        'RECEIVED','VALIDATED','WORKING','PARTIALLY_FILLED',
                        'FILLED','CANCELLED','REJECTED','EXPIRED')),
  quantity            INTEGER NOT NULL CHECK (quantity > 0),
  filled_quantity     INTEGER NOT NULL DEFAULT 0 CHECK (filled_quantity >= 0),
  limit_price_cents   INTEGER CHECK (limit_price_cents IS NULL OR limit_price_cents > 0),
  stop_price_cents    INTEGER CHECK (stop_price_cents IS NULL OR stop_price_cents > 0),
  average_price_cents INTEGER,
  idempotency_key     TEXT NOT NULL UNIQUE,
  correlation_id      TEXT,
  created_at          TEXT NOT NULL,
  updated_at          TEXT NOT NULL,
  CHECK (filled_quantity <= quantity)
);

CREATE INDEX IF NOT EXISTS orders_account_idx ON orders(account_id, created_at DESC);
CREATE INDEX IF NOT EXISTS orders_open_idx ON orders(status, ticker);

CREATE TABLE IF NOT EXISTS order_events (
  order_id     TEXT NOT NULL REFERENCES orders(id),
  sequence     INTEGER NOT NULL,
  from_status  TEXT,
  to_status    TEXT NOT NULL,
  filled_delta INTEGER NOT NULL DEFAULT 0,
  price_cents  INTEGER,
  reason       TEXT,
  occurred_at  TEXT NOT NULL,
  PRIMARY KEY (order_id, sequence)
);

CREATE TRIGGER IF NOT EXISTS order_events_are_immutable_update
BEFORE UPDATE ON order_events
BEGIN
  SELECT RAISE(ABORT, 'order events are immutable');
END;

CREATE TRIGGER IF NOT EXISTS order_events_are_immutable_delete
BEFORE DELETE ON order_events
BEGIN
  SELECT RAISE(ABORT, 'order events are immutable');
END;
