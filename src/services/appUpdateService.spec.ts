import { describe, expect, it } from 'vitest'
import { compareVersions, formatReleaseNoteLines, parseUpdateManifest } from './appUpdateService'

describe('compareVersions', () => {
  it('compares semantic version segments numerically', () => {
    expect(compareVersions('0.3.0', '0.2.9')).toBe(1)
    expect(compareVersions('1.10.0', '1.9.9')).toBe(1)
    expect(compareVersions('2.0', '2.0.0')).toBe(0)
  })

  it('accepts release tags with a v prefix', () => {
    expect(compareVersions('v0.2.0', '0.1.0')).toBe(1)
    expect(compareVersions('v0.1.0', '0.2.0')).toBe(-1)
  })
})

describe('formatReleaseNoteLines', () => {
  it('turns HTML break tags and newlines into separate items', () => {
    expect(formatReleaseNoteLines('第一项<br><br>- 第二项\n* 第三项')).toEqual(['第一项', '第二项', '第三项'])
  })

  it('removes other HTML tags instead of rendering them', () => {
    expect(formatReleaseNoteLines('<p>安全更新</p><p><strong>保留日记</strong></p>')).toEqual(['安全更新', '保留日记'])
  })
})

describe('parseUpdateManifest', () => {
  it('accepts the GitHub-first manifest with an OSS ZIP fallback', () => {
    expect(
      parseUpdateManifest({
        versionCode: 5,
        versionName: '1.3.1',
        apk: 'shiguangjian-android.apk',
        apkSize: 1024,
        sha256: 'abc123',
        githubUrl: 'https://github.com/example/app.apk',
        ossUrl: 'https://example.oss-cn-hangzhou.aliyuncs.com/releases/app.zip',
        ossFormat: 'zip',
      }),
    ).toBeTruthy()
  })

  it('rejects unsupported fallback formats and invalid version codes', () => {
    expect(parseUpdateManifest({ versionCode: 5.5, ossFormat: 'apk' })).toBeUndefined()
  })
})
