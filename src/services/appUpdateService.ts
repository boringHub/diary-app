import { Capacitor, registerPlugin, type PluginListenerHandle } from '@capacitor/core'

const RELEASE_API_URL = 'https://api.github.com/repos/boringHub/diary-app/releases/latest'
const OSS_MANIFEST_URL = 'https://diary-app.oss-cn-hangzhou.aliyuncs.com/releases/latest/update.json'
const NETWORK_TIMEOUT_MS = 30_000
const PREFERRED_APK_NAMES = ['shiguangjian-android.apk', 'shiguangjian-android-debug.apk']
const WEB_VERSION = '1.3.1'

interface NativeVersionInfo {
  versionName: string
  versionCode: number
  packageName: string
}

interface InstallUpdateOptions {
  url: string
  fallbackUrl?: string
  fallbackFormat?: 'zip'
  expectedVersionCode?: number
  expectedSha256?: string
}

interface InstallUpdateResult {
  status: 'installer_opened' | 'permission_required'
}

interface AppUpdatePlugin {
  getCurrentVersion(): Promise<NativeVersionInfo>
  fetchJson(options: { url: string }): Promise<Record<string, unknown>>
  downloadAndInstall(options: InstallUpdateOptions): Promise<InstallUpdateResult>
  addListener(eventName: 'downloadProgress', listener: (event: DownloadProgress) => void): Promise<PluginListenerHandle>
}

interface GitHubReleaseAsset {
  name: string
  browser_download_url: string
  size: number
}

interface GitHubRelease {
  tag_name: string
  name: string | null
  body: string | null
  html_url: string
  draft: boolean
  prerelease: boolean
  assets: GitHubReleaseAsset[]
}

export interface UpdateManifest {
  versionCode?: number
  versionName?: string
  apk?: string
  apkSize?: number
  sha256?: string
  githubUrl?: string
  ossUrl?: string
  ossFormat?: 'zip'
  releaseNotes?: string
}

export interface AppVersionInfo {
  versionName: string
  versionCode?: number
  packageName?: string
}

export interface AvailableUpdate {
  versionName: string
  versionCode?: number
  releaseName: string
  releaseNotes: string
  releaseUrl: string
  apkUrl: string
  fallbackUrl?: string
  fallbackFormat?: 'zip'
  apkSize: number
  sha256?: string
}

export interface DownloadProgress {
  status: 'connecting' | 'downloading' | 'switching' | 'extracting' | 'verifying' | 'installing'
  source: 'github' | 'aliyun'
  downloadedBytes?: number
  totalBytes?: number
  percent?: number
}

export interface UpdateCheckResult {
  current: AppVersionInfo
  latest: AvailableUpdate
  updateAvailable: boolean
}

const AppUpdate = registerPlugin<AppUpdatePlugin>('AppUpdate')

function numericVersionParts(version: string): number[] {
  const normalized = version.trim().replace(/^v/i, '').split('-')[0]
  const parts = normalized.split('.').map((part) => Number.parseInt(part, 10))
  return parts.length > 0 && parts.every(Number.isFinite) ? parts : [0]
}

export function compareVersions(left: string, right: string): number {
  const leftParts = numericVersionParts(left)
  const rightParts = numericVersionParts(right)
  const length = Math.max(leftParts.length, rightParts.length)

  for (let index = 0; index < length; index += 1) {
    const difference = (leftParts[index] ?? 0) - (rightParts[index] ?? 0)
    if (difference !== 0) return difference > 0 ? 1 : -1
  }
  return 0
}

export function formatReleaseNoteLines(releaseNotes: string): string[] {
  return releaseNotes
    .replace(/\r/g, '')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<\/p>\s*<p>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .trim()
    .slice(0, 1200)
    .split(/\n+/)
    .map((line) => line.trim().replace(/^[-*]\s*/, ''))
    .filter(Boolean)
}

function selectApkAsset(assets: GitHubReleaseAsset[], manifest?: UpdateManifest) {
  const apkAssets = assets.filter((asset) => asset.name.toLowerCase().endsWith('.apk'))
  if (manifest?.apk) {
    const manifestAsset = apkAssets.find((asset) => asset.name === manifest.apk)
    if (manifestAsset) return manifestAsset
  }
  for (const preferredName of PREFERRED_APK_NAMES) {
    const preferredAsset = apkAssets.find((asset) => asset.name === preferredName)
    if (preferredAsset) return preferredAsset
  }
  return apkAssets[0]
}

export function parseUpdateManifest(value: unknown): UpdateManifest | undefined {
  if (!value || typeof value !== 'object') return undefined
  const manifest = value as Record<string, unknown>
  const valid =
    (manifest.versionCode === undefined || (typeof manifest.versionCode === 'number' && Number.isInteger(manifest.versionCode))) &&
    (manifest.versionName === undefined || typeof manifest.versionName === 'string') &&
    (manifest.apk === undefined || typeof manifest.apk === 'string') &&
    (manifest.apkSize === undefined || (typeof manifest.apkSize === 'number' && Number.isFinite(manifest.apkSize))) &&
    (manifest.sha256 === undefined || typeof manifest.sha256 === 'string') &&
    (manifest.githubUrl === undefined || typeof manifest.githubUrl === 'string') &&
    (manifest.ossUrl === undefined || typeof manifest.ossUrl === 'string') &&
    (manifest.ossFormat === undefined || manifest.ossFormat === 'zip') &&
    (manifest.releaseNotes === undefined || typeof manifest.releaseNotes === 'string')
  return valid ? (value as UpdateManifest) : undefined
}

