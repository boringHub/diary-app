import { describe, expect, it, vi } from 'vitest'
import { parseThemeManifest } from '../services/themeService'
import { upsertThemeManifest } from './sqliteThemeIndex'

describe('sqliteThemeIndex', () => {
  it('indexes the manifest and every asset inside the caller transaction', async () => {
    const manifest = parseThemeManifest({
      schemaVersion: 1,
      id: 'rain-note',
      version: '1.2.0',
      name: 'Rain Note',
      description: 'A quiet rain theme.',
      colors: { background: '#102030', surface: '#203040', primary: '#80a0b0', text: '#f0f4f6' },
    })
    const run = vi.fn().mockResolvedValue({ changes: { changes: 1 } })

    await upsertThemeManifest({ run } as never, manifest, { imported: true, virtual: false })

    expect(run).toHaveBeenCalledTimes(1)
    expect(run.mock.calls[0][0]).toContain('INSERT INTO themes')
    expect(run.mock.calls[0][1]).toEqual([
      manifest.id,
      manifest.version,
      manifest.name,
      manifest.description,
      JSON.stringify(manifest),
      expect.any(Number),
    ])
    expect(run.mock.calls.every((call) => call[2] === false)).toBe(true)

  })
})
