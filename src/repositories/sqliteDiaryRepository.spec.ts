import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'

const queueMocks = vi.hoisted(() => ({
  enqueueDiaryCreatedEvent: vi.fn(),
}))

vi.mock('@capacitor-community/sqlite', () => ({
  CapacitorSQLite: {},
  SQLiteConnection: class SQLiteConnection {},
}))

vi.mock('../services/diaryAssetStorage', () => ({
  diaryAssetStorage: {
    remove: vi.fn(async () => undefined),
    resolveUrl: vi.fn(async () => undefined),
    saveImage: vi.fn(),
  },
}))

vi.mock('../services/diaryEventQueue', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/diaryEventQueue')>(),
  enqueueDiaryCreatedEvent: queueMocks.enqueueDiaryCreatedEvent,
}))

vi.mock('./settingsRepository', () => ({
  settingsRepository: {
    get: vi.fn(() => ({
      notificationEnabled: true,
      notificationEmailVerified: true,
      notificationSyncPending: false,
    })),
    update: vi.fn(),
  },
}))

import { SQLiteDiaryRepository } from './sqliteDiaryRepository'

describe('SQLiteDiaryRepository notification isolation', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubEnv('VITE_NOTIFY_API_ORIGIN', 'https://notify.example.com')
  })

  it('keeps a committed diary when notification enqueue fails', async () => {
    queueMocks.enqueueDiaryCreatedEvent.mockRejectedValueOnce(new Error('queue unavailable'))
    const db = createDatabase()
    const repository = withDatabase(new SQLiteDiaryRepository(), db)

    await expect(repository.save({ title: '本地日记', body: '先保存到本机', mood: 'happy' }))
      .resolves.toMatchObject({ title: '本地日记', body: '先保存到本机', mood: 'happy' })

    expect(db.commitTransaction).toHaveBeenCalledOnce()
    expect(queueMocks.enqueueDiaryCreatedEvent).toHaveBeenCalledOnce()
    expect(db.rollbackTransaction).not.toHaveBeenCalled()
  })

  it('does not open the database for background sync when the API is unconfigured', async () => {
    vi.stubEnv('VITE_NOTIFY_API_ORIGIN', '')
    const db = createDatabase()
    const repository = withDatabase(new SQLiteDiaryRepository(), db)

    await expect(repository.syncPendingNotificationEvents()).resolves.toBeUndefined()
    expect(db.query).not.toHaveBeenCalled()
  })
})

function withDatabase(repository: SQLiteDiaryRepository, db: ReturnType<typeof createDatabase>) {
  Object.defineProperty(repository, 'connectionPromise', {
    value: Promise.resolve(db as unknown as SQLiteDBConnection),
    writable: true,
  })
  return repository
}

function createDatabase() {
  const layout = JSON.stringify({ schemaVersion: 1, elements: [] })
  return {
    beginTransaction: vi.fn(async () => undefined),
    commitTransaction: vi.fn(async () => undefined),
    rollbackTransaction: vi.fn(async () => undefined),
    run: vi.fn(async () => ({})),
    query: vi.fn(async (sql: string) => {
      if (sql.includes('FROM diary_blocks')) {
        return {
          values: [{
            id: 'block-1',
            diary_id: 'diary-1',
            block_type: 'text',
            sort_order: 0,
            content_json: JSON.stringify({ text: '先保存到本机' }),
          }],
        }
      }
      if (sql.includes('FROM diary_layouts')) return { values: [{ layout_json: layout }] }
      return { values: [] }
    }),
  }
}
