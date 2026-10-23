import { Capacitor, registerPlugin } from '@capacitor/core'
import type { ThemePresentation } from './themeService'

export const APPEARANCE_STORAGE_KEY = 'shiguangjian.appearance.v1'

interface AppearanceOptions {
  backgroundColor: string
  themeBackgroundColor: string
}

const AppAppearance = registerPlugin<{ apply(options: AppearanceOptions): Promise<void> }>('AppAppearance')

// Choose whichever of black/white has the higher contrast against the background.
export function isDarkBackground(color: string) {
  const channels = color.slice(1).match(/.{2}/g)!.map((hex) => {
    const value = parseInt(hex, 16) / 255
    return value <= .04045 ? value / 12.92 : ((value + .055) / 1.055) ** 2.4
  })
  return channels[0]! * .2126 + channels[1]! * .7152 + channels[2]! * .0722 < .179
}

export async function syncSystemAppearance(presentation: ThemePresentation, tarot = false) {
  const themeBackgroundColor = presentation.manifest.colors.background
  const backgroundColor = tarot ? presentation.cssVariables['--tarot-bg'] ?? themeBackgroundColor : themeBackgroundColor
  const root = document.documentElement
  for (const [name, value] of Object.entries(presentation.cssVariables)) root.style.setProperty(name, value)
  root.style.setProperty('--app-shell-background', backgroundColor)
  root.style.colorScheme = isDarkBackground(backgroundColor) ? 'dark' : 'light'
  document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', backgroundColor)

  // Cache the theme, rather than a temporary page background, for the next cold start.
  try {
    const cached = JSON.stringify({
      backgroundColor: themeBackgroundColor,
      colorScheme: isDarkBackground(themeBackgroundColor) ? 'dark' : 'light',
    })
    if (localStorage.getItem(APPEARANCE_STORAGE_KEY) !== cached) localStorage.setItem(APPEARANCE_STORAGE_KEY, cached)
  } catch {
    // Storage may be unavailable in private browser previews; appearance still works.
  }

  if (Capacitor.getPlatform() === 'android') {
    try {
      await AppAppearance.apply({ backgroundColor, themeBackgroundColor })
    } catch (error) {
      console.warn('Unable to synchronize native app appearance', error)
    }
  }
}
