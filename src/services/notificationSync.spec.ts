import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({
  native: vi.fn(),
  configured: vi.fn(),
  appListener: vi.fn(),
  networkListener: vi.fn(),
  getStatus: vi.fn(),
  settings: vi.fn(),
  events: vi.fn(),
  shares: vi.fn(),
  receipts: vi.fn(),
  toast: vi.fn(),
}))

vi.mock('@capacitor/core', async (importOriginal) => ({
  ...await importOriginal<typeof import('@capacitor/core')>(),
  Capacitor: { isNativePlatform: mocks.native },
}))
vi.mock('@capacitor/app', () => ({ App: { addListener: mocks.appListener } }))
vi.mock('@capacitor/network', () => ({ Network: { addListener: mocks.networkListener, getStatus: mocks.getStatus } }))
vi.mock('./appToast', () => ({ showAppToast: mocks.toast }))
vi.mock('../features/tarot/services/tarotAiClient', () => ({ flushTarotCleanup: vi.fn().mockResolvedValue(undefined) }))
vi.mock('./notifyApiClient', async (importOriginal) => ({
  ...await importOriginal<typeof import('./notifyApiClient')>(),
  isNotificationServiceConfigured: mocks.configured,
}))
vi.mock('../repositories/diaryRepository', () => ({
  diaryRepository: {
    syncPendingNotificationSettings: mocks.settings,
    syncPendingNotificationEvents: mocks.events,
    syncPendingDiaryShares: mocks.shares,
    syncDiaryShareReceipts: mocks.receipts,
  },
}))

