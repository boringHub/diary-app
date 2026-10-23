import { readFileSync } from 'node:fs'
import { runInNewContext } from 'node:vm'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { getThemePresentation } from './themeService'
import { APPEARANCE_STORAGE_KEY, isDarkBackground, syncSystemAppearance } from './systemAppearance'

const native = vi.hoisted(() => ({ platform: 'web', apply: vi.fn() }))
vi.mock('@capacitor/core', () => ({
  Capacitor: { getPlatform: () => native.platform, isNativePlatform: () => native.platform !== 'web' },
  registerPlugin: () => ({ apply: native.apply }),
}))

describe('system appearance', () => {
  let values: Map<string, string>
  let styles: Map<string, string>
  let root: { style: { setProperty: (name: string, value: string) => void; colorScheme: string } }
  let meta: { content: string; setAttribute: (name: string, value: string) => void }

  beforeEach(() => {
    native.platform = 'web'
    native.apply.mockReset().mockResolvedValue(undefined)
    values = new Map()
    styles = new Map()
    root = { style: { setProperty: (name, value) => { styles.set(name, value) }, colorScheme: '' } }
    meta = { content: '', setAttribute: (_name, value) => { meta.content = value } }
    vi.stubGlobal('document', { documentElement: root, querySelector: () => meta })
    vi.stubGlobal('localStorage', {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => { values.set(key, value) },
    })
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    vi.restoreAllMocks()
  })

  it.each([
    ['default', '#07131f', 'dark'],
    ['mist-paper', '#e7eee8', 'light'],
    ['sunset-post', '#241d2a', 'dark'],
  ])('synchronizes %s across the document and Android backing layers', async (theme, color, scheme) => {
    native.platform = 'android'
    await syncSystemAppearance(getThemePresentation(theme))
    expect(styles.get('--app-shell-background')).toBe(color)
    expect(styles.get('--app-theme-background')).toBe(color)
    expect(root.style.colorScheme).toBe(scheme)
    expect(meta.content).toBe(color)
    expect(native.apply).toHaveBeenLastCalledWith({ backgroundColor: color, themeBackgroundColor: color })
  })

  it('uses the independent page color and restores the theme on return', async () => {
    native.platform = 'android'
    const presentation = getThemePresentation('default')
    await syncSystemAppearance(presentation, true)
    expect(styles.get('--app-shell-background')).toBe('#131f29')
    expect(native.apply).toHaveBeenLastCalledWith({ backgroundColor: '#131f29', themeBackgroundColor: '#07131f' })
    expect(JSON.parse(values.get(APPEARANCE_STORAGE_KEY)!)).toEqual({ backgroundColor: '#07131f', colorScheme: 'dark' })
    await syncSystemAppearance(presentation)
    expect(styles.get('--app-shell-background')).toBe('#07131f')
    expect(native.apply).toHaveBeenLastCalledWith({ backgroundColor: '#07131f', themeBackgroundColor: '#07131f' })
  })

  it('updates browser previews without calling the Android bridge', async () => {
    await syncSystemAppearance(getThemePresentation('mist-paper'))
    expect(root.style.colorScheme).toBe('light')
    expect(native.apply).not.toHaveBeenCalled()
  })

  it('keeps Android updates working when browser storage is unavailable', async () => {
    native.platform = 'android'
    const presentation = getThemePresentation('mist-paper')
    vi.stubGlobal('localStorage', { getItem: () => { throw new Error('storage unavailable') } })
    await syncSystemAppearance(presentation)
    expect(native.apply).toHaveBeenCalledWith({ backgroundColor: '#e7eee8', themeBackgroundColor: '#e7eee8' })
  })

  it('keeps the web theme usable if a native bridge call fails', async () => {
    native.platform = 'android'
    native.apply.mockRejectedValue(new Error('bridge unavailable'))
    const warning = vi.spyOn(console, 'warn').mockImplementation(() => undefined)
    await expect(syncSystemAppearance(getThemePresentation('mist-paper'))).resolves.toBeUndefined()
    expect(styles.get('--app-shell-background')).toBe('#e7eee8')
    expect(warning).toHaveBeenCalledOnce()
  })

  it.each([['#000000', true], ['#ffffff', false], ['#777777', false], ['#241d2a', true]])(
    'chooses the more readable system icon contrast for %s', (color, dark) => {
      expect(isDarkBackground(color as string)).toBe(dark)
    },
  )

  it('restores a light theme before the app bundle starts', async () => {
    await syncSystemAppearance(getThemePresentation('mist-paper'))
    styles.clear()
    root.style.colorScheme = ''
    meta.content = '#07131f'
    runBootstrap()
    expect(styles.get('--app-shell-background')).toBe('#e7eee8')
    expect(root.style.colorScheme).toBe('light')
    expect(meta.content).toBe('#e7eee8')
  })

  it.each(['{broken', JSON.stringify({ backgroundColor: 'red' }), 'null'])(
    'ignores an invalid startup cache: %s', (cached) => {
      values.set(APPEARANCE_STORAGE_KEY, cached)
      expect(runBootstrap).not.toThrow()
      expect(styles.has('--app-shell-background')).toBe(false)
    },
  )

  function runBootstrap() {
    const html = readFileSync(new URL('../../index.html', import.meta.url), 'utf8')
    const script = html.match(/<script>([\s\S]*?)<\/script>/)![1]!
    runInNewContext(script, { document, localStorage })
  }
})
