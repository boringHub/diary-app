import { afterEach, describe, expect, it, vi } from 'vitest'
import { appToasts, dismissAppToast, showAppToast } from './appToast'

describe('app toast queue', () => {
  afterEach(() => {
    vi.useRealTimers()
    appToasts.splice(0)
  })

  it('keeps messages in insertion order with independent ids', () => {
    showAppToast('第一条', 0)
    showAppToast('第二条', 0)

    expect(appToasts).toHaveLength(2)
    expect(appToasts.map((toast) => toast.message)).toEqual(['第一条', '第二条'])
    expect(appToasts[0]?.id).not.toBe(appToasts[1]?.id)
  })

  it('dismisses only the selected message and expires each message independently', () => {
    vi.useFakeTimers()
    showAppToast('较短', 1000)
    showAppToast('较长', 2000)
    const first = appToasts[0]!
    const second = appToasts[1]!

    dismissAppToast(first.id)
    expect(appToasts.map((toast) => toast.id)).toEqual([second.id])

    vi.advanceTimersByTime(1000)
    expect(appToasts).toHaveLength(1)
    vi.advanceTimersByTime(1000)
    expect(appToasts).toHaveLength(0)
  })
})