async function fetchJsonWithTimeout(url: string, init?: RequestInit): Promise<{ response: Response; value: unknown }> {
  const controller = new AbortController()
  const timeout = window.setTimeout(() => controller.abort(), NETWORK_TIMEOUT_MS)
  try {
    const response = await fetch(url, { ...init, signal: controller.signal })
    const value: unknown = await response.json()
    return { response, value }
  } catch (error) {
    if (controller.signal.aborted) throw new Error('连接 GitHub 超过 30 秒，已尝试切换阿里云')
    throw error
  } finally {
    window.clearTimeout(timeout)
  }
}

async function loadOssManifest(): Promise<UpdateManifest> {
  let value: unknown
  if (Capacitor.isNativePlatform()) {
    value = await AppUpdate.fetchJson({ url: OSS_MANIFEST_URL })
  } else {
    const result = await fetchJsonWithTimeout(OSS_MANIFEST_URL, { cache: 'no-store' })
    const response = result.response
    if (!response.ok) throw new Error(`阿里云更新信息读取失败 (${response.status})`)
    value = result.value
  }
  const manifest = parseUpdateManifest(value)
  if (!manifest?.versionName || !manifest.githubUrl || !manifest.ossUrl) {
    throw new Error('阿里云更新信息无效')
  }
  return manifest
}

async function loadUpdateManifest(assets: GitHubReleaseAsset[]): Promise<UpdateManifest | undefined> {
  const asset = assets.find((item) => item.name.toLowerCase() === 'update.json')
  if (!asset) return undefined

  try {
    const { response, value } = await fetchJsonWithTimeout(asset.browser_download_url, { cache: 'no-store' })
    if (!response.ok) return undefined
    return parseUpdateManifest(value)
  } catch {
    return undefined
  }
}

export async function getCurrentVersion(): Promise<AppVersionInfo> {
  if (!Capacitor.isNativePlatform()) return { versionName: WEB_VERSION }
  return AppUpdate.getCurrentVersion()
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const current = await getCurrentVersion()

  try {
    const { response: releaseResponse, value } = await fetchJsonWithTimeout(RELEASE_API_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    })

    if (!releaseResponse.ok) throw new Error(`检查更新失败 (${releaseResponse.status})`)

    const release = value as GitHubRelease
    if (!release.tag_name || !Array.isArray(release.assets) || release.draft) throw new Error('最新发布信息无效')

    const manifest = (await loadUpdateManifest(release.assets)) ?? (await loadOssManifest().catch(() => undefined))
    const apkAsset = selectApkAsset(release.assets, manifest)
    if (!apkAsset) throw new Error('最新版本没有可用的 Android 安装包')

    const versionName = manifest?.versionName?.trim() || release.tag_name.replace(/^v/i, '')
    return makeCheckResult(current, {
      versionName,
      versionCode: manifest?.versionCode,
      releaseName: release.name?.trim() || `拾光笺 v${versionName}`,
      releaseNotes: release.body?.trim() || manifest?.releaseNotes?.trim() || '',
      releaseUrl: release.html_url,
      apkUrl: apkAsset.browser_download_url,
      fallbackUrl: manifest?.ossUrl?.trim(),
      fallbackFormat: manifest?.ossFormat,
      apkSize: apkAsset.size,
      sha256: manifest?.sha256?.trim(),
    })
  } catch (githubError) {
    try {
      const manifest = await loadOssManifest()
      const versionName = manifest.versionName!.trim()
      return makeCheckResult(current, {
        versionName,
        versionCode: manifest.versionCode,
        releaseName: `拾光笺 v${versionName}`,
        releaseNotes: manifest.releaseNotes?.trim() || '',
        releaseUrl: `https://github.com/boringHub/diary-app/releases/tag/v${versionName}`,
        apkUrl: manifest.githubUrl!.trim(),
        fallbackUrl: manifest.ossUrl!.trim(),
        fallbackFormat: manifest.ossFormat,
        apkSize: manifest.apkSize ?? 0,
        sha256: manifest.sha256?.trim(),
      })
    } catch {
      throw githubError instanceof Error ? githubError : new Error('检查更新失败，请稍后重试')
    }
  }
}

function makeCheckResult(current: AppVersionInfo, latest: AvailableUpdate): UpdateCheckResult {
  const updateAvailable =
    current.versionCode !== undefined && latest.versionCode !== undefined
      ? latest.versionCode > current.versionCode
      : compareVersions(latest.versionName, current.versionName) > 0

  return { current, latest, updateAvailable }
}

export async function installUpdate(
  update: AvailableUpdate,
  onProgress?: (progress: DownloadProgress) => void,
): Promise<InstallUpdateResult> {
  if (!Capacitor.isNativePlatform()) {
    window.open(update.releaseUrl, '_blank', 'noopener,noreferrer')
    return { status: 'installer_opened' }
  }

  const listener = onProgress ? await AppUpdate.addListener('downloadProgress', onProgress) : undefined
  try {
    return await AppUpdate.downloadAndInstall({
      url: update.apkUrl,
      fallbackUrl: update.fallbackUrl,
      fallbackFormat: update.fallbackFormat,
      expectedVersionCode: update.versionCode,
      expectedSha256: update.sha256,
    })
  } finally {
    await listener?.remove()
  }
}
