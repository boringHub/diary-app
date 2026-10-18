import type { FeedbackInput } from './notifyApiClient'

const STORAGE_KEY = 'shiguangjian.feedback-draft.v1'

export function readFeedbackDraft(storage?: Storage): FeedbackInput {
  try {
    const raw = (storage ?? window.localStorage).getItem(STORAGE_KEY)
    if (raw) {
      const value = JSON.parse(raw)
      if (typeof value?.feedbackId === 'string' && /^fb_[\w-]{1,128}$/.test(value.feedbackId) && typeof value.content === 'string') {
        return { feedbackId: value.feedbackId, content: value.content }
      }
    }
  } catch { /* Unavailable storage or a corrupt draft should not block settings. */ }
  return { feedbackId: `fb_${crypto.randomUUID()}`, content: '' }
}

export function saveFeedbackDraft(draft: FeedbackInput, storage: Storage = window.localStorage) {
  storage.setItem(STORAGE_KEY, JSON.stringify(draft))
}

export function clearFeedbackDraft(storage: Storage = window.localStorage) {
  storage.removeItem(STORAGE_KEY)
}
