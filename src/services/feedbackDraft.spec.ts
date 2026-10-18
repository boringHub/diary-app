import { describe, expect, it, vi } from 'vitest'
import { clearFeedbackDraft, readFeedbackDraft, saveFeedbackDraft } from './feedbackDraft'

function createStorage() {
  const values = new Map<string, string>()
  return {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => { values.set(key, value) }),
    removeItem: vi.fn((key: string) => { values.delete(key) }),
  } as unknown as Storage
}

describe('feedback drafts', () => {
  it('retains content and its retry identifier across reopening and starts a fresh message after acceptance', () => {
    const storage = createStorage()
    const draft = { ...readFeedbackDraft(storage), content: '希望添加的功能' }
    saveFeedbackDraft(draft, storage)
    expect(readFeedbackDraft(storage)).toEqual(draft)
    clearFeedbackDraft(storage)
    expect(readFeedbackDraft(storage)).toMatchObject({ content: '' })
    expect(readFeedbackDraft(storage).feedbackId).not.toBe(draft.feedbackId)
  })

  it('recovers from corrupt local data without affecting settings', () => {
    const storage = createStorage()
    vi.mocked(storage.getItem).mockReturnValueOnce('{bad json')
    expect(readFeedbackDraft(storage)).toMatchObject({ content: '' })
  })

  it('keeps settings accessible when local storage cannot be read', () => {
    const storage = createStorage()
    vi.mocked(storage.getItem).mockImplementation(() => { throw new Error('Storage unavailable') })
    expect(readFeedbackDraft(storage)).toMatchObject({ content: '' })
  })
})
