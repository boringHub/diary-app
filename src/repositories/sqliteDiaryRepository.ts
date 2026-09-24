import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Diary, Mood } from '../types/diary'
import type { DiaryRepository, SaveDiaryInput } from './diaryRepository'

const DATABASE_NAME = 'shiguangjian'
const DATABASE_VERSION = 1

const schemaV1 = `
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
PRAGMA user_version = 1;
`

type DiaryRow = Record<string, unknown>

export class SQLiteDiaryRepository implements DiaryRepository {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite)
  private connectionPromise?: Promise<SQLiteDBConnection>

  async list(): Promise<Diary[]> {
    const db = await this.connection()
    const result = await db.query(`
      SELECT d.*, b.content_json AS body_json
      FROM diaries d
      LEFT JOIN diary_blocks b
        ON b.diary_id = d.id AND b.block_type = 'text' AND b.sort_order = 0
      WHERE d.is_deleted = 0
      ORDER BY d.updated_at DESC
    `)
    return (result.values ?? []).map((row) => this.mapDiary(row as DiaryRow))
  }

  async get(id: string): Promise<Diary | undefined> {
    const db = await this.connection()
    const result = await db.query(`
      SELECT d.*, b.content_json AS body_json
      FROM diaries d
      LEFT JOIN diary_blocks b
        ON b.diary_id = d.id AND b.block_type = 'text' AND b.sort_order = 0
      WHERE d.id = ? AND d.is_deleted = 0
      LIMIT 1
    `, [id])
    const row = result.values?.[0]
    return row ? this.mapDiary(row as DiaryRow) : undefined
  }

  async save(input: SaveDiaryInput): Promise<Diary> {
    const db = await this.connection()
    const existing = input.id ? await this.get(input.id) : undefined
    const now = Date.now()
    const id = existing?.id ?? crypto.randomUUID()
    const createdAt = existing?.createdAt ?? now
    const summary = input.body.slice(0, 48)
    const themeId = existing?.themeId ?? 'default'
    const themeVersion = existing?.themeVersion ?? '1.0.0'
    const layoutId = existing?.layoutId ?? `layout-${id}`
    const blockId = `${id}:text:0`

    await db.beginTransaction()
    try {
      await db.run(`
        INSERT INTO diaries (
          id, title, summary, created_at, updated_at, mood,
          theme_id, theme_version, layout_id, is_favorite, is_archived, is_deleted
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          updated_at = excluded.updated_at,
          mood = excluded.mood,
          theme_id = excluded.theme_id,
          theme_version = excluded.theme_version,
          layout_id = excluded.layout_id
      `, [
        id, input.title, summary, createdAt, now, input.mood,
        themeId, themeVersion, layoutId, existing?.isFavorite ? 1 : 0,
      ], false)
      await db.run(`
        INSERT INTO diary_blocks (
          id, diary_id, block_type, sort_order, content_json, created_at, updated_at
        ) VALUES (?, ?, 'text', 0, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          content_json = excluded.content_json,
          updated_at = excluded.updated_at
      `, [blockId, id, JSON.stringify({ text: input.body }), createdAt, now], false)
      await db.run(`
        INSERT INTO diary_layouts (
          id, diary_id, schema_version, layout_json, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at
      `, [layoutId, id, JSON.stringify({ templateId: 'layout-default', elements: [{ blockId, type: 'text' }] }), createdAt, now], false)
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }

    return {
      id,
      title: input.title,
      summary,
      body: input.body,
      mood: input.mood,
      createdAt,
      updatedAt: now,
      isFavorite: existing?.isFavorite ?? false,
      isDeleted: false,
      themeId,
      themeVersion,
      layoutId,
    }
  }

  async toggleFavorite(id: string): Promise<void> {
    const db = await this.connection()
    await db.run(`
      UPDATE diaries
      SET is_favorite = CASE is_favorite WHEN 1 THEN 0 ELSE 1 END,
          updated_at = ?
      WHERE id = ? AND is_deleted = 0
    `, [Date.now(), id])
  }

  async remove(id: string): Promise<void> {
    const db = await this.connection()
    await db.run('UPDATE diaries SET is_deleted = 1, updated_at = ? WHERE id = ?', [Date.now(), id])
  }

  private async connection(): Promise<SQLiteDBConnection> {
    this.connectionPromise ??= this.openConnection()
    return this.connectionPromise
  }

  private async openConnection(): Promise<SQLiteDBConnection> {
    const existing = await this.sqlite.isConnection(DATABASE_NAME, false)
    const db = existing.result
      ? await this.sqlite.retrieveConnection(DATABASE_NAME, false)
      : await this.sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false)
    const isOpen = await db.isDBOpen()
    if (!isOpen.result) await db.open()
    await db.execute(schemaV1, true)
    await this.seedWelcomeDiary(db)
    return db
  }

  private async seedWelcomeDiary(db: SQLiteDBConnection) {
    const result = await db.query('SELECT COUNT(*) AS total FROM diaries')
    if (Number(result.values?.[0]?.total ?? 0) > 0) return

    const now = Date.now() - 86400000
    const body = '欢迎来到拾光笺呀~\n\n先记下一点此刻的心情吧，日记只会留在这台设备里。'
    await db.beginTransaction()
    try {
      await db.run(`
        INSERT INTO diaries (
          id, title, summary, created_at, updated_at, mood,
          theme_id, theme_version, layout_id, is_favorite, is_archived, is_deleted
        ) VALUES ('welcome', ?, ?, ?, ?, 'calm', 'default', '1.0.0', 'layout-default', 1, 0, 0)
      `, ['把今天收进一页笺', '这里可以慢慢写下今天的小心情。', now, now], false)
      await db.run(`
        INSERT INTO diary_blocks (
          id, diary_id, block_type, sort_order, content_json, created_at, updated_at
        ) VALUES ('welcome:text:0', 'welcome', 'text', 0, ?, ?, ?)
      `, [JSON.stringify({ text: body }), now, now], false)
      await db.run(`
        INSERT INTO diary_layouts (
          id, diary_id, schema_version, layout_json, created_at, updated_at
        ) VALUES ('layout-default', 'welcome', 1, ?, ?, ?)
      `, [JSON.stringify({ templateId: 'layout-default', elements: [{ blockId: 'welcome:text:0', type: 'text' }] }), now, now], false)
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  private mapDiary(row: DiaryRow): Diary {
    return {
      id: String(row.id),
      title: String(row.title ?? ''),
      summary: String(row.summary ?? ''),
      body: this.readTextBlock(row.body_json),
      mood: this.readMood(row.mood),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      isFavorite: Number(row.is_favorite) === 1,
      isDeleted: Number(row.is_deleted) === 1,
      themeId: String(row.theme_id),
      themeVersion: String(row.theme_version),
      layoutId: String(row.layout_id),
    }
  }

  private readTextBlock(value: unknown): string {
    if (typeof value !== 'string') return ''
    try {
      const parsed: unknown = JSON.parse(value)
      if (parsed && typeof parsed === 'object' && 'text' in parsed) return String(parsed.text ?? '')
    } catch {
      return ''
    }
    return ''
  }

  private readMood(value: unknown): Mood {
    return value === 'happy' || value === 'sad' || value === 'tired' || value === 'excited' ? value : 'calm'
  }
}
