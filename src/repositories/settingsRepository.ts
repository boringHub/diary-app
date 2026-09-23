export interface AppSettings {
  notificationEnabled: boolean
  notificationEmail: string
  appearance: 'light'
  themeName: string
}

const KEY = 'shiguangjian.settings.v1'

const defaults: AppSettings = {
  notificationEnabled: true,
  notificationEmail: '',
  appearance: 'light',
  themeName: '记忆星空',
}

function read(): AppSettings {
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
    localStorage.setItem(KEY, JSON.stringify(settings))
    return settings
  },
}
