import { Capacitor, registerPlugin } from '@capacitor/core'

const RELEASE_API_URL = 'https://api.github.com/repos/boringHub/diary-app/releases/latest'
const PREFERRED_APK_NAMES = ['shiguangjian-android.apk', 'shiguangjian-android-debug.apk']
const WEB_VERSION = '1.2.0'

interface NativeVersionInfo {
  versionName: string
  versionCode: number
  packageName: string
}

interface InstallUpdateOptions {
  url: string
  expectedVersionCode?: number
  expectedSha256?: string
}

interface InstallUpdateResult {
  status: 'installer_opened' | 'permission_required'
}

interface AppUpdatePlugin {
  getCurrentVersion(): Promise<NativeVersionInfo>
  downloadAndInstall(options: InstallUpdateOptions): Promise<InstallUpdateResult>
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

interface UpdateManifest {
  versionCode?: number
  versionName?: string
  apk?: string
  sha256?: string
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
  apkSize: number
  sha256?: string
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

function isUpdateManifest(value: unknown): value is UpdateManifest {
  if (!value || typeof value !== 'object') return false
  const manifest = value as Record<string, unknown>
  return (
    (manifest.versionCode === undefined || (typeof manifest.versionCode === 'number' && Number.isInteger(manifest.versionCode))) &&
    (manifest.versionName === undefined || typeof manifest.versionName === 'string') &&
    (manifest.apk === undefined || typeof manifest.apk === 'string') &&
    (manifest.sha256 === undefined || typeof manifest.sha256 === 'string')
  )
}

async function loadUpdateManifest(assets: GitHubReleaseAsset[]): Promise<UpdateManifest | undefined> {
  const asset = assets.find((item) => item.name.toLowerCase() === 'update.json')
  if (!asset) return undefined

  try {
    const response = await fetch(asset.browser_download_url, { cache: 'no-store' })
    if (!response.ok) return undefined
    const value: unknown = await response.json()
    return isUpdateManifest(value) ? value : undefined
  } catch {
    return undefined
  }
}

export async function getCurrentVersion(): Promise<AppVersionInfo> {
  if (!Capacitor.isNativePlatform()) return { versionName: WEB_VERSION }
  return AppUpdate.getCurrentVersion()
}

export async function checkForUpdate(): Promise<UpdateCheckResult> {
  const [current, releaseResponse] = await Promise.all([
    getCurrentVersion(),
    fetch(RELEASE_API_URL, {
      cache: 'no-store',
      headers: { Accept: 'application/vnd.github+json' },
    }),
  ])

  if (!releaseResponse.ok) {
    throw new Error(`检查更新失败 (${releaseResponse.status})`)
  }

  const release = (await releaseResponse.json()) as GitHubRelease
  if (!release.tag_name || !Array.isArray(release.assets) || release.draft) {
    throw new Error('最新发布信息无效')
  }

  const manifest = await loadUpdateManifest(release.assets)
  const apkAsset = selectApkAsset(release.assets, manifest)
  if (!apkAsset) {
    throw new Error('最新版本没有可用的 Android 安装包')
  }

  const versionName = manifest?.versionName?.trim() || release.tag_name.replace(/^v/i, '')
  const latest: AvailableUpdate = {
    versionName,
    versionCode: manifest?.versionCode,
    releaseName: release.name?.trim() || `拾光笺 v${versionName}`,
    releaseNotes: release.body?.trim() || '',
    releaseUrl: release.html_url,
    apkUrl: apkAsset.browser_download_url,
    apkSize: apkAsset.size,
    sha256: manifest?.sha256?.trim(),
  }

  const updateAvailable =
    current.versionCode !== undefined && latest.versionCode !== undefined
      ? latest.versionCode > current.versionCode
      : compareVersions(latest.versionName, current.versionName) > 0

  return { current, latest, updateAvailable }
}

export async function installUpdate(update: AvailableUpdate): Promise<InstallUpdateResult> {
  if (!Capacitor.isNativePlatform()) {
    window.open(update.releaseUrl, '_blank', 'noopener,noreferrer')
    return { status: 'installer_opened' }
  }

  return AppUpdate.downloadAndInstall({
    url: update.apkUrl,
    expectedVersionCode: update.versionCode,
    expectedSha256: update.sha256,
  })
}
