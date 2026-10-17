import { beforeEach, describe, expect, it, vi } from 'vitest'

const capacitor = vi.hoisted(() => ({
  isNativePlatform: vi.fn(),
  getPlatform: vi.fn(),
  ensureKey: vi.fn(),
}))

vi.mock('@capacitor/core', () => ({
  Capacitor: {
    isNativePlatform: capacitor.isNativePlatform,
    getPlatform: capacitor.getPlatform,
  },
  registerPlugin: () => ({
    ensureKey: capacitor.ensureKey,
    sign: vi.fn(),
    hasKey: vi.fn(),
    deleteKey: vi.fn(),
  }),
}))

import { deviceKeyAuth } from './deviceKeyAuth'

describe('device key auth bridge', () => {
  beforeEach(() => vi.clearAllMocks())

  it('does not create a production identity outside native Android', async () => {
    capacitor.isNativePlatform.mockReturnValue(false)
    capacitor.getPlatform.mockReturnValue('web')

    await expect(deviceKeyAuth.ensureKey('shiguangjian-device-dvc_browser')).rejects.toThrow('KEYSTORE_UNAVAILABLE')
    expect(capacitor.ensureKey).not.toHaveBeenCalled()
  })
})
