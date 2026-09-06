PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS accounts (
  id        TEXT PRIMARY KEY,
  kind      TEXT NOT NULL CHECK (kind IN (
              'CLIENT_CASH','CLIENT_RESERVED','CUSTODY',
              'BROKERAGE_REVENUE','EXCHANGE_FEES','SETTLEMENT_PENDING','EXTERNAL')),
  owner_id  TEXT,
  currency  TEXT NOT NULL DEFAULT 'BRL' CHECK (currency = 'BRL')
);

CREATE TABLE IF NOT EXISTS transactions (
  id              TEXT PRIMARY KEY,
  kind            TEXT NOT NULL CHECK (kind IN
                    ('DEPOSIT','WITHDRAWAL','RESERVATION','RELEASE',
                     'TRADE','SETTLEMENT','FEE','REVERSAL')),
  occurred_at     TEXT NOT NULL,
  idempotency_key TEXT UNIQUE,
  correlation_id  TEXT,
  reverses_id     TEXT REFERENCES transactions(id)
);

CREATE TABLE IF NOT EXISTS entries (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  transaction_id TEXT NOT NULL REFERENCES transactions(id),
  account_id     TEXT NOT NULL REFERENCES accounts(id),
  amount_cents   INTEGER NOT NULL CHECK (amount_cents <> 0),
  created_at     TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS entries_account_idx ON entries(account_id, id);
CREATE INDEX IF NOT EXISTS entries_transaction_idx ON entries(transaction_id);


CREATE TRIGGER IF NOT EXISTS entries_are_immutable_update
BEFORE UPDATE ON entries
BEGIN
  SELECT RAISE(ABORT, 'ledger entries are immutable');
END;

CREATE TRIGGER IF NOT EXISTS entries_are_immutable_delete
BEFORE DELETE ON entries
BEGIN
  SELECT RAISE(ABORT, 'ledger entries are immutable');
END;
