import { Capacitor, registerPlugin } from '@capacitor/core'

interface DeviceKeyAuthPlugin {
  ensureKey(options: { alias: string }): Promise<{ publicKey: string }>
  sign(options: { alias: string; dataBase64: string }): Promise<{ signatureBase64: string }>
  hasKey(options: { alias: string }): Promise<{ exists: boolean }>
  deleteKey(options: { alias: string }): Promise<void>
}

export type DeviceKeyErrorCode = 'KEY_NOT_FOUND' | 'SIGN_FAILED' | 'KEYSTORE_UNAVAILABLE'

export class DeviceKeyError extends Error {
  constructor(readonly code: DeviceKeyErrorCode, cause?: unknown) {
    super(code, cause === undefined ? undefined : { cause })
    this.name = 'DeviceKeyError'
  }
}

const NativeDeviceKeyAuth = registerPlugin<DeviceKeyAuthPlugin>('DeviceKeyAuth')

export const deviceKeyAuth = {
  async ensureKey(alias: string) {
    assertAndroid()
    return invoke(() => NativeDeviceKeyAuth.ensureKey({ alias }))
  },
  async sign(alias: string, dataBase64: string) {
    assertAndroid()
    const result = await invoke(() => NativeDeviceKeyAuth.sign({ alias, dataBase64 }))
    return result.signatureBase64
  },
  async hasKey(alias: string) {
    assertAndroid()
    const result = await invoke(() => NativeDeviceKeyAuth.hasKey({ alias }))
    return result.exists
  },
  async deleteKey(alias: string) {
    assertAndroid()
    await invoke(() => NativeDeviceKeyAuth.deleteKey({ alias }))
  },
}

function assertAndroid() {
  if (!Capacitor.isNativePlatform() || Capacitor.getPlatform() !== 'android') {
    throw new DeviceKeyError('KEYSTORE_UNAVAILABLE')
  }
}

async function invoke<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation()
  } catch (error) {
    const code = readCode(error)
    throw new DeviceKeyError(code, error)
  }
}

function readCode(error: unknown): DeviceKeyErrorCode {
  if (error && typeof error === 'object' && 'code' in error) {
    const code = String(error.code)
    if (code === 'KEY_NOT_FOUND' || code === 'SIGN_FAILED' || code === 'KEYSTORE_UNAVAILABLE') return code
  }
  return 'KEYSTORE_UNAVAILABLE'
}
