export const DATABASE_NAME = 'shiguangjian'
export const DATABASE_VERSION = 2

export const DATABASE_SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS diaries (
  id TEXT PRIMARY KEY NOT NULL,
  title TEXT NOT NULL DEFAULT '',
  summary TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  mood TEXT,
  mood_value INTEGER,
  theme_id TEXT NOT NULL,
  theme_version TEXT NOT NULL,
  layout_id TEXT NOT NULL,
  is_favorite INTEGER NOT NULL DEFAULT 0,
  is_archived INTEGER NOT NULL DEFAULT 0,
  is_deleted INTEGER NOT NULL DEFAULT 0,
  cover_asset_id TEXT,
  metadata_json TEXT
);

CREATE TABLE IF NOT EXISTS diary_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  diary_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  content_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diary_assets (
  id TEXT PRIMARY KEY NOT NULL,
  diary_id TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  local_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  mime_type TEXT,
  created_at INTEGER NOT NULL,
  metadata_json TEXT,
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS diary_layouts (
  id TEXT PRIMARY KEY NOT NULL,
  diary_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  layout_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS themes (
  id TEXT NOT NULL,
  version TEXT NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  manifest_json TEXT NOT NULL,
  installed_at INTEGER NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  PRIMARY KEY (id, version)
);

CREATE TABLE IF NOT EXISTS theme_assets (
  id TEXT NOT NULL,
  theme_id TEXT NOT NULL,
  theme_version TEXT NOT NULL,
  asset_type TEXT NOT NULL,
  local_path TEXT NOT NULL,
  width INTEGER,
  height INTEGER,
  file_size INTEGER,
  mime_type TEXT,
  metadata_json TEXT,
  PRIMARY KEY (id, theme_id, theme_version),
  FOREIGN KEY (theme_id, theme_version) REFERENCES themes(id, version) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS event_queue (
  id TEXT PRIMARY KEY NOT NULL,
  event_type TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  retry_count INTEGER NOT NULL DEFAULT 0,
  last_attempt_at INTEGER,
  sent_at INTEGER,
  status TEXT NOT NULL DEFAULT 'pending',
  last_error TEXT
);

CREATE INDEX IF NOT EXISTS idx_diaries_timeline ON diaries(is_deleted, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_diary_blocks_diary ON diary_blocks(diary_id, sort_order);
CREATE INDEX IF NOT EXISTS idx_diary_assets_diary ON diary_assets(diary_id);
CREATE INDEX IF NOT EXISTS idx_event_queue_status ON event_queue(status, created_at);
`

export const MIGRATION_V2 = [
  `CREATE TABLE IF NOT EXISTS themes (
    id TEXT NOT NULL,
    version TEXT NOT NULL,
    name TEXT NOT NULL,
    description TEXT,
    manifest_json TEXT NOT NULL,
    installed_at INTEGER NOT NULL,
    enabled INTEGER NOT NULL DEFAULT 1,
    PRIMARY KEY (id, version)
  );`,
  `CREATE TABLE IF NOT EXISTS theme_assets (
    id TEXT NOT NULL,
    theme_id TEXT NOT NULL,
    theme_version TEXT NOT NULL,
    asset_type TEXT NOT NULL,
    local_path TEXT NOT NULL,
    width INTEGER,
    height INTEGER,
    file_size INTEGER,
    mime_type TEXT,
    metadata_json TEXT,
    PRIMARY KEY (id, theme_id, theme_version),
    FOREIGN KEY (theme_id, theme_version) REFERENCES themes(id, version) ON DELETE CASCADE
  );`,
]
