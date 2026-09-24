import { Directory, Filesystem } from '@capacitor/filesystem'
import { strFromU8, unzipSync } from 'fflate'
import {
  importThemeManifest,
  listThemeManifests,
  parseThemeManifest,
  type ThemeManifest,
} from './themeService'

const MAX_THEME_PACKAGE_BYTES = 20 * 1024 * 1024
const MAX_THEME_UNPACKED_BYTES = 40 * 1024 * 1024
const MAX_THEME_PACKAGE_FILES = 128

class ThemePackageValidationError extends Error {}

export interface ParsedThemePackage {
  manifest: ThemeManifest
  files: Map<string, Uint8Array>
}

export function parseThemePackageArchive(data: ArrayBuffer | Uint8Array): ParsedThemePackage {
  const archive = data instanceof Uint8Array ? data : new Uint8Array(data)
  if (archive.byteLength === 0 || archive.byteLength > MAX_THEME_PACKAGE_BYTES) {
    throw new Error('主题包大小需要在 20 MB 以内哦')
  }

  let entries: Record<string, Uint8Array>
  let declaredFiles = 0
  let declaredUnpackedBytes = 0
  try {
    entries = unzipSync(archive, {
      filter(entry) {
        if (entry.name.endsWith('/')) return false
        if (!isSafePackagePath(entry.name)) {
          throw new ThemePackageValidationError('主题包里有不安全的文件路径')
        }

        declaredFiles += 1
        declaredUnpackedBytes += entry.originalSize
        if (
          declaredFiles > MAX_THEME_PACKAGE_FILES ||
          declaredUnpackedBytes > MAX_THEME_UNPACKED_BYTES
        ) {
          throw new ThemePackageValidationError('主题包里的文件太多或太大啦')
        }
        return true
      },
    })
  } catch (error) {
    if (error instanceof ThemePackageValidationError) throw error
    throw new Error('这个主题包暂时打不开哦')
  }

  const files = new Map<string, Uint8Array>()
  let unpackedBytes = 0
  for (const [path, content] of Object.entries(entries)) {
    files.set(path, content)
    unpackedBytes += content.byteLength
  }

  if (files.size === 0 || files.size > MAX_THEME_PACKAGE_FILES || unpackedBytes > MAX_THEME_UNPACKED_BYTES) {
    throw new Error('主题包里的文件太多或太大啦')
  }

  const manifestFile = files.get('manifest.json')
  if (!manifestFile) throw new Error('主题包根目录里需要有 manifest.json')

  let manifestValue: unknown
  try {
    manifestValue = JSON.parse(strFromU8(manifestFile).replace(/^\uFEFF/, ''))
  } catch {
    throw new Error('manifest.json 不是有效的 JSON')
  }

  return { manifest: parseThemeManifest(manifestValue), files }
}

export async function installThemePackage(file: Blob) {
  const parsed = parseThemePackageArchive(await file.arrayBuffer())
  const { manifest } = parsed
  if (listThemeManifests().some((item) => item.id === manifest.id && item.version === manifest.version)) {
    throw new Error('这个主题版本已经收好啦，不会覆盖原来的文件')
  }

  const root = `themes/${manifest.id}/${manifest.version}`
  try {
    await Filesystem.stat({ path: root, directory: Directory.Data })
    throw new Error('这个主题版本已经收好啦，不会覆盖原来的文件')
  } catch (error) {
    if (error instanceof Error && error.message.includes('不会覆盖')) throw error
  }

  try {
    for (const [path, content] of parsed.files) {
      await Filesystem.writeFile({
        path: `${root}/${path}`,
        directory: Directory.Data,
        data: bytesToBase64(content),
        recursive: true,
      })
    }
    await importThemeManifest(manifest)
  } catch (error) {
    await Filesystem.rmdir({ path: root, directory: Directory.Data, recursive: true }).catch(() => undefined)
    throw error
  }

  return manifest
}

function isSafePackagePath(path: string) {
  if (!path || path !== path.trim() || path.includes('\\') || path.startsWith('/') || path.startsWith('//')) return false
  if (/^[a-z]:/i.test(path) || path.includes('://')) return false
  return path.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..')
}

function bytesToBase64(bytes: Uint8Array) {
  let binary = ''
  const chunkSize = 0x8000
  for (let index = 0; index < bytes.length; index += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(index, index + chunkSize))
  }
  return btoa(binary)
}
