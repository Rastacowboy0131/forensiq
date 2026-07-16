-- HoodScan foundation schema.
-- SQLite-friendly now; portable to Postgres later with minor type adjustments.

CREATE TABLE IF NOT EXISTS tokens (
  address TEXT PRIMARY KEY,
  symbol TEXT,
  name TEXT,
  decimals INTEGER,
  total_supply TEXT,
  holders_count INTEGER,
  transfers_count INTEGER,
  exchange_rate TEXT,
  circulating_market_cap TEXT,
  first_seen_block INTEGER,
  first_seen_tx TEXT,
  deployer_address TEXT,
  created_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS addresses (
  address TEXT PRIMARY KEY,
  display_name TEXT,
  kind TEXT,
  is_contract INTEGER DEFAULT 0,
  is_verified INTEGER DEFAULT 0,
  hood_name TEXT,
  labels_json TEXT DEFAULT '[]',
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS transactions (
  hash TEXT PRIMARY KEY,
  block_number INTEGER,
  timestamp TEXT,
  from_address TEXT,
  to_address TEXT,
  method TEXT,
  status TEXT,
  value TEXT,
  gas_fee TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS blocks (
  height INTEGER PRIMARY KEY,
  hash TEXT,
  timestamp TEXT,
  transactions_count INTEGER,
  gas_used TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS token_holder_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  token_address TEXT NOT NULL,
  holder_address TEXT NOT NULL,
  amount TEXT,
  supply_pct REAL,
  block_number INTEGER,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS labels (
  address TEXT NOT NULL,
  label TEXT NOT NULL,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (address, label, source)
);

CREATE TABLE IF NOT EXISTS events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  event_type TEXT NOT NULL,
  chain TEXT NOT NULL DEFAULT 'robinhood',
  severity TEXT NOT NULL DEFAULT 'info',
  subject_address TEXT,
  token_address TEXT,
  wallet_address TEXT,
  tx_hash TEXT,
  block_number INTEGER,
  payload_json TEXT NOT NULL DEFAULT '{}',
  premium_at TEXT,
  free_at TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  delivered_premium_at TEXT,
  delivered_free_at TEXT
);

CREATE TABLE IF NOT EXISTS indexer_state (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_delivery ON events(premium_at, free_at, delivered_premium_at, delivered_free_at);
CREATE INDEX IF NOT EXISTS idx_events_token_created ON events(token_address, created_at);
CREATE INDEX IF NOT EXISTS idx_token_holder_token ON token_holder_snapshots(token_address, captured_at);

DROP INDEX IF EXISTS idx_events_tx_seen;
DROP INDEX IF EXISTS idx_events_block_seen;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_tx_seen ON events(event_type, tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_block_seen ON events(block_number) WHERE event_type = 'BLOCK_SEEN' AND block_number IS NOT NULL;
