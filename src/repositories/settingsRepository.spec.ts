import { beforeEach, describe, expect, it, vi } from 'vitest'
import { settingsRepository } from './settingsRepository'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('settingsRepository', () => {
  let storage: MemoryStorage

  beforeEach(() => {
    storage = new MemoryStorage()
    vi.stubGlobal('localStorage', storage)
  })

  it('keeps a legacy local email as an unverified candidate', () => {
    storage.setItem('shiguangjian.settings.v1', JSON.stringify({
      notificationEnabled: true,
      notificationEmail: 'owner@example.com',
    }))

    expect(settingsRepository.get()).toMatchObject({
      notificationEnabled: false,
      notificationEmail: '',
      notificationPendingEmail: 'owner@example.com',
      notificationEmailVerified: false,
      notificationChallengeId: '',
    })
  })

  it('defaults email reminders to disabled', () => {
    expect(settingsRepository.get()).toMatchObject({
      notificationEnabled: false,
      notificationEmailVerified: false,
      notificationSyncPending: false,
    })
  })

  it('restores a pending verification challenge', () => {
    settingsRepository.update({
      notificationPendingEmail: 'owner@example.com',
      notificationChallengeId: 'emv_pending',
      notificationChallengeExpiresAt: 1_790_000_600_000,
      notificationChallengeResendAvailableAt: 1_790_000_060_000,
    })

    expect(settingsRepository.get()).toMatchObject({
      notificationPendingEmail: 'owner@example.com',
      notificationChallengeId: 'emv_pending',
      notificationChallengeExpiresAt: 1_790_000_600_000,
      notificationChallengeResendAvailableAt: 1_790_000_060_000,
    })
  })
})
