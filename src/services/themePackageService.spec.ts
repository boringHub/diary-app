import { zipSync, strToU8 } from 'fflate'
import { describe, expect, it } from 'vitest'
import { parseThemePackageArchive } from './themePackageService'

const manifest = {
  schemaVersion: 1,
  id: 'rain-note',
  version: '1.0.0',
  name: 'Rain Note',
  description: 'A quiet rain theme.',
  colors: { background: '#102030', surface: '#203040', primary: '#80a0b0', text: '#f0f4f6' },
}

function packageWith(files: Record<string, Uint8Array> = {}) {
  return zipSync({
    'manifest.json': strToU8(JSON.stringify(manifest)),
    'backgrounds/rain.json': strToU8('{"kind":"background"}'),
    'boards/rain.json': strToU8('{"kind":"board"}'),
    ...files,
  })
}

describe('themePackageService', () => {
  it('reads a complete package and preserves its safe relative files', () => {
    const parsed = parseThemePackageArchive(packageWith())

    expect(parsed.manifest).toMatchObject({ id: 'rain-note', version: '1.0.0' })
    expect([...parsed.files.keys()]).toEqual([
      'manifest.json',
      'backgrounds/rain.json',
      'boards/rain.json',
    ])
  })

  it('rejects unsafe archive entry paths', () => {
    expect(() => parseThemePackageArchive(packageWith({ '../outside.txt': strToU8('no') }))).toThrow('不安全')
    expect(() => parseThemePackageArchive(packageWith({ 'boards\\outside.txt': strToU8('no') }))).toThrow('不安全')
  })

  it('requires manifest.json at the package root', () => {
    const archive = zipSync({ 'theme/manifest.json': strToU8(JSON.stringify(manifest)) })
    expect(() => parseThemePackageArchive(archive)).toThrow('根目录')
  })

  it('rejects packages with too many files before extraction', () => {
    const files = Object.fromEntries(
      Array.from({ length: 129 }, (_, index) => [`files/${index}.txt`, strToU8('x')]),
    )

    expect(() => parseThemePackageArchive(zipSync(files))).toThrow('文件太多或太大')
  })

  it('rejects packages whose declared unpacked size exceeds the limit', () => {
    const archive = zipSync({
      'large.bin': new Uint8Array(40 * 1024 * 1024 + 1),
    })

    expect(archive.byteLength).toBeLessThan(20 * 1024 * 1024)
    expect(() => parseThemePackageArchive(archive)).toThrow('文件太多或太大')
  })
})
