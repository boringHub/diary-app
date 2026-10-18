import { reactive } from 'vue'
import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { toastController } from '@ionic/vue'
import { diaryRepository } from '../repositories/diaryRepository'
import { isNotificationServiceConfigured, NotifyApiError } from './notifyApiClient'

export const diaryShareSyncState = reactive({
  checking: false,
  error: '',
  checkedAt: 0,
  nextCheckAt: null as number | null,
})

let listenersRegistered = false
let syncPromise: Promise<void> | undefined
let syncTimer: ReturnType<typeof setTimeout> | undefined
let appIsActive = true
const SYNC_INTERVAL_MS = 5 * 60_000
let nextSyncAt = 0

export function startNotificationSync() {
  if (!Capacitor.isNativePlatform() || !isNotificationServiceConfigured() || listenersRegistered) return
  listenersRegistered = true

  void refreshDiaryShareStatus()
  void App.addListener('appStateChange', ({ isActive }) => {
    appIsActive = isActive
    if (isActive) void refreshDiaryShareStatus()
    else if (syncTimer !== undefined) {
      clearTimeout(syncTimer)
      syncTimer = undefined
    }
  })
  void Network.addListener('networkStatusChange', ({ connected }) => {
    if (connected && appIsActive) void refreshDiaryShareStatus()
  })
}

export function refreshDiaryShareStatus(): Promise<void> {
  if (!Capacitor.isNativePlatform() || !isNotificationServiceConfigured()) return Promise.resolve()
  if (syncPromise) return syncPromise
  if (Date.now() < nextSyncAt) {
    if (syncTimer === undefined) scheduleSync(Math.max(nextSyncAt, diaryShareSyncState.nextCheckAt ?? 0))
    return Promise.resolve()
  }
  syncPromise = syncWhenOnline().finally(() => { syncPromise = undefined })
  return syncPromise
}

function scheduleSync(at: number) {
  if (syncTimer !== undefined) clearTimeout(syncTimer)
  if (!appIsActive) return
  syncTimer = setTimeout(() => {
    syncTimer = undefined
    void refreshDiaryShareStatus()
  }, Math.max(1, at - Date.now()))
}

async function syncWhenOnline() {
  diaryShareSyncState.checking = true
  let nextCheckAt = Date.now() + SYNC_INTERVAL_MS
  try {
    const status = await Network.getStatus()
    if (!status.connected) {
      diaryShareSyncState.error = 'network_unavailable'
      return
    }
    nextSyncAt = Date.now() + 30_000
    await diaryRepository.syncPendingNotificationSettings().catch(() => undefined)
    await diaryRepository.syncPendingNotificationEvents().catch(() => undefined)
    await diaryRepository.syncPendingDiaryShares().catch(() => undefined)
    try {
      const result = await diaryRepository.syncDiaryShareReceipts()
      diaryShareSyncState.nextCheckAt = result.nextCheckAt
      if (result.nextCheckAt !== null) nextCheckAt = result.nextCheckAt
      if (result.checked) {
        diaryShareSyncState.checkedAt = Date.now()
        diaryShareSyncState.error = ''
      }
      window.dispatchEvent(new CustomEvent('diary-share-updated'))
      if (result.notices.length > 0) {
        const notice = result.notices[0]!
        const message = result.notices.length === 1
          ? `对方看到《${notice.title || '未命名日记'}》啦`
          : `有 ${result.notices.length} 篇日记被对方看到啦`
        await toastController.create({ message, duration: 2600, position: 'top' })
          .then((toast) => toast.present()).catch(() => undefined)
      }
    } catch (error) {
      diaryShareSyncState.error = error instanceof NotifyApiError ? error.message : 'local_sync_failed'
      diaryShareSyncState.nextCheckAt = Date.now() + SYNC_INTERVAL_MS
      nextCheckAt = diaryShareSyncState.nextCheckAt
      window.dispatchEvent(new CustomEvent('diary-share-updated'))
    }
  } catch {
    diaryShareSyncState.error = 'network_unavailable'
  } finally {
    diaryShareSyncState.checking = false
    // Schedule after async work using the persisted due time. Two fixed five-minute
    // clocks can otherwise miss each other and skip an entire polling cycle.
    scheduleSync(Math.max(nextSyncAt, nextCheckAt))
  }
}
