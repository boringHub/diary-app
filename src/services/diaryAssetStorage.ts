import { Capacitor } from '@capacitor/core'
import { Directory, Filesystem } from '@capacitor/filesystem'
import type { DiaryAsset, SaveDiaryImageInput } from '../types/diary'

export interface StoredDiaryAsset {
  id: string
  localPath: string
  fileSize: number
  mimeType: string
  width?: number
  height?: number
  createdAt: number
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => {
      const value = String(reader.result ?? '')
      resolve(value.includes(',') ? value.slice(value.indexOf(',') + 1) : value)
    }
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result ?? ''))
    reader.onerror = () => reject(reader.error ?? new Error('图片读取失败'))
    reader.readAsDataURL(blob)
  })
}

function extensionFor(mimeType: string, name: string) {
  const fromName = name.split('.').pop()?.toLowerCase()
  if (fromName && /^[a-z0-9]{2,5}$/.test(fromName)) return fromName
  return mimeType.split('/')[1]?.replace('jpeg', 'jpg') || 'bin'
}

function base64ToDataUrl(data: string, mimeType: string) {
  return data.startsWith('data:') ? data : `data:${mimeType || 'image/*'};base64,${data}`
}

export class DiaryAssetStorage {
  async saveImage(diaryId: string, input: SaveDiaryImageInput): Promise<StoredDiaryAsset> {
    const id = crypto.randomUUID()
    const localPath = `diaries/${diaryId}/${id}.${extensionFor(input.mimeType, input.name)}`
    const data = await blobToBase64(input.data)
    await Filesystem.writeFile({ path: localPath, directory: Directory.Data, data, recursive: true })
    return {
      id,
      localPath,
      fileSize: input.data.size,
      mimeType: input.mimeType || 'application/octet-stream',
      width: input.width,
      height: input.height,
      createdAt: Date.now(),
    }
  }

  async remove(asset: Pick<DiaryAsset, 'localPath'>) {
    try {
      await Filesystem.deleteFile({ path: asset.localPath, directory: Directory.Data })
    } catch {
      // The database remains authoritative when a file was already removed.
    }
  }

  async resolveUrl(asset: Pick<DiaryAsset, 'localPath' | 'mimeType'>) {
    if (Capacitor.isNativePlatform()) {
      const result = await Filesystem.getUri({ path: asset.localPath, directory: Directory.Data })
      return Capacitor.convertFileSrc(result.uri)
    }

    const result = await Filesystem.readFile({ path: asset.localPath, directory: Directory.Data })
    if (result.data instanceof Blob) return blobToDataUrl(result.data)
    return base64ToDataUrl(String(result.data), asset.mimeType ?? 'image/*')
  }
}

export const diaryAssetStorage = new DiaryAssetStorage()
