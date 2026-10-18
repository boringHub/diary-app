import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmNotificationEmail,
  deleteNotificationEmail,
  getNotifyApiOrigin,
  getNotificationSettings,
  isNotificationServiceConfigured,
  NotifyApiError,
  requestNotificationEmailVerification,
  sendDiaryCreatedEvent,
  setNotificationEmailEnabled,
  sha256Hex,
} from './notifyApiClient'
import type { DiaryCreatedEvent } from './diaryEventQueue'

const event: DiaryCreatedEvent = {
  eventId: 'event-1',
  eventType: 'diary_created',
  occurredAt: 1000,
  mood: 'happy',
  deviceId: 'device-1',
}

const identity = { deviceId: event.deviceId, publicKey: 'public-key', alias: 'alias' }
const notifyApiOrigin = 'https://notify.example.com'

describe('notify API client', () => {
  beforeEach(() => {
    vi.stubEnv('VITE_NOTIFY_API_ORIGIN', notifyApiOrigin)
  })

  it('stays disabled without a valid HTTPS API origin', async () => {
    const request = vi.fn<typeof fetch>()
    const signer = { sign: vi.fn(async () => 'signature') }

    vi.stubEnv('VITE_NOTIFY_API_ORIGIN', '')
    expect(getNotifyApiOrigin()).toBe('')
    expect(isNotificationServiceConfigured()).toBe(false)
    await expect(sendDiaryCreatedEvent(event, identity, request, signer))
      .rejects.toMatchObject<Partial<NotifyApiError>>({ message: 'notification_service_unconfigured', retryable: false })
    expect(request).not.toHaveBeenCalled()
    expect(signer.sign).not.toHaveBeenCalled()

    vi.stubEnv('VITE_NOTIFY_API_ORIGIN', 'http://notify.example.com')
    expect(getNotifyApiOrigin()).toBe('')
  })

  it('normalizes a configured API origin', () => {
    vi.stubEnv('VITE_NOTIFY_API_ORIGIN', `${notifyApiOrigin}/`)
    expect(getNotifyApiOrigin()).toBe(notifyApiOrigin)
    expect(isNotificationServiceConfigured()).toBe(true)
  })

  it('sends only the allowlisted metadata and accepts durable confirmation', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, eventId: event.eventId, status: 'accepted' }, { status: 202 }))

    await expect(sendDiaryCreatedEvent(event, identity, request, { sign: vi.fn(async () => 'signature') })).resolves.toMatchObject({ status: 'accepted' })
    expect(request).toHaveBeenCalledWith(`${notifyApiOrigin}/v1/events`, expect.objectContaining({
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

  it('signs the email verification request with its exact path and body', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_790_000_000_000)
    const request = vi.fn<typeof fetch>(async () => Response.json({
      ok: true,
      challengeId: 'emv_1',
      expiresAt: 1_790_000_600_000,
      resendAvailableAt: 1_790_000_060_000,
    }))
    const sign = vi.fn(async () => 'signature')
    const body = JSON.stringify({ email: 'owner@example.com' })

    await expect(requestNotificationEmailVerification('owner@example.com', identity, request, { sign }))
      .resolves.toMatchObject({ challengeId: 'emv_1' })

    expectSignedRequest(request, 'POST', '/v1/notification-email/request-verification', body)
    await expectCanonical(sign, request, 'POST', '/v1/notification-email/request-verification', body)
    vi.restoreAllMocks()
  })

  it('sends the fixed consent version when confirming an email', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, verified: true, emailEnabled: true }))
    const sign = vi.fn(async () => 'signature')
    const body = JSON.stringify({ challengeId: 'emv_1', code: '123456', consentVersion: 'email-reminder-v1' })

    await confirmNotificationEmail('emv_1', '123456', identity, request, { sign })

    expectSignedRequest(request, 'POST', '/v1/notification-email/confirm', body)
    await expectCanonical(sign, request, 'POST', '/v1/notification-email/confirm', body)
  })

  it('reads, updates, and deletes notification settings through signed routes', async () => {
    const responses = [
      { email: 'o***r@example.com', emailVerified: true, emailEnabled: true, consentVersion: 'email-reminder-v1', lastDelivery: null },
      { ok: true, emailEnabled: false },
      { ok: true, email: null, emailVerified: false, emailEnabled: false },
    ]
    const request = vi.fn<typeof fetch>(async () => Response.json(responses.shift()))
    const sign = vi.fn(async () => 'signature')

    await expect(getNotificationSettings(identity, request, { sign })).resolves.toMatchObject({ emailVerified: true })
    await setNotificationEmailEnabled(false, identity, request, { sign })
    await deleteNotificationEmail(identity, request, { sign })

    expectSignedRequest(request, 'GET', '/v1/notification-settings', '', 0)
    expectSignedRequest(request, 'PATCH', '/v1/notification-settings', JSON.stringify({ emailEnabled: false }), 1)
    expectSignedRequest(request, 'DELETE', '/v1/notification-email', '', 2)
    await expectCanonical(sign, request, 'GET', '/v1/notification-settings', '', 0)
    await expectCanonical(sign, request, 'PATCH', '/v1/notification-settings', JSON.stringify({ emailEnabled: false }), 1)
    await expectCanonical(sign, request, 'DELETE', '/v1/notification-email', '', 2)
  })

  it('rejects malformed notification settings responses', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ email: null, emailVerified: 'yes', emailEnabled: false, consentVersion: null }))

    await expect(getNotificationSettings(identity, request, { sign: vi.fn(async () => 'signature') }))
      .rejects.toThrow('invalid_server_response')
  })
})

function expectSignedRequest(
  request: ReturnType<typeof vi.fn<typeof fetch>>,
  method: string,
  path: string,
  body: string,
  callIndex = 0,
) {
  expect(request.mock.calls[callIndex]?.[0]).toBe(`${notifyApiOrigin}${path}`)
  expect(request.mock.calls[callIndex]?.[1]).toEqual(expect.objectContaining({
    method,
    ...(body ? { body } : {}),
  }))
}

async function expectCanonical(
  sign: ReturnType<typeof vi.fn>,
  request: ReturnType<typeof vi.fn<typeof fetch>>,
  method: string,
  path: string,
  body: string,
  callIndex = 0,
) {
  const headers = request.mock.calls[callIndex]?.[1]?.headers as Record<string, string>
  const encoded = String(sign.mock.calls[callIndex]?.[1])
  const canonical = new TextDecoder().decode(Uint8Array.from(atob(encoded), (character) => character.charCodeAt(0)))
  expect(canonical).toBe([
    'v1',
    method,
    path,
    identity.deviceId,
    headers['x-timestamp'],
    headers['x-nonce'],
    await sha256Hex(body),
  ].join('\n'))
}
