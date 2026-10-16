import type { DiaryCreatedEvent } from './diaryEventQueue'

export const NOTIFY_API_URL = 'https://api.304766.xyz/v1/events'
const REQUEST_TIMEOUT_MS = 15_000
const EVENT_TYPES = new Set(['diary_created', 'diary_updated', 'diary_favorited'])
const MOODS = new Set(['calm', 'happy', 'low', 'tired', 'hopeful'])

export class NotifyApiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'NotifyApiError'
  }
}

export async function sendDiaryCreatedEvent(
  event: DiaryCreatedEvent,
  credential: string,
  request: typeof fetch = fetch,
) {
  const payload = toAllowedPayload(event)
  let response: Response
  const controller = new AbortController()
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  try {
    response = await request(NOTIFY_API_URL, {
      method: 'POST',
      headers: {
        authorization: `Bearer ${credential}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
      signal: controller.signal,
    })
  } catch {
    throw new NotifyApiError('network_unavailable', true)
  } finally {
    clearTimeout(timeout)
  }

  let result: unknown
  try {
    result = await response.json()
  } catch {
    throw new NotifyApiError('invalid_server_response', response.status >= 500)
  }
  const body = result && typeof result === 'object' ? result as Record<string, unknown> : {}
  if ((response.status === 202 && body.status === 'accepted') || (response.status === 200 && body.status === 'duplicate')) {
    if (body.eventId !== event.eventId) throw new NotifyApiError('event_id_mismatch', false)
    return 'accepted' as const
  }

  const error = typeof body.error === 'string' ? body.error : `http_${response.status}`
  const retryable = response.status === 408 || response.status === 429 || response.status >= 500
  throw new NotifyApiError(error, retryable)
}

function toAllowedPayload(event: DiaryCreatedEvent): DiaryCreatedEvent {
  if (
    typeof event.eventId !== 'string' || !/^[\w-]{1,128}$/.test(event.eventId) ||
    typeof event.eventType !== 'string' || !EVENT_TYPES.has(event.eventType) ||
    typeof event.occurredAt !== 'number' || !Number.isSafeInteger(event.occurredAt) ||
    typeof event.mood !== 'string' || !MOODS.has(event.mood) ||
    typeof event.deviceId !== 'string' || !/^[\w-]{1,128}$/.test(event.deviceId)
  ) {
    throw new NotifyApiError('invalid_event', false)
  }
  return {
    eventId: event.eventId,
    eventType: event.eventType,
    occurredAt: event.occurredAt,
    mood: event.mood,
    deviceId: event.deviceId,
  }
}
