import { Capacitor } from '@capacitor/core'
import { readonly, shallowRef } from 'vue'
import { settingsRepository } from '../repositories/settingsRepository'

export interface ThemeManifest {
  schemaVersion: 1
  id: string
  version: string
  name: string
  description: string
  previewColor: string
  colors: {
    background: string
    surface: string
    primary: string
    text: string
  }
}

export interface ThemePresentation {
  manifest: ThemeManifest
  cssVariables: Record<string, string>
}

export const THEME_MANIFEST_STORAGE_KEY = 'shiguangjian.theme-manifests.v1'

const manifests: ThemeManifest[] = [
  {
    schemaVersion: 1,
    id: 'default',
    version: '1.0.0',
    name: '记忆星空',
    description: '深一点的夜色，把每颗心事照顾好。',
    previewColor: '#173b4d',
    colors: { background: '#07131f', surface: '#0b2032', primary: '#81d3bd', text: '#e8f4f2' },
  },
  {
    schemaVersion: 1,
    id: 'mist-paper',
    version: '1.0.0',
    name: '晨雾纸笺',
    description: '清淡、安静，适合记录日常。',
    previewColor: '#b8cbbf',
    colors: { background: '#e7eee8', surface: '#fbfdf9', primary: '#60766b', text: '#27332c' },
  },
  {
    schemaVersion: 1,
    id: 'sunset-post',
    version: '1.0.0',
    name: '晚风邮局',
    description: '将一天的心事寄给温柔的晚霞。',
    previewColor: '#a97778',
    colors: { background: '#241d2a', surface: '#382b38', primary: '#e7aaa0', text: '#fff0e9' },
  },
]

const activeTheme = shallowRef<ThemeManifest>()

export function parseThemeManifest(value: unknown): ThemeManifest {
  if (!value || typeof value !== 'object') throw new Error('主题清单格式不对哦')
  const manifest = value as Partial<ThemeManifest>
  const colors = manifest.colors
  if (
    manifest.schemaVersion !== 1
    || !isSafeId(manifest.id)
    || !isVersion(manifest.version)
    || !isText(manifest.name)
    || !colors
    || !isHexColor(colors.background)
    || !isHexColor(colors.surface)
    || !isHexColor(colors.primary)
    || !isHexColor(colors.text)
  ) {
    throw new Error('主题清单版本暂时不支持')
  }

  if (manifest.previewColor !== undefined && !isHexColor(manifest.previewColor)) {
    throw new Error('主题预览颜色格式不对哦')
  }

  return {
    schemaVersion: 1,
    id: manifest.id,
    version: manifest.version,
    name: manifest.name,
    description: isText(manifest.description) ? manifest.description : '',
    previewColor: isText(manifest.previewColor) ? manifest.previewColor : colors.background,
    colors: { ...colors },
  }
}

export function listThemeManifests() {
  return [...listBuiltInThemeManifests(), ...readImportedManifests()]
    .map((manifest) => parseThemeManifest(manifest))
    .filter((manifest, index, all) => all.findIndex((item) => item.id === manifest.id && item.version === manifest.version) === index)
}

export function listBuiltInThemeManifests() {
  return manifests.map((manifest) => parseThemeManifest(manifest))
}

export function findThemeManifest(id: string, version = '1.0.0') {
  const manifest = listThemeManifests().find((item) => item.id === id && item.version === version)
  return manifest ? parseThemeManifest(manifest) : undefined
}

export async function importThemeManifest(value: unknown) {
  const manifest = parseThemeManifest(value)
  if (listThemeManifests().some((item) => item.id === manifest.id && item.version === manifest.version)) {
    throw new Error('这个主题版本已经收好啦，不会覆盖原来的文件')
  }
  const previous = typeof localStorage === 'undefined' ? null : localStorage.getItem(THEME_MANIFEST_STORAGE_KEY)
  const imported = readImportedManifests()
  imported.push(manifest)
  if (typeof localStorage !== 'undefined') localStorage.setItem(THEME_MANIFEST_STORAGE_KEY, JSON.stringify(imported))
  if (Capacitor.isNativePlatform()) {
    try {
      const { indexImportedTheme } = await import('../repositories/sqliteThemeRepository')
      await indexImportedTheme(manifest)
    } catch (error) {
      if (typeof localStorage !== 'undefined') {
        if (previous === null) localStorage.removeItem(THEME_MANIFEST_STORAGE_KEY)
        else localStorage.setItem(THEME_MANIFEST_STORAGE_KEY, previous)
      }
      throw error
    }
  }
  return manifest
}

export function getThemeManifest(id: string, version = '1.0.0') {
  return findThemeManifest(id, version) ?? parseThemeManifest(manifests[0])
}

export function getThemePresentation(id: string, version = '1.0.0'): ThemePresentation {
  const manifest = getThemeManifest(id, version)
  return {
    manifest,
    cssVariables: {
      '--app-theme-background': manifest.colors.background,
      '--app-theme-surface': manifest.colors.surface,
      '--app-theme-primary': manifest.colors.primary,
      '--app-theme-text': manifest.colors.text,
    },
  }
}

export function getCurrentTheme() {
  const settings = settingsRepository.get()
  return getThemeManifest(settings.themeId ?? 'default', settings.themeVersion ?? '1.0.0')
}

export function useCurrentTheme() {
  activeTheme.value = getCurrentTheme()
  return readonly(activeTheme)
}

export function selectTheme(id: string, version: string) {
  const manifest = findThemeManifest(id, version)
  if (!manifest) throw new Error('这套主题暂时找不到啦')
  settingsRepository.update({ themeName: manifest.name, themeId: manifest.id, themeVersion: manifest.version })
  activeTheme.value = manifest
  return manifest
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0
}

function isSafeId(value: unknown): value is string {
  return isText(value) && /^[a-z0-9][a-z0-9._-]*$/i.test(value)
}

function isVersion(value: unknown): value is string {
  return isText(value) && /^\d+\.\d+\.\d+(?:-[0-9a-z.-]+)?$/i.test(value)
}

function isHexColor(value: unknown): value is string {
  return isText(value) && /^#[0-9a-f]{6}$/i.test(value)
}

function readImportedManifests(): ThemeManifest[] {
  if (typeof localStorage === 'undefined') return []
  const raw = localStorage.getItem(THEME_MANIFEST_STORAGE_KEY)
  if (!raw) return []
  try {
    const value: unknown = JSON.parse(raw)
    if (!Array.isArray(value)) return []
    return value.flatMap((item) => {
      try {
        return [parseThemeManifest(item)]
      } catch {
        return []
      }
    })
  } catch {
    return []
  }
}
