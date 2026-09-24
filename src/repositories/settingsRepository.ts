export interface AppSettings {
  notificationEnabled: boolean
  notificationEmail: string
  appearance: 'light'
  themeName: string
  themeId: string
  themeVersion: string
}

const KEY = 'shiguangjian.settings.v1'

const defaults: AppSettings = {
  notificationEnabled: true,
  notificationEmail: '',
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
