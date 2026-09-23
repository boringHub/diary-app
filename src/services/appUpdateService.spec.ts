import { describe, expect, it } from 'vitest'
import { compareVersions } from './appUpdateService'

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
