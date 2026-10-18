import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import initSqlJs from 'sql.js'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { settingsRepository } from './settingsRepository'
import { DATABASE_SCHEMA } from './sqliteSchema'

const queueMocks = vi.hoisted(() => ({
  enqueueDiaryCreatedEvent: vi.fn(),
}))
const apiMocks = vi.hoisted(() => ({
  createDiaryShare: vi.fn(),
  getDiaryShareReceipts: vi.fn(),
  withRegisteredDevice: vi.fn(async (_db, action) => action({ deviceId: 'dvc_test', alias: 'test', publicKey: 'test' })),
}))

vi.mock('../services/deviceIdentity', () => ({ withRegisteredDevice: apiMocks.withRegisteredDevice }))
vi.mock('../services/notifyApiClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('../services/notifyApiClient')>(),
  createDiaryShare: apiMocks.createDiaryShare,
  getDiaryShareReceipts: apiMocks.getDiaryShareReceipts,
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

  afterEach(() => {
    vi.useRealTimers()
    vi.unstubAllEnvs()
  })

  it('persists read receipts in SQLite and exposes them when the diary is reloaded', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T11:06:42Z'))
    const SQL = await initSqlJs()
    const sqlite = new SQL.Database()
    sqlite.run(DATABASE_SCHEMA)
    sqlite.run(`INSERT INTO diaries (id, title, created_at, updated_at, theme_id, theme_version, layout_id)
      VALUES ('diary-1', '回执测试', 1, 1, 'default', '1.0.0', 'layout-1')`)
    sqlite.run(`INSERT INTO diary_share_states (diary_id, share_id, status, consent_version,
      shared_title, shared_body, shared_occurred_at, created_at, updated_at)
      VALUES ('diary-1', 'dsh_test', 'queued', 'diary-share-v1', '回执测试', '正文', 1, 1, 1)`)
    const db = createDatabase()
    db.query.mockImplementation(async (sql, ...args: unknown[]) => {
      const statement = sqlite.prepare(sql)
      try {
        statement.bind((args[0] ?? []) as never)
        const values: Record<string, unknown>[] = []
        while (statement.step()) values.push(statement.getAsObject())
        return { values }
      } finally {
        statement.free()
      }
    })
    db.run.mockImplementation(async (sql, values = []) => {
      sqlite.run(sql, values as never)
      return {}
    })
    const readAt = new Date('2026-10-18T11:01:43Z').getTime()
    apiMocks.getDiaryShareReceipts.mockResolvedValue({
      items: [{ shareId: 'dsh_test', status: 'read', readAt, reaction: 'seen' }], nextCursor: null,
    })
    try {
      const repository = withDatabase(new SQLiteDiaryRepository(), db)
      expect(await repository.syncDiaryShareReceipts()).toEqual({
        notices: [{ diaryId: 'diary-1', title: '回执测试', readAt }], checked: true, nextCheckAt: null,
      })
      expect(await repository.get('diary-1')).toMatchObject({ shareStatus: 'read', shareReadAt: readAt })
      await repository.syncDiaryShareReceipts()
      await withDatabase(new SQLiteDiaryRepository(), db).syncDiaryShareReceipts()
      expect(apiMocks.getDiaryShareReceipts).toHaveBeenCalledOnce()
      expect(sqlite.exec('SELECT notified_at FROM diary_share_states')[0]!.values[0]![0]).toBe(Date.now())
    } finally {
      sqlite.close()
    }
  })

  it('keeps a committed diary when notification enqueue fails', async () => {
    queueMocks.enqueueDiaryCreatedEvent.mockRejectedValueOnce(new Error('queue unavailable'))
    const db = createDatabase()
    const repository = withDatabase(new SQLiteDiaryRepository(), db)

    await expect(repository.save({ title: '本地日记', body: '先保存到本机', mood: 'happy' }))
      .resolves.toMatchObject({ title: '本地日记', body: '先保存到本机', mood: 'happy' })

    expect(db.commitTransaction).toHaveBeenCalledOnce()
    expect(queueMocks.enqueueDiaryCreatedEvent).not.toHaveBeenCalled()
    expect(db.rollbackTransaction).not.toHaveBeenCalled()
  })

  it.each([
    { notificationEnabled: false, notificationEmailVerified: false },
    { notificationEnabled: false, notificationEmailVerified: true },
    { notificationEnabled: true, notificationEmailVerified: true },
  ])('shares independently of the user notification settings: %o', async (settings) => {
    vi.mocked(settingsRepository.get).mockReturnValue(settings as ReturnType<typeof settingsRepository.get>)
    const db = createDatabase()
    const repository = withDatabase(new SQLiteDiaryRepository(), db)
    vi.spyOn(repository, 'get').mockResolvedValue({ id: 'diary-1', title: '分享', body: '正文', shareStatus: 'none' } as never)
    apiMocks.createDiaryShare.mockResolvedValue({ shareId: 'dsh_test', status: 'queued' })

    await repository.shareDiary('diary-1')

    expect(apiMocks.createDiaryShare).toHaveBeenCalledOnce()
    expect(queueMocks.enqueueDiaryCreatedEvent).not.toHaveBeenCalled()
    expect(db.run).toHaveBeenCalledWith(expect.stringContaining('INSERT INTO diary_share_states'), expect.any(Array))
  })

  it('does not register or request status when the local queues are empty', async () => {
    const repository = withDatabase(new SQLiteDiaryRepository(), createDatabase())
    await repository.syncPendingNotificationEvents()
    await repository.syncPendingDiaryShares()
    await repository.syncDiaryShareReceipts()
    expect(apiMocks.withRegisteredDevice).not.toHaveBeenCalled()
  })

  it('throttles receipt requests even if the network request fails', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T11:00:00Z'))
    const db = createDatabase()
    let lastCheck = 0
    db.query.mockImplementation(async (sql) => {
      if (sql.includes("s.status IN ('queued'")) return { values: [{ share_id: 'dsh_test' }] }
      if (sql.includes('diary_share_receipt_last_check')) return { values: [{ value_json: String(lastCheck) }] }
      return { values: [] }
    })
    db.run.mockImplementation(async (sql, values) => {
      if (sql.includes('diary_share_receipt_last_check')) lastCheck = Number(values?.[0])
      return {}
    })
    apiMocks.getDiaryShareReceipts.mockRejectedValueOnce(new Error('network unavailable'))
    const repository = withDatabase(new SQLiteDiaryRepository(), db)
    await expect(repository.syncDiaryShareReceipts()).rejects.toThrow('network unavailable')
    // A fresh repository represents an App restart using the same saved attempt time.
    expect(await withDatabase(new SQLiteDiaryRepository(), db).syncDiaryShareReceipts()).toMatchObject({
      checked: false, nextCheckAt: Date.now() + 5 * 60_000,
    })
    expect(apiMocks.getDiaryShareReceipts).toHaveBeenCalledOnce()
    apiMocks.getDiaryShareReceipts.mockResolvedValueOnce({ items: [], nextCursor: null })
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    await repository.syncDiaryShareReceipts()
    expect(apiMocks.getDiaryShareReceipts).toHaveBeenCalledTimes(2)
  })

  it('coalesces simultaneous receipt calls before the persisted interval is checked', async () => {
    const db = createDatabase()
    db.query.mockImplementation(async (sql) => {
      if (sql.includes("s.status IN ('queued'")) return { values: [{ share_id: 'dsh_test' }] }
      return { values: [] }
    })
    apiMocks.getDiaryShareReceipts.mockResolvedValue({ items: [], nextCursor: null })
    const repository = withDatabase(new SQLiteDiaryRepository(), db)
    await Promise.all([repository.syncDiaryShareReceipts(), repository.syncDiaryShareReceipts()])
    expect(apiMocks.getDiaryShareReceipts).toHaveBeenCalledOnce()
  })

  it('backs off pending share retries after a transient failure', async () => {
    const db = createDatabase()
    db.query.mockImplementation(async () => ({ values: [{ diary_id: 'diary-1', share_id: 'dsh_test' }] }))
    const { NotifyApiError } = await import('../services/notifyApiClient')
    apiMocks.createDiaryShare.mockRejectedValueOnce(new NotifyApiError('network_unavailable', true))
    const repository = withDatabase(new SQLiteDiaryRepository(), db)
    await repository.syncPendingDiaryShares()
    await repository.syncPendingDiaryShares()
    expect(apiMocks.createDiaryShare).toHaveBeenCalledOnce()
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
    run: vi.fn(async (_sql: string, _values?: unknown[]) => ({})),
    query: vi.fn(async (sql: string): Promise<{ values: Record<string, unknown>[] }> => {
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
