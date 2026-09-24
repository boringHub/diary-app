import { beforeEach, describe, expect, it } from 'vitest'
import { settingsRepository } from '../repositories/settingsRepository'
import { createFixedLayout } from './diaryBoardService'
import {
  getThemeManifest,
  getThemePresentation,
  importThemeManifest,
  listThemeManifests,
  parseThemeManifest,
  selectTheme,
  useCurrentTheme,
} from './themeService'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()
  get length() { return this.values.size }
  clear() { this.values.clear() }
  getItem(key: string) { return this.values.get(key) ?? null }
  key(index: number) { return [...this.values.keys()][index] ?? null }
  removeItem(key: string) { this.values.delete(key) }
  setItem(key: string, value: string) { this.values.set(key, value) }
}

describe('themeService', () => {
  beforeEach(() => {
    Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: new MemoryStorage() })
  })

  it('parses a global interface theme manifest', () => {
    const manifest = parseThemeManifest({
      schemaVersion: 1,
      id: 'spring-garden',
      version: '1.0.0',
      name: 'Spring Garden',
      description: 'A spring theme.',
      colors: {
        background: '#f8f3ea',
        surface: '#fffdf8',
        primary: '#8b9a72',
        text: '#4a463f',
      },
    })

    expect(manifest.previewColor).toBe('#f8f3ea')
    expect(manifest.colors.primary).toBe('#8b9a72')
  })

  it('rejects unsupported versions and unsafe theme ids', () => {
    expect(() => parseThemeManifest({ schemaVersion: 2 })).toThrow()
    expect(() => parseThemeManifest({
      schemaVersion: 1,
      id: '../unsafe',
      version: '1.0.0',
      name: 'Unsafe',
      colors: { background: '#000000', surface: '#111111', primary: '#222222', text: '#ffffff' },
    })).toThrow()
  })

  it('rejects invalid interface colors', () => {
    expect(() => parseThemeManifest({
      schemaVersion: 1,
      id: 'wrong-defaults',
      version: '1.0.0',
      name: 'Wrong defaults',
      colors: { background: 'red', surface: '#111111', primary: '#222222', text: '#ffffff' },
    })).toThrow()
  })

  it('does not silently select an unknown theme', () => {
    selectTheme('mist-paper', '1.0.0')

    expect(() => selectTheme('missing', '9.9.9')).toThrow('暂时找不到')
    expect(settingsRepository.get()).toMatchObject({ themeId: 'mist-paper', themeVersion: '1.0.0' })
  })

  it('updates the active app theme immediately after selection', () => {
    const current = useCurrentTheme()

    expect(current.value?.id).toBe('default')
    selectTheme('sunset-post', '1.0.0')

    expect(current.value).toMatchObject({ id: 'sunset-post', version: '1.0.0' })
  })

  it('resolves distinct global presentation variables', () => {
    const night = getThemePresentation('default', '1.0.0')
    const mist = getThemePresentation('mist-paper', '1.0.0')

    expect(night.cssVariables['--app-theme-background']).toBe('#07131f')
    expect(mist.cssVariables['--app-theme-background']).toBe('#e7eee8')
    expect(night.cssVariables).not.toEqual(mist.cssVariables)
  })

  it('imports a versioned manifest and refuses to overwrite the same version', async () => {
    const manifest = {
      schemaVersion: 1,
      id: 'rain-note',
      version: '1.0.0',
      name: 'Rain Note',
      description: 'First edition',
      colors: { background: '#102030', surface: '#203040', primary: '#80a0b0', text: '#f0f4f6' },
    } as const

    await importThemeManifest(manifest)
    await expect(importThemeManifest({ ...manifest, description: 'Updated edition' })).rejects.toThrow('不会覆盖')

    const imported = listThemeManifests().filter((theme) => theme.id === manifest.id && theme.version === manifest.version)
    expect(imported).toHaveLength(1)
    expect(imported[0].description).toBe('First edition')
    expect(getThemeManifest(manifest.id, manifest.version).colors.background).toBe('#102030')
  })

  it('generates a fixed layout containing references rather than copied content', () => {
    const blocks = [
      { id: 'diary:text:0', blockType: 'text' as const, content: { text: '正文' } },
      { id: 'diary:image:1', blockType: 'image' as const, content: { assetId: 'asset-1' } },
      { id: 'diary:image:2', blockType: 'image' as const, content: { assetId: 'asset-2' } },
    ]
    const layout = createFixedLayout(blocks)
    const serialized = JSON.stringify(layout)

    expect(layout.canvas).toEqual({ width: 1080, height: 1440 })
    expect(layout.elements[0].content).toEqual({ blockId: 'diary:text:0' })
    expect(layout.elements.slice(1).map((element) => element.content)).toEqual([
      { assetId: 'asset-1' },
      { assetId: 'asset-2' },
    ])
    expect(layout.elements[1].position).not.toEqual(layout.elements[2].position)
    expect(serialized).not.toContain('localPath')
    expect(serialized).not.toContain('正文')
  })

  it('keeps five image slots inside the normalized canvas without overlap', () => {
    const blocks = Array.from({ length: 5 }, (_, index) => ({
      id: `diary:image:${index}`,
      blockType: 'image' as const,
      content: { assetId: `asset-${index}` },
    }))
    const layout = createFixedLayout(blocks)

    for (const element of layout.elements) {
      expect(element.position.x).toBeGreaterThanOrEqual(0)
      expect(element.position.y).toBeGreaterThanOrEqual(0)
      expect(element.position.x + element.size.width).toBeLessThanOrEqual(1)
      expect(element.position.y + element.size.height).toBeLessThanOrEqual(1)
    }

    for (let left = 0; left < layout.elements.length; left += 1) {
      for (let right = left + 1; right < layout.elements.length; right += 1) {
        expect(overlaps(layout.elements[left], layout.elements[right])).toBe(false)
      }
    }
  })
})

function overlaps(
  first: { position: { x: number; y: number }; size: { width: number; height: number } },
  second: { position: { x: number; y: number }; size: { width: number; height: number } },
) {
  return first.position.x < second.position.x + second.size.width
    && first.position.x + first.size.width > second.position.x
    && first.position.y < second.position.y + second.size.height
    && first.position.y + first.size.height > second.position.y
}
