import { App } from '@capacitor/app'
import { Capacitor } from '@capacitor/core'
import { Network } from '@capacitor/network'
import { diaryRepository } from '../repositories/diaryRepository'
import { isNotificationServiceConfigured } from './notifyApiClient'

let listenersRegistered = false
let syncInProgress = false

export function startNotificationSync() {
  if (!Capacitor.isNativePlatform() || !isNotificationServiceConfigured() || listenersRegistered) return
  listenersRegistered = true

  void syncWhenOnline()
  void App.addListener('appStateChange', ({ isActive }) => {
    if (isActive) void syncWhenOnline()
  })
  void Network.addListener('networkStatusChange', ({ connected }) => {
    if (connected) void syncWhenOnline()
  })
}

async function syncWhenOnline() {
  if (syncInProgress) return
  syncInProgress = true
  try {
    const status = await Network.getStatus()
    if (status.connected) {
      await diaryRepository.syncPendingNotificationSettings()
      await diaryRepository.syncPendingNotificationEvents()
    }
  } catch {
    // A failed sync must not interfere with local diary use.
  } finally {
    syncInProgress = false
  }
}
