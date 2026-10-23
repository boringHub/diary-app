// Additive only: shares the existing SQLite database without touching diary tables.
export const TAROT_MIGRATION = [
  `CREATE TABLE IF NOT EXISTS tarot_readings (
    id TEXT PRIMARY KEY NOT NULL, schema_version INTEGER NOT NULL DEFAULT 1,
    scenario_id TEXT NOT NULL, spread_id TEXT NOT NULL, spread_version INTEGER NOT NULL,
    deck_id TEXT NOT NULL, deck_version TEXT NOT NULL, catalog_version TEXT NOT NULL,
    question TEXT NOT NULL, context TEXT NOT NULL DEFAULT '', options_json TEXT,
    details_json TEXT NOT NULL DEFAULT '{}', include_reversals INTEGER NOT NULL DEFAULT 1 CHECK(include_reversals IN (0,1)),
    stage TEXT NOT NULL CHECK(stage IN ('draft','shuffling','cutting','drawing','revealed')),
    deck_order_json TEXT, cut_index INTEGER CHECK(cut_index IS NULL OR cut_index BETWEEN 1 AND 77),
    spread_snapshot_json TEXT NOT NULL, display_title TEXT NOT NULL DEFAULT '', note TEXT NOT NULL DEFAULT '',
    is_favorite INTEGER NOT NULL DEFAULT 0 CHECK(is_favorite IN (0,1)), revision INTEGER NOT NULL DEFAULT 0,
    created_at INTEGER NOT NULL, updated_at INTEGER NOT NULL, revealed_at INTEGER
  );`,
  `CREATE INDEX IF NOT EXISTS idx_tarot_readings_updated ON tarot_readings(updated_at DESC, id DESC);`,
  `CREATE INDEX IF NOT EXISTS idx_tarot_readings_filter ON tarot_readings(scenario_id, updated_at DESC, id DESC);`,
  `CREATE TABLE IF NOT EXISTS tarot_drawn_cards (
    reading_id TEXT NOT NULL REFERENCES tarot_readings(id) ON DELETE CASCADE,
    position_id TEXT NOT NULL, draw_order INTEGER NOT NULL, card_id TEXT NOT NULL,
    orientation TEXT NOT NULL CHECK(orientation IN ('upright','reversed')),
    original_slot INTEGER NOT NULL CHECK(original_slot BETWEEN 0 AND 77), snapshot_json TEXT NOT NULL,
    PRIMARY KEY(reading_id,position_id), UNIQUE(reading_id,card_id), UNIQUE(reading_id,draw_order)
  );`,
  `CREATE TABLE IF NOT EXISTS tarot_messages (
    id TEXT PRIMARY KEY NOT NULL, reading_id TEXT NOT NULL REFERENCES tarot_readings(id) ON DELETE CASCADE,
    seq INTEGER NOT NULL, role TEXT NOT NULL CHECK(role IN ('user','assistant')),
    kind TEXT NOT NULL CHECK(kind IN ('initial','followup')), content TEXT NOT NULL DEFAULT '',
    status TEXT NOT NULL CHECK(status IN ('pending','streaming','completed','failed','interrupted','unknown')),
    request_id TEXT, attempt_of TEXT, error_code TEXT, metadata_json TEXT, created_at INTEGER NOT NULL,
    completed_at INTEGER, UNIQUE(reading_id,seq)
  );`,
  `CREATE TABLE IF NOT EXISTS tarot_ai_requests (
    request_id TEXT PRIMARY KEY NOT NULL, reading_id TEXT NOT NULL REFERENCES tarot_readings(id) ON DELETE CASCADE,
    assistant_message_id TEXT NOT NULL, body_json TEXT NOT NULL, state TEXT NOT NULL, created_at INTEGER NOT NULL
  );`,
  `CREATE TABLE IF NOT EXISTS tarot_cleanup_outbox (
    reading_id TEXT PRIMARY KEY NOT NULL, expires_at INTEGER NOT NULL, next_attempt_at INTEGER NOT NULL DEFAULT 0,
    attempts INTEGER NOT NULL DEFAULT 0
  );`,
]