describe('notification sync scheduling', () => {
  beforeEach(() => {
    vi.resetModules()
    vi.resetAllMocks()
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-18T00:00:00Z'))
    vi.stubGlobal('window', { dispatchEvent: vi.fn() })
    mocks.native.mockReturnValue(true)
    mocks.configured.mockReturnValue(true)
    mocks.getStatus.mockResolvedValue({ connected: true })
    mocks.settings.mockResolvedValue(undefined)
    mocks.events.mockResolvedValue(undefined)
    mocks.shares.mockResolvedValue(undefined)
    mocks.receipts.mockResolvedValue({ notices: [], checked: false, nextCheckAt: null })
  })

  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
    vi.unstubAllGlobals()
  })

  it('continues diary sharing when the user email settings and event sync fail', async () => {
    mocks.settings.mockRejectedValue(new Error('email settings unavailable'))
    mocks.events.mockRejectedValue(new Error('legacy event unavailable'))
    const { startNotificationSync } = await import('./notificationSync')

    startNotificationSync()
    await vi.advanceTimersByTimeAsync(0)

    expect(mocks.shares).toHaveBeenCalledOnce()
    expect(mocks.receipts).toHaveBeenCalledOnce()
  })

  it('coalesces foreground and network triggers and uses a five-minute timer', async () => {
    const { startNotificationSync } = await import('./notificationSync')
    startNotificationSync()
    startNotificationSync()
    await vi.advanceTimersByTimeAsync(0)
    const onActive = mocks.appListener.mock.calls[0]![1]
    const onNetwork = mocks.networkListener.mock.calls[0]![1]

    onActive({ isActive: true })
    onNetwork({ connected: true })
    await vi.advanceTimersByTimeAsync(0)
    expect(mocks.shares).toHaveBeenCalledOnce()
    expect(mocks.appListener).toHaveBeenCalledOnce()

    await vi.advanceTimersByTimeAsync(5 * 60_000 - 1)
    expect(mocks.shares).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.shares).toHaveBeenCalledTimes(2)

    onActive({ isActive: false })
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(mocks.shares).toHaveBeenCalledTimes(2)
  })

  it('does not start background requests on the web', async () => {
    mocks.native.mockReturnValue(false)
    const { startNotificationSync } = await import('./notificationSync')
    startNotificationSync()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(mocks.getStatus).not.toHaveBeenCalled()
    expect(mocks.shares).not.toHaveBeenCalled()
  })

  it('restores the receipt timer when returning to the foreground during the trigger cooldown', async () => {
    const dueAt = Date.now() + 5 * 60_000
    mocks.receipts.mockResolvedValue({ notices: [], checked: true, nextCheckAt: dueAt })
    const { startNotificationSync } = await import('./notificationSync')
    startNotificationSync()
    await vi.advanceTimersByTimeAsync(0)
    const onActive = mocks.appListener.mock.calls[0]![1]
    onActive({ isActive: false })
    await vi.advanceTimersByTimeAsync(10_000)
    onActive({ isActive: true })
    await vi.advanceTimersByTimeAsync(5 * 60_000 - 10_000 - 1)
    expect(mocks.receipts).toHaveBeenCalledOnce()
    mocks.receipts.mockResolvedValue({ notices: [], checked: true, nextCheckAt: null })
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.receipts).toHaveBeenCalledTimes(2)
  })

  it('uses the saved receipt due time after a restart instead of waiting another whole interval', async () => {
    const dueAt = Date.now() + 2 * 60_000
    mocks.receipts.mockResolvedValue({ notices: [], checked: false, nextCheckAt: dueAt })
    const { startNotificationSync } = await import('./notificationSync')
    startNotificationSync()
    await vi.advanceTimersByTimeAsync(0)
    await vi.advanceTimersByTimeAsync(2 * 60_000 - 1)
    expect(mocks.receipts).toHaveBeenCalledOnce()
    mocks.receipts.mockResolvedValue({ notices: [], checked: true, nextCheckAt: Date.now() + 5 * 60_000 })
    await vi.advanceTimersByTimeAsync(1)
    expect(mocks.receipts).toHaveBeenCalledTimes(2)
  })

  it('does not miss a cycle when async work delays the first receipt check', async () => {
    mocks.shares.mockImplementationOnce(() => new Promise((resolve) => setTimeout(resolve, 4000)))
    mocks.receipts.mockImplementation(async () => ({ notices: [], checked: true, nextCheckAt: Date.now() + 5 * 60_000 }))
    const { startNotificationSync } = await import('./notificationSync')
    startNotificationSync()
    await vi.advanceTimersByTimeAsync(4000)
    expect(mocks.receipts).toHaveBeenCalledOnce()
    await vi.advanceTimersByTimeAsync(5 * 60_000)
    expect(mocks.receipts).toHaveBeenCalledTimes(2)
  })

  it('shares one in-flight refresh with manual requests and surfaces failures without resending diaries', async () => {
    const { NotifyApiError } = await import('./notifyApiClient')
    mocks.receipts.mockRejectedValueOnce(new NotifyApiError('invalid_server_response', false))
    const { refreshDiaryShareStatus, diaryShareSyncState } = await import('./notificationSync')
    const first = refreshDiaryShareStatus()
    expect(refreshDiaryShareStatus()).toBe(first)
    await first
    expect(diaryShareSyncState.error).toBe('invalid_server_response')
    expect(diaryShareSyncState.nextCheckAt).toBe(Date.now() + 5 * 60_000)
    expect(mocks.receipts).toHaveBeenCalledOnce()
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'diary-share-updated' }))
    expect(mocks.toast).not.toHaveBeenCalled()
  })

  it('notifies the view and presents the first-read notice after a successful sync', async () => {
    mocks.receipts.mockResolvedValue({
      notices: [{ diaryId: 'diary-1', title: '今天', readAt: Date.now() }], checked: true, nextCheckAt: null,
    })
    const { refreshDiaryShareStatus, diaryShareSyncState } = await import('./notificationSync')
    await refreshDiaryShareStatus()
    expect(diaryShareSyncState.checkedAt).toBe(Date.now())
    expect(diaryShareSyncState.error).toBe('')
    expect(window.dispatchEvent).toHaveBeenCalledWith(expect.objectContaining({ type: 'diary-share-updated' }))
    expect(mocks.toast).toHaveBeenCalledWith('对方看到《今天》啦', 2600)
  })
})
