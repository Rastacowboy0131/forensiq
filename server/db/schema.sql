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

CREATE TABLE IF NOT EXISTS pairs (
  pair_address TEXT PRIMARY KEY,
  token0_address TEXT,
  token1_address TEXT,
  symbol TEXT,
  dex TEXT,
  liquidity_usd REAL,
  volume_5m_usd REAL DEFAULT 0,
  volume_1h_usd REAL DEFAULT 0,
  buys_5m INTEGER DEFAULT 0,
  sells_5m INTEGER DEFAULT 0,
  whale_txs_5m INTEGER DEFAULT 0,
  trench_score INTEGER DEFAULT 0,
  why_json TEXT DEFAULT '[]',
  last_seen_at TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS pair_windows (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  pair_address TEXT NOT NULL,
  window TEXT NOT NULL,
  volume_usd REAL DEFAULT 0,
  buys INTEGER DEFAULT 0,
  sells INTEGER DEFAULT 0,
  whale_txs INTEGER DEFAULT 0,
  captured_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS wallet_watchlist (
  wallet_address TEXT PRIMARY KEY,
  label TEXT,
  kind TEXT,
  min_usd REAL,
  notes TEXT,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS whale_movements (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  wallet_address TEXT NOT NULL,
  token_address TEXT,
  pair_address TEXT,
  side TEXT,
  amount_usd REAL,
  tx_hash TEXT,
  reason TEXT,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX IF NOT EXISTS idx_events_type_created ON events(event_type, created_at);
CREATE INDEX IF NOT EXISTS idx_events_delivery ON events(premium_at, free_at, delivered_premium_at, delivered_free_at);
CREATE INDEX IF NOT EXISTS idx_events_token_created ON events(token_address, created_at);
CREATE INDEX IF NOT EXISTS idx_pairs_score ON pairs(trench_score, updated_at);
CREATE INDEX IF NOT EXISTS idx_whale_movements_created ON whale_movements(created_at);
CREATE INDEX IF NOT EXISTS idx_token_holder_token ON token_holder_snapshots(token_address, captured_at);

DROP INDEX IF EXISTS idx_events_tx_seen;
DROP INDEX IF EXISTS idx_events_block_seen;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_tx_seen ON events(event_type, tx_hash) WHERE tx_hash IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_events_block_seen ON events(block_number) WHERE event_type = 'BLOCK_SEEN' AND block_number IS NOT NULL;
