import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { getOrCreateDeviceId } from './diaryEventQueue'
import { deviceKeyAuth, DeviceKeyError } from './deviceKeyAuth'
import { getDeviceStatus, NotifyApiError, registerDevice, type DeviceIdentity } from './notifyApiClient'

const APP_VERSION = '1.3.1'
const DEVICE_ID_KEY = 'device_id'
const DEVICE_PUBLIC_KEY_KEY = 'device_public_key'
const REGISTRATION_STATUS_KEY = 'device_registration_status'
const RECOVERY_SOURCE_KEY = 'device_identity_recovery_source'

export async function ensureDeviceIdentity(db: SQLiteDBConnection): Promise<DeviceIdentity> {
  let deviceId = await getOrCreateDeviceId(db)
  let alias = aliasFor(deviceId)

  let hasKey: boolean
  try {
    hasKey = await deviceKeyAuth.hasKey(alias)
  } catch (error) {
    throw toNotifyError(error)
  }

  let storedPublicKey = await readSetting(db, DEVICE_PUBLIC_KEY_KEY)
  const registrationStatus = await readSetting(db, REGISTRATION_STATUS_KEY)
  if ((!hasKey && (storedPublicKey || registrationStatus === 'registered')) ||
      (registrationStatus === 'registered' && !storedPublicKey)) {
    await rotateIdentity(db, deviceId)
    deviceId = await getOrCreateDeviceId(db)
    alias = aliasFor(deviceId)
    storedPublicKey = ''
  }

  try {
    let result = await deviceKeyAuth.ensureKey(alias)
    if (storedPublicKey && result.publicKey !== storedPublicKey) {
      await rotateIdentity(db, deviceId)
      deviceId = await getOrCreateDeviceId(db)
      alias = aliasFor(deviceId)
      storedPublicKey = ''
      result = await deviceKeyAuth.ensureKey(alias)
    }
    await saveSetting(db, DEVICE_PUBLIC_KEY_KEY, result.publicKey)
    return { deviceId, publicKey: result.publicKey, alias }
  } catch (error) {
    throw toNotifyError(error)
  }
}

async function readSetting(db: SQLiteDBConnection, key: string) {
  const result = await db.query('SELECT value_json FROM app_settings WHERE key = ? LIMIT 1', [key])
  const value = result.values?.[0]?.value_json
  if (typeof value !== 'string') return ''
  try {
    const parsed: unknown = JSON.parse(value)
    return typeof parsed === 'string' ? parsed : ''
  } catch {
    return ''
  }
}

export async function ensureRegisteredDevice(db: SQLiteDBConnection, request: typeof fetch = fetch) {
  let identity = await ensureDeviceIdentity(db)
  const registrationStatus = await readSetting(db, REGISTRATION_STATUS_KEY)
  if (registrationStatus === 'registered') return identity
  if (registrationStatus === 'conflict') throw new NotifyApiError('device_id_conflict', false)
  if (registrationStatus === 'identity_error') throw new NotifyApiError('device_identity_recovery_failed', false)
  try {
    await registerDevice(identity, APP_VERSION, request)
    await saveSetting(db, REGISTRATION_STATUS_KEY, 'registered')
    return identity
  } catch (error) {
    if (error instanceof NotifyApiError && error.message === 'device_id_conflict') {
      await rotateIdentity(db, identity.deviceId)
      identity = await ensureDeviceIdentity(db)
      try {
        await registerDevice(identity, APP_VERSION, request)
        await saveSetting(db, REGISTRATION_STATUS_KEY, 'registered')
        return identity
      } catch (retryError) {
        await saveSetting(db, REGISTRATION_STATUS_KEY, 'conflict')
        throw retryError
      }
    }
    throw error
  }
}

export async function ensureActiveRegisteredDevice(db: SQLiteDBConnection, request: typeof fetch = fetch) {
  let identity = await ensureRegisteredDevice(db, request)
  try {
    const status = await getDeviceStatus(identity, request)
    if (status.status === 'active') {
      await saveSetting(db, RECOVERY_SOURCE_KEY, '')
      return identity
    }
    if (status.status !== 'revoked') throw new NotifyApiError('inactive_device', false)
  } catch (error) {
    if (!(error instanceof NotifyApiError) || !isRecoverableIdentityError(error.message)) throw error
  }

  if (await readSetting(db, RECOVERY_SOURCE_KEY)) {
    await saveSetting(db, REGISTRATION_STATUS_KEY, 'identity_error')
    throw new NotifyApiError('device_identity_recovery_failed', false)
  }
  await saveSetting(db, RECOVERY_SOURCE_KEY, identity.deviceId)
  await rotateIdentity(db, identity.deviceId)
  identity = await ensureRegisteredDevice(db, request)
  try {
    const status = await getDeviceStatus(identity, request)
    if (status.status === 'active') {
      await saveSetting(db, RECOVERY_SOURCE_KEY, '')
      return identity
    }
    if (status.status !== 'revoked') throw new NotifyApiError('inactive_device', false)
    throw new NotifyApiError('revoked_device', false)
  } catch (error) {
    if (error instanceof NotifyApiError && isRecoverableIdentityError(error.message)) {
      await saveSetting(db, REGISTRATION_STATUS_KEY, 'identity_error')
      throw new NotifyApiError('device_identity_recovery_failed', false)
    }
    throw error
  }
}

export async function withRegisteredDevice<T>(db: SQLiteDBConnection, action: (identity: DeviceIdentity) => Promise<T>): Promise<T> {
  const identity = await ensureRegisteredDevice(db)
  try {
    return await action(identity)
  } catch (error) {
    if (!(error instanceof NotifyApiError) || !isRecoverableIdentityError(error.message)) throw error
    return action(await ensureActiveRegisteredDevice(db))
  }
}

export function aliasFor(deviceId: string) {
  return `shiguangjian-device-${deviceId}`
}

async function rotateIdentity(db: SQLiteDBConnection, oldDeviceId: string) {
  await db.run(
    "UPDATE event_queue SET status = 'failed', last_error = 'device_key_lost' WHERE status = 'pending' AND json_extract(payload_json, '$.deviceId') = ?",
    [oldDeviceId],
    false,
  )
  const deviceId = `dvc_${crypto.randomUUID()}`
  await saveSetting(db, DEVICE_ID_KEY, deviceId)
  await saveSetting(db, DEVICE_PUBLIC_KEY_KEY, '')
  await saveSetting(db, REGISTRATION_STATUS_KEY, 'unregistered')
  try {
    await deviceKeyAuth.deleteKey(aliasFor(oldDeviceId))
  } catch {
    // Identity rotation must remain possible when the old Keystore entry is already gone.
  }
}

function isRecoverableIdentityError(message: string) {
  return message === 'unknown_device' || message === 'revoked_device'
}

async function saveSetting(db: SQLiteDBConnection, key: string, value: string) {
  await db.run(
    `INSERT INTO app_settings (key, value_json, updated_at) VALUES (?, ?, ?)
     ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
    [key, JSON.stringify(value), Date.now()],
    false,
  )
}

function toNotifyError(error: unknown) {
  if (error instanceof DeviceKeyError) {
    return new NotifyApiError(error.code, error.code === 'KEYSTORE_UNAVAILABLE' || error.code === 'SIGN_FAILED')
  }
  return error
}
