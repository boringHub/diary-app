export interface AppSettings {
  diaryShareNotificationMode: 'notify' | 'ask' | 'never'
  notificationEnabled: boolean
  notificationEmail: string
  notificationPendingEmail: string
  notificationEmailVerified: boolean
  notificationChallengeId: string
  notificationChallengeExpiresAt: number
  notificationChallengeResendAvailableAt: number
  notificationSyncPending: boolean
  appearance: 'light'
  themeName: string
  themeId: string
  themeVersion: string
}

const KEY = 'shiguangjian.settings.v1'

const defaults: AppSettings = {
  diaryShareNotificationMode: 'ask',
  notificationEnabled: false,
  notificationEmail: '',
  notificationPendingEmail: '',
  notificationEmailVerified: false,
  notificationChallengeId: '',
  notificationChallengeExpiresAt: 0,
  notificationChallengeResendAvailableAt: 0,
  notificationSyncPending: false,
  appearance: 'light',
  themeName: '记忆星空',
  themeId: 'default',
  themeVersion: '1.0.0',
}

function read(): AppSettings {
  if (typeof localStorage === 'undefined') return { ...defaults }
  const value = localStorage.getItem(KEY)
  if (!value) return defaults

  try {
    const settings = { ...defaults, ...JSON.parse(value) } as AppSettings
    if (!['notify', 'ask', 'never'].includes(settings.diaryShareNotificationMode)) {
      settings.diaryShareNotificationMode = defaults.diaryShareNotificationMode
    }
    if (!settings.notificationEmailVerified && settings.notificationEmail && !settings.notificationPendingEmail) {
      settings.notificationEnabled = false
      settings.notificationPendingEmail = settings.notificationEmail
      settings.notificationEmail = ''
      localStorage.setItem(KEY, JSON.stringify(settings))
    }
    if (settings.themeName === '简约浅色') {
      settings.themeName = defaults.themeName
      localStorage.setItem(KEY, JSON.stringify(settings))
    }
    return settings
  } catch {
    return defaults
  }
}

export const settingsRepository = {
  get(): AppSettings {
    return read()
  },
  update(patch: Partial<AppSettings>): AppSettings {
    const settings = { ...read(), ...patch }
    if (typeof localStorage !== 'undefined') localStorage.setItem(KEY, JSON.stringify(settings))
    return settings
  },
}
