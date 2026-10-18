import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  confirmNotificationEmail,
  createDiaryShare,
  deleteNotificationEmail,
  getNotifyApiOrigin,
  getNotificationSettings,
  getDiaryShareReceipts,
  isNotificationServiceConfigured,
  NotifyApiError,
  requestNotificationEmailVerification,
  sendDiaryCreatedEvent,
  setNotificationEmailEnabled,
  sha256Hex,
  submitFeedback,
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

  it('signs feedback without a client-selected recipient and requires the matching acceptance', async () => {
    const input = { feedbackId: 'fb_test', content: '  我有一个想法  ', to: 'ignored@example.com' }
    const request = vi.fn<typeof fetch>(async () => Response.json({ feedbackId: input.feedbackId, status: 'accepted' }, { status: 202 }))
    const sign = vi.fn(async () => 'signature')
    await submitFeedback(input, identity, request, { sign })
    const body = JSON.stringify({ feedbackId: input.feedbackId, content: '我有一个想法' })
    expectSignedRequest(request, 'POST', '/v1/feedback', body)
    await expectCanonical(sign, request, 'POST', '/v1/feedback', body)
    request.mockResolvedValueOnce(Response.json({ feedbackId: 'fb_other', status: 'accepted' }, { status: 202 }))
    await expect(submitFeedback(input, identity, request, { sign })).rejects.toMatchObject({ message: 'invalid_server_response', retryable: true })
  })

  it.each(['', '   ', '字'.repeat(2001), '不能包含\u0000'])('rejects invalid feedback before signing or requesting', async (content) => {
    const request = vi.fn<typeof fetch>()
    const sign = vi.fn(async () => 'signature')
    await expect(submitFeedback({ feedbackId: 'fb_test', content }, identity, request, { sign })).rejects.toThrow('invalid_feedback')
    expect(request).not.toHaveBeenCalled()
    expect(sign).not.toHaveBeenCalled()
  })

  it.each(['headers', 'body'])('bounds a stalled %s response even when fetch does not react to abort', async (stall) => {
    vi.useFakeTimers()
    let started!: () => void
    const ready = new Promise<void>((resolve) => { started = resolve })
    const request = vi.fn<typeof fetch>(async () => {
      started()
      if (stall === 'headers') return new Promise<Response>(() => {})
      return { ok: true, headers: new Headers(), json: () => new Promise(() => {}) } as Response
    })
    try {
      const input = { feedbackId: 'fb_retry', content: '想法' }
      const pending = submitFeedback(input, identity, request, { sign: vi.fn(async () => 'signature') })
      const assertion = expect(pending).rejects.toMatchObject({ message: 'request_timeout', retryable: true })
      await ready
      await vi.advanceTimersByTimeAsync(15_000)
      await assertion
      expect(request.mock.calls[0]?.[1]?.signal?.aborted).toBe(true)
      request.mockResolvedValueOnce(Response.json({ feedbackId: input.feedbackId, status: 'accepted' }, { status: 202 }))
      await submitFeedback(input, identity, request, { sign: vi.fn(async () => 'signature') })
      expect(request.mock.calls[0]?.[1]?.body).toBe(request.mock.calls[1]?.[1]?.body)
    } finally {
      vi.useRealTimers()
    }
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

  it('sends only the five diary share fields', async () => {
    const request = vi.fn<typeof fetch>(async () => Response.json({ ok: true, shareId: 'dsh_1', status: 'queued' }, { status: 202 }))
    const input = {
      shareId: 'dsh_1',
      occurredAt: 1_790_000_000_000,
      title: '今天',
      body: '只发送纯文本正文',
      consentVersion: 'diary-share-v1',
      to: 'attacker@example.com',
      images: ['private.jpg'],
    }

    await createDiaryShare(input, identity, request, { sign: vi.fn(async () => 'signature') })

    expect(JSON.parse(String(request.mock.calls[0]?.[1]?.body))).toEqual({
      shareId: input.shareId,
      occurredAt: input.occurredAt,
      title: input.title,
      body: input.body,
      consentVersion: input.consentVersion,
    })
  })

  it('signs receipt GET requests including the cursor and preserves the read timestamp', async () => {
    const readAt = 1_790_000_000_000
    const request = vi.fn<typeof fetch>(async () => Response.json({
      items: [{ shareId: 'dsh_test', status: 'read', readAt, reaction: 'seen' }], nextCursor: null,
    }))
    const sign = vi.fn(async () => 'signature')
    await expect(getDiaryShareReceipts(identity, 'cursor_123', request, { sign })).resolves.toEqual({
      items: [{ shareId: 'dsh_test', status: 'read', readAt, reaction: 'seen' }], nextCursor: null,
    })
    await expectCanonical(sign, request, 'GET', '/v1/diary-share-receipts?cursor=cursor_123', '')
    expect(request.mock.calls[0]?.[1]?.body).toBeUndefined()
  })

  it('identifies a Cloudflare challenge response separately from invalid JSON', async () => {
    const request = vi.fn<typeof fetch>(async () => new Response('<html>Just a moment...</html>', {
      status: 403, headers: { 'content-type': 'text/html', 'cf-mitigated': 'challenge' },
    }))
    await expect(getDiaryShareReceipts(identity, null, request, { sign: vi.fn(async () => 'signature') }))
      .rejects.toMatchObject({ message: 'cloudflare_challenge', retryable: true })
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
