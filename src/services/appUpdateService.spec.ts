import { describe, expect, it } from 'vitest'
import { compareVersions, formatReleaseNoteLines } from './appUpdateService'

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
