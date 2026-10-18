import initSqlJs, { type Database } from 'sql.js'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const keyAuth = vi.hoisted(() => ({
  hasKey: vi.fn(),
  ensureKey: vi.fn(),
  deleteKey: vi.fn(),
}))

vi.mock('./deviceKeyAuth', () => ({
  deviceKeyAuth: keyAuth,
  DeviceKeyError: class DeviceKeyError extends Error {
    constructor(readonly code: string) {
      super(code)
    }
  },
}))

import { ensureDeviceIdentity, ensureRegisteredDevice, withRegisteredDevice } from './deviceIdentity'
import { NotifyApiError } from './notifyApiClient'

describe('device identity', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    keyAuth.hasKey.mockResolvedValue(true)
    keyAuth.ensureKey.mockResolvedValue({ publicKey: 'new-public-key' })
    keyAuth.deleteKey.mockResolvedValue(undefined)
  })

  it('skips registration after the server registration is stored', async () => {
    const { db, database } = await createDatabase({
      device_id: 'dvc_existing',
      device_public_key: 'stable-public-key',
      device_registration_status: 'registered',
    })
    keyAuth.ensureKey.mockResolvedValue({ publicKey: 'stable-public-key' })
    const request = vi.fn<typeof fetch>()

    await expect(ensureRegisteredDevice(database, request)).resolves.toMatchObject({ deviceId: 'dvc_existing' })

    expect(request).not.toHaveBeenCalled()
    db.close()
  })

  it('uses the business response without a device status preflight', async () => {
    const { db, database } = await createDatabase({
      device_id: 'dvc_existing', device_public_key: 'stable-public-key', device_registration_status: 'registered',
    })
    keyAuth.ensureKey.mockResolvedValue({ publicKey: 'stable-public-key' })
    const request = vi.fn<typeof fetch>()
    vi.stubGlobal('fetch', request)
    try {
      const action = vi.fn(async () => ({ status: 'queued' }))
      await expect(withRegisteredDevice(database, action)).resolves.toEqual({ status: 'queued' })
      expect(action).toHaveBeenCalledOnce()
      expect(request).not.toHaveBeenCalled()
      const refused = vi.fn(async () => { throw new NotifyApiError('share_authorization_required', false) })
      await expect(withRegisteredDevice(database, refused)).rejects.toThrow('share_authorization_required')
      expect(refused).toHaveBeenCalledOnce()
      expect(request).not.toHaveBeenCalled()
    } finally {
      vi.unstubAllGlobals()
      db.close()
    }
  })

  it('does not retry network recovery after identity recovery reaches a terminal state', async () => {
    const { db, database } = await createDatabase({
      device_id: 'dvc_failed_recovery',
      device_public_key: 'stable-public-key',
      device_registration_status: 'identity_error',
      device_identity_recovery_source: 'dvc_original',
    })
    keyAuth.ensureKey.mockResolvedValue({ publicKey: 'stable-public-key' })
    const request = vi.fn<typeof fetch>()

    await expect(ensureRegisteredDevice(database, request)).rejects.toThrow('device_identity_recovery_failed')

    expect(request).not.toHaveBeenCalled()
    db.close()
  })

  it('rotates the identity and terminally fails old queued events after private-key loss', async () => {
    const { db, database } = await createDatabase({
      device_id: 'dvc_old',
      device_public_key: 'old-public-key',
      device_registration_status: 'registered',
    })
    db.run(`INSERT INTO event_queue (id, event_type, payload_json, created_at) VALUES
      ('event-old', 'diary_created', ?, 1)`, [JSON.stringify({ deviceId: 'dvc_old' })])
    keyAuth.hasKey.mockResolvedValueOnce(false).mockResolvedValueOnce(true)

    const identity = await ensureDeviceIdentity(database)

    expect(identity.deviceId).toMatch(/^dvc_[\w-]+$/)
    expect(identity.deviceId).not.toBe('dvc_old')
    expect(db.exec("SELECT status, last_error FROM event_queue WHERE id = 'event-old'")[0]?.values[0])
      .toEqual(['failed', 'device_key_lost'])
    expect(keyAuth.deleteKey).toHaveBeenCalledWith('shiguangjian-device-dvc_old')
    db.close()
  })

  it('does not reuse a device id when the Keystore public key changed', async () => {
    const { db, database } = await createDatabase({
      device_id: 'dvc_mismatch',
      device_public_key: 'stored-public-key',
      device_registration_status: 'registered',
    })
    keyAuth.ensureKey
      .mockResolvedValueOnce({ publicKey: 'unexpected-public-key' })
      .mockResolvedValueOnce({ publicKey: 'replacement-public-key' })

    const identity = await ensureDeviceIdentity(database)

    expect(identity.deviceId).not.toBe('dvc_mismatch')
    expect(identity.publicKey).toBe('replacement-public-key')
    expect(keyAuth.deleteKey).toHaveBeenCalledWith('shiguangjian-device-dvc_mismatch')
    db.close()
  })
})

async function createDatabase(settings: Record<string, string>) {
  const SQL = await initSqlJs({ locateFile: (file) => `node_modules/sql.js/dist/${file}` })
  const db = new SQL.Database()
  db.run(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value_json TEXT NOT NULL, updated_at INTEGER NOT NULL);
    CREATE TABLE event_queue (
      id TEXT PRIMARY KEY, event_type TEXT NOT NULL, payload_json TEXT NOT NULL,
      created_at INTEGER NOT NULL, retry_count INTEGER NOT NULL DEFAULT 0,
      last_attempt_at INTEGER, sent_at INTEGER, status TEXT NOT NULL DEFAULT 'pending', last_error TEXT
    );`)
  for (const [key, value] of Object.entries(settings)) {
    db.run('INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, 1)', [key, JSON.stringify(value)])
  }
  return { db, database: sqlJsConnection(db) }
}

function sqlJsConnection(db: Database) {
  return {
    async query(statement: string, values: unknown[] = []) {
      const result = db.exec(statement, values as (string | number | null)[])
      const first = result[0]
      return { values: first?.values.map((row) => Object.fromEntries(first.columns.map((column, index) => [column, row[index]]))) ?? [] }
    },
    async run(statement: string, values: unknown[] = []) {
      db.run(statement, values as (string | number | null)[])
      return {}
    },
  } as unknown as import('@capacitor-community/sqlite').SQLiteDBConnection
}
