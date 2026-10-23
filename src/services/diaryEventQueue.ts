import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import type { Mood } from '../types/diary'

export interface DiaryCreatedEvent {
  eventId: string
  eventType: 'diary_created'
  occurredAt: number
  mood: 'calm' | 'happy' | 'low' | 'tired' | 'hopeful'
  deviceId: string
}

export interface PendingDiaryEvent {
  id: string
  eventType: DiaryCreatedEvent['eventType']
  payload: DiaryCreatedEvent
  retryCount: number
  createdAt: number
}

const MAX_RETRIES = 8
const INITIAL_RETRY_DELAY_MS = 30_000
const MAX_RETRY_DELAY_MS = 6 * 60 * 60 * 1000

export async function enqueueDiaryCreatedEvent(
  db: SQLiteDBConnection,
  mood: Mood,
  occurredAt: number,
) {
  const eventId = crypto.randomUUID()
  const deviceId = await getOrCreateDeviceId(db)
  const event: DiaryCreatedEvent = {
    eventId,
    eventType: 'diary_created',
    occurredAt,
    mood: toNotificationMood(mood),
    deviceId,
  }

  await db.run(
    `INSERT INTO event_queue (id, event_type, payload_json, created_at, status)
     VALUES (?, ?, ?, ?, 'pending')`,
    [eventId, event.eventType, JSON.stringify(event), occurredAt],
    false,
  )
}

export async function listReadyDiaryEvents(db: SQLiteDBConnection, now = Date.now(), limit = 20) {
  const result = await db.query(
    `SELECT id, event_type, payload_json, created_at, retry_count, last_attempt_at
     FROM event_queue
     WHERE status = 'pending' AND retry_count < ?
     ORDER BY created_at ASC LIMIT ?`,
    [MAX_RETRIES, Math.max(1, Math.min(Math.trunc(limit), 100))],
  )
  const rows = result.values ?? []
  return rows
    .map((row) => {
      try {
        const payload = JSON.parse(String(row.payload_json)) as DiaryCreatedEvent
        const retryCount = Number(row.retry_count)
        const createdAt = Number(row.created_at)
        return {
          id: String(row.id),
          eventType: String(row.event_type) as DiaryCreatedEvent['eventType'],
          payload,
          retryCount,
          createdAt,
          nextAttemptAt: Number(row.last_attempt_at ?? createdAt) + retryDelay(retryCount),
        }
      } catch {
        return undefined
      }
    })
    .filter((event): event is PendingDiaryEvent & { nextAttemptAt: number } => Boolean(event && event.nextAttemptAt <= now))
}

export async function markDiaryEventAttempt(db: SQLiteDBConnection, eventId: string, attemptedAt = Date.now()) {
  await db.run(
    `UPDATE event_queue SET retry_count = retry_count + 1, last_attempt_at = ?, last_error = NULL
     WHERE id = ? AND status = 'pending' AND retry_count < ?`,
    [attemptedAt, eventId, MAX_RETRIES],
    false,
  )
}

export async function markDiaryEventSent(db: SQLiteDBConnection, eventId: string, sentAt = Date.now()) {
  await db.run(
    "UPDATE event_queue SET status = 'sent', sent_at = ?, last_error = NULL WHERE id = ? AND status = 'pending'",
    [sentAt, eventId],
    false,
  )
}

export async function markDiaryEventFailed(db: SQLiteDBConnection, eventId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
  await db.run(
    `UPDATE event_queue SET status = CASE WHEN retry_count >= ? THEN 'failed' ELSE 'pending' END,
     last_error = ? WHERE id = ? AND status = 'pending'`,
    [MAX_RETRIES, message, eventId],
    false,
  )
}

export async function markDiaryEventTerminal(db: SQLiteDBConnection, eventId: string, error: unknown) {
  const message = (error instanceof Error ? error.message : String(error)).slice(0, 500)
  await db.run(
    "UPDATE event_queue SET status = 'failed', last_error = ? WHERE id = ? AND status = 'pending'",
    [message, eventId],
    false,
  )
}

function retryDelay(retryCount: number) {
  if (retryCount <= 0) return 0
  return Math.min(INITIAL_RETRY_DELAY_MS * 2 ** (retryCount - 1), MAX_RETRY_DELAY_MS)
}

function toNotificationMood(mood: Mood): DiaryCreatedEvent['mood'] {
  switch (mood) {
    case 'happy':
    case 'loved':
    case 'playful':
    case 'proud':
    case 'touched': return 'happy'
    case 'sad':
    case 'lonely':
    case 'angry':
    case 'anxious':
    case 'confused': return 'low'
    case 'tired':
    case 'sleepy': return 'tired'
    case 'excited': return 'hopeful'
    default: return 'calm'
  }
}

export async function getOrCreateDeviceId(db: SQLiteDBConnection) {
  const setting = await db.query("SELECT value_json FROM app_settings WHERE key = 'device_id' LIMIT 1")
  const existing = setting.values?.[0]?.value_json
  if (typeof existing === 'string') {
    try {
      const deviceId: unknown = JSON.parse(existing)
      if (typeof deviceId === 'string' && /^dvc_[\w-]{1,124}$/.test(deviceId)) return deviceId

      // Legacy UUID identities never had a matching Keystore key. Keep their queued
      // events local but terminal so a new identity cannot sign them as the old one.
      await db.run(
        "UPDATE event_queue SET status = 'failed', last_error = 'legacy_device_identity' WHERE status = 'pending' AND json_extract(payload_json, '$.deviceId') = ?",
        [deviceId],
        false,
      )
    } catch {
      // Replace an invalid legacy value with a new identifier.
    }
  }

  const deviceId = `dvc_${crypto.randomUUID()}`
  await db.run(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('device_id', ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    [JSON.stringify(deviceId), Date.now()],
    false,
  )
  return deviceId
}
