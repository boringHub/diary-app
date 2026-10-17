import { describe, expect, it, vi } from 'vitest'
import { NotifyApiError, NOTIFY_API_URL, sendDiaryCreatedEvent, sha256Hex } from './notifyApiClient'
import type { DiaryCreatedEvent } from './diaryEventQueue'

const event: DiaryCreatedEvent = {
  eventId: 'event-1',
  eventType: 'diary_created',
  occurredAt: 1000,
  mood: 'happy',
  deviceId: 'device-1',
}

const identity = { deviceId: event.deviceId, publicKey: 'public-key', alias: 'alias' }

describe('notify API client', () => {
  it('sends only the allowlisted metadata and accepts durable confirmation', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, eventId: event.eventId, status: 'accepted' }, { status: 202 }))

    await expect(sendDiaryCreatedEvent(event, identity, request, { sign: vi.fn(async () => 'signature') })).resolves.toMatchObject({ status: 'accepted' })
    expect(request).toHaveBeenCalledWith(NOTIFY_API_URL, expect.objectContaining({
      method: 'POST',
      headers: expect.objectContaining({ 'content-type': 'application/json', 'x-device-id': event.deviceId, 'x-signature': 'signature' }),
      body: JSON.stringify(event),
    }))
    expect(Object.keys(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).sort())
      .toEqual(['deviceId', 'eventId', 'eventType', 'mood', 'occurredAt'])
  })

  it('accepts an idempotent duplicate confirmation', async () => {
    const request = vi.fn(async () => Response.json({ ok: true, eventId: event.eventId, status: 'duplicate' }, { status: 200 }))
    await expect(sendDiaryCreatedEvent(event, identity, request, { sign: vi.fn(async () => 'signature') })).resolves.toMatchObject({ status: 'duplicate' })
  })

  it('signs the exact canonical request and generates a fresh nonce per attempt', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, eventId: event.eventId, status: 'accepted' }, { status: 202 }))
    const sign = vi.fn(async (_alias: string, _dataBase64: string) => 'signature')

    await sendDiaryCreatedEvent(event, identity, request, { sign })
    await sendDiaryCreatedEvent(event, identity, request, { sign })

    const firstHeaders = request.mock.calls[0]?.[1]?.headers as Record<string, string>
    const secondHeaders = request.mock.calls[1]?.[1]?.headers as Record<string, string>
    expect(firstHeaders['x-nonce']).not.toBe(secondHeaders['x-nonce'])
    const encodedCanonical = String(sign.mock.calls[0]?.[1])
    const canonical = new TextDecoder().decode(Uint8Array.from(atob(encodedCanonical), (character) => character.charCodeAt(0)))
    expect(canonical).toBe([
      'v1',
      'POST',
      '/v1/events',
      identity.deviceId,
      '1790000000',
      firstHeaders['x-nonce'],
      await sha256Hex(JSON.stringify(event)),
    ].join('\n'))
    vi.restoreAllMocks()
  })

  it('strips unexpected runtime fields before sending', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, eventId: event.eventId, status: 'accepted' }, { status: 202 }))
    const taintedEvent = { ...event, title: 'private title', body: 'private diary body' } as DiaryCreatedEvent

    await sendDiaryCreatedEvent(taintedEvent, identity, request, { sign: vi.fn(async () => 'signature') })

    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual(event)
  })

  it('classifies transient and permanent API failures', async () => {
    const unavailable = vi.fn(async () => Response.json({ error: 'temporarily_unavailable' }, { status: 503 }))
    const unauthorized = vi.fn(async () => Response.json({ error: 'unauthorized' }, { status: 401 }))

    await expect(sendDiaryCreatedEvent(event, identity, unavailable, { sign: vi.fn(async () => 'signature') }))
      .rejects.toMatchObject<Partial<NotifyApiError>>({ retryable: true })
    await expect(sendDiaryCreatedEvent(event, identity, unauthorized, { sign: vi.fn(async () => 'signature') }))
      .rejects.toMatchObject<Partial<NotifyApiError>>({ retryable: false })
  })

  it('rejects a response for a different event id', async () => {
    const request = vi.fn(async () => Response.json({ ok: true, eventId: 'another-event', status: 'accepted' }, { status: 202 }))
    await expect(sendDiaryCreatedEvent(event, identity, request, { sign: vi.fn(async () => 'signature') }))
      .rejects.toThrow('event_id_mismatch')
  })
})
