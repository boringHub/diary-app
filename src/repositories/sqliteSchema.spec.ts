import initSqlJs, { type Database } from 'sql.js'
import { describe, expect, it } from 'vitest'
import { DATABASE_VERSION, MIGRATION_V2 } from './sqliteSchema'

const V1_SCHEMA = `
PRAGMA foreign_keys = ON;
CREATE TABLE diaries (
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
CREATE TABLE diary_blocks (
  id TEXT PRIMARY KEY NOT NULL,
  diary_id TEXT NOT NULL,
  block_type TEXT NOT NULL,
  sort_order INTEGER NOT NULL,
  content_json TEXT,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE
);
CREATE TABLE diary_assets (
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
CREATE TABLE diary_layouts (
  id TEXT PRIMARY KEY NOT NULL,
  diary_id TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  layout_json TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  updated_at INTEGER NOT NULL,
  FOREIGN KEY (diary_id) REFERENCES diaries(id) ON DELETE CASCADE
);
CREATE TABLE app_settings (
  key TEXT PRIMARY KEY NOT NULL,
  value_json TEXT NOT NULL,
  updated_at INTEGER NOT NULL
);
CREATE TABLE event_queue (
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
`

describe('SQLite schema migrations', () => {
  it('migrates a populated V1 database to V2 without changing existing data', async () => {
    const SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` })
    const db = new SQL.Database()
    createPopulatedV1Database(db)
    const before = snapshotV1Data(db)

    db.run('BEGIN TRANSACTION')
    try {
      for (const statement of MIGRATION_V2) db.run(statement)
      // Capacitor SQLite calls setVersion(toVersion) after these statements commit.
      db.run(`PRAGMA user_version = ${DATABASE_VERSION}`)
      db.run('COMMIT')
    } catch (error) {
      db.run('ROLLBACK')
      throw error
    }

    expect(snapshotV1Data(db)).toEqual(before)
    expect(tableNames(db)).toEqual(expect.arrayContaining(['themes', 'theme_assets']))
    expect(readRows(db, 'PRAGMA user_version')[0]?.user_version).toBe(2)
    expect(readRows(db, 'PRAGMA foreign_key_check')).toEqual([])
    db.close()
  })
})

function createPopulatedV1Database(db: Database) {
  db.run(V1_SCHEMA)
  db.run('PRAGMA user_version = 1')
  db.run(
    `INSERT INTO diaries (
      id, title, summary, created_at, updated_at, mood, mood_value,
      theme_id, theme_version, layout_id, is_favorite, is_archived,
      is_deleted, cover_asset_id, metadata_json
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      'diary-v1', '旧日记', '原来的摘要', 1000, 2000, 'happy', 5,
      'default', '1.0.0', 'layout-v1', 1, 0, 0, 'asset-v1',
      JSON.stringify({ source: 'v1', note: '保留' }),
    ],
  )
  db.run(
    'INSERT INTO diary_blocks VALUES (?, ?, ?, ?, ?, ?, ?)',
    ['block-v1', 'diary-v1', 'text', 0, JSON.stringify({ text: '原来的正文' }), 1000, 2000],
  )
  db.run(
    'INSERT INTO diary_assets VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['asset-v1', 'diary-v1', 'image', 'diaries/diary-v1/asset-v1.jpg', 640, 480, 12345, 'image/jpeg', 1500, null],
  )
  db.run(
    'INSERT INTO diary_layouts VALUES (?, ?, ?, ?, ?, ?)',
    ['layout-v1', 'diary-v1', 1, JSON.stringify({ schemaVersion: 1, elements: [] }), 1000, 2000],
  )
  db.run(
    'INSERT INTO app_settings VALUES (?, ?, ?)',
    ['current_theme_id', JSON.stringify('default'), 2000],
  )
  db.run(
    'INSERT INTO event_queue VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)',
    ['event-v1', 'diary_created', JSON.stringify({ eventId: 'event-v1', mood: 'happy' }), 2000, 1, 2100, null, 'pending', 'offline'],
  )
}

function snapshotV1Data(db: Database) {
  return {
    diaries: readRows(db, 'SELECT * FROM diaries ORDER BY id'),
    blocks: readRows(db, 'SELECT * FROM diary_blocks ORDER BY id'),
    assets: readRows(db, 'SELECT * FROM diary_assets ORDER BY id'),
    layouts: readRows(db, 'SELECT * FROM diary_layouts ORDER BY id'),
    settings: readRows(db, 'SELECT * FROM app_settings ORDER BY key'),
    events: readRows(db, 'SELECT * FROM event_queue ORDER BY id'),
  }
}

function tableNames(db: Database) {
  return readRows(db, "SELECT name FROM sqlite_master WHERE type = 'table' ORDER BY name")
    .map((row) => String(row.name))
}

function readRows(db: Database, sql: string): Record<string, unknown>[] {
  const results = db.exec(sql)
  if (!results[0]) return []
  return results[0].values.map((values) => Object.fromEntries(
    results[0].columns.map((column, index) => [column, values[index]]),
  ))
}
