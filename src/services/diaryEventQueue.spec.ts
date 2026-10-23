import initSqlJs, { type Database } from 'sql.js'
import { describe, expect, it } from 'vitest'
import type { Mood } from '../types/diary'
import {
  enqueueDiaryCreatedEvent,
  listReadyDiaryEvents,
  markDiaryEventAttempt,
  markDiaryEventFailed,
  markDiaryEventSent,
  markDiaryEventTerminal,
} from './diaryEventQueue'

describe('diary event queue', () => {
  it('stores only allowlisted metadata and reuses a stable device id', async () => {
    const SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` })
    const db = new SQL.Database()
    db.run(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE event_queue (
        id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER, sent_at INTEGER, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT
      );`)
    const database = sqlJsConnection(db)

    await enqueueDiaryCreatedEvent(database, 'happy', 1234)
    await enqueueDiaryCreatedEvent(database, 'calm', 5678)

    const events = db.exec('SELECT id, event_type, payload_json, created_at, status FROM event_queue ORDER BY created_at')
    const first = JSON.parse(String(events[0]?.values[0]?.[2]))
    const second = JSON.parse(String(events[0]?.values[1]?.[2]))
    expect(Object.keys(first).sort()).toEqual(['deviceId', 'eventId', 'eventType', 'mood', 'occurredAt'])
    expect(first.deviceId).toMatch(/^dvc_[\w-]+$/)
    expect(first).toMatchObject({ eventId: events[0]?.values[0]?.[0], eventType: 'diary_created', occurredAt: 1234, mood: 'happy' })
    expect(second).toMatchObject({ eventType: 'diary_created', occurredAt: 5678, mood: 'calm', deviceId: first.deviceId })
    expect(events[0]?.values.map((row) => row[4])).toEqual(['pending', 'pending'])

    const expectedMoods: Record<Mood, string> = {
      calm: 'calm', happy: 'happy', sad: 'low', tired: 'tired', excited: 'hopeful',
      loved: 'happy', playful: 'happy', proud: 'happy', relaxed: 'calm', touched: 'happy',
      sleepy: 'tired', lonely: 'low', angry: 'low', anxious: 'low', confused: 'low',
    }
    for (const [mood, expected] of Object.entries(expectedMoods)) {
      await enqueueDiaryCreatedEvent(database, mood as Mood, 9999)
      const payload = db.exec('SELECT payload_json FROM event_queue ORDER BY rowid DESC LIMIT 1')[0]?.values[0]?.[0]
      expect(JSON.parse(String(payload)).mood, mood).toBe(expected)
    }
    db.close()
  })

  it('rolls back the event and device id with the caller transaction', async () => {
    const SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` })
    const db = new SQL.Database()
    db.run(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE event_queue (
        id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER, sent_at INTEGER, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT
      );`)
    const database = sqlJsConnection(db)

    db.run('BEGIN')
    await enqueueDiaryCreatedEvent(database, 'happy', 1234)
    db.run('ROLLBACK')

    expect(db.exec('SELECT * FROM event_queue')[0]?.values ?? []).toEqual([])
    expect(db.exec('SELECT * FROM app_settings')[0]?.values ?? []).toEqual([])
    db.close()
  })

  it('backs off failed events, marks successful delivery, and stops after the retry limit', async () => {
    const SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` })
    const db = new SQL.Database()
    db.run(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE event_queue (
        id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER, sent_at INTEGER, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT
      );`)
    const database = sqlJsConnection(db)
    await enqueueDiaryCreatedEvent(database, 'happy', 0)
    const eventId = String(db.exec('SELECT id FROM event_queue')[0]?.values[0]?.[0])

    expect(await listReadyDiaryEvents(database, 0)).toHaveLength(1)
    await markDiaryEventAttempt(database, eventId, 30_000)
    await markDiaryEventFailed(database, eventId, new Error('offline'))
    expect(await listReadyDiaryEvents(database, 59_999)).toHaveLength(0)
    expect(await listReadyDiaryEvents(database, 60_000)).toHaveLength(1)
    await markDiaryEventSent(database, eventId, 90_000)
    expect(db.exec('SELECT status, sent_at, retry_count FROM event_queue')[0]?.values[0]).toEqual(['sent', 90_000, 1])

    await enqueueDiaryCreatedEvent(database, 'calm', 0)
    const secondId = db.exec('SELECT id FROM event_queue ORDER BY rowid DESC')[0]?.values[0]?.[0]
    for (let attempt = 0; attempt < 8; attempt++) {
      await markDiaryEventAttempt(database, String(secondId), attempt)
      await markDiaryEventFailed(database, String(secondId), 'offline')
    }
    expect(db.exec('SELECT status FROM event_queue WHERE id = ?', [secondId])[0]?.values[0]).toEqual(['failed'])
    db.close()
  })

  it('permanently stops events rejected by authentication or validation', async () => {
    const SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` })
    const db = new SQL.Database()
    db.run(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
      CREATE TABLE event_queue (
        id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
        created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0,
        last_attempt_at INTEGER, sent_at INTEGER, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT
      );`)
    const database = sqlJsConnection(db)
    await enqueueDiaryCreatedEvent(database, 'happy', 0)
    const eventId = String(db.exec('SELECT id FROM event_queue')[0]?.values[0]?.[0])

    await markDiaryEventTerminal(database, eventId, new Error('unauthorized'))

    expect(db.exec('SELECT status, retry_count, last_error FROM event_queue')[0]?.values[0])
      .toEqual(['failed', 0, 'unauthorized'])
    expect(await listReadyDiaryEvents(database, 0)).toHaveLength(0)
    db.close()
  })
})

function sqlJsConnection(db: Database) {
  return {
    async query(statement: string, values: unknown[] = []) {
      const result = db.exec(statement, values as (string | number | null)[])
      const first = result[0]
      return { values: first?.values.map((values) => Object.fromEntries(first.columns.map((column, index) => [column, values[index]]))) ?? [] }
    },
    async run(statement: string, values: unknown[] = []) {
      db.run(statement, values as (string | number | null)[])
      return {}
    },
  } as unknown as import('@capacitor-community/sqlite').SQLiteDBConnection
}
