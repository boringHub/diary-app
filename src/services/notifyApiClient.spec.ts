import { describe, expect, it, vi } from 'vitest'
import { NotifyApiError, NOTIFY_API_URL, sendDiaryCreatedEvent } from './notifyApiClient'
import type { DiaryCreatedEvent } from './diaryEventQueue'

const event: DiaryCreatedEvent = {
  eventId: 'event-1',
  eventType: 'diary_created',
  occurredAt: 1000,
  mood: 'happy',
  deviceId: 'device-1',
}

describe('notify API client', () => {
  it('sends only the allowlisted metadata and accepts durable confirmation', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, eventId: event.eventId, status: 'accepted' }, { status: 202 }))

    await expect(sendDiaryCreatedEvent(event, 'revocable-device-token', request)).resolves.toBe('accepted')
    expect(request).toHaveBeenCalledWith(NOTIFY_API_URL, expect.objectContaining({
      method: 'POST',
      headers: {
        authorization: 'Bearer revocable-device-token',
        'content-type': 'application/json',
      },
      body: JSON.stringify(event),
    }))
    expect(Object.keys(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).sort())
      .toEqual(['deviceId', 'eventId', 'eventType', 'mood', 'occurredAt'])
  })

  it('accepts an idempotent duplicate confirmation', async () => {
    const request = vi.fn(async () => Response.json({ ok: true, eventId: event.eventId, status: 'duplicate' }, { status: 200 }))
    await expect(sendDiaryCreatedEvent(event, 'token', request)).resolves.toBe('accepted')
  })

  it('strips unexpected runtime fields before sending', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, eventId: event.eventId, status: 'accepted' }, { status: 202 }))
    const taintedEvent = { ...event, title: 'private title', body: 'private diary body' } as DiaryCreatedEvent

    await sendDiaryCreatedEvent(taintedEvent, 'token', request)

    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual(event)
  })

  it('classifies transient and permanent API failures', async () => {
    const unavailable = vi.fn(async () => Response.json({ error: 'temporarily_unavailable' }, { status: 503 }))
    const unauthorized = vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 401 }))

    await expect(sendDiaryCreatedEvent(event, 'token', unavailable))
      .rejects.toMatchObject<Partial<NotifyApiError>>({ retryable: true })
    await expect(sendDiaryCreatedEvent(event, 'token', unauthorized))
      .rejects.toMatchObject<Partial<NotifyApiError>>({ retryable: false })
  })

  it('rejects a response for a different event id', async () => {
    const request = vi.fn(async () => Response.json({ ok: true, eventId: 'another-event', status: 'accepted' }, { status: 202 }))
    await expect(sendDiaryCreatedEvent(event, 'token', request))
      .rejects.toThrow('event_id_mismatch')
  })
})
