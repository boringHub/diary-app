import type { DiaryCreatedEvent } from './diaryEventQueue'
import { deviceKeyAuth } from './deviceKeyAuth'

const REQUEST_TIMEOUT_MS = 15_000
const EVENT_TYPES = new Set(['diary_created', 'diary_updated', 'diary_favorited'])
const MOODS = new Set(['calm', 'happy', 'low', 'tired', 'hopeful'])
export const DIARY_SHARE_CONSENT_VERSION = 'diary-share-v1'
export const FEEDBACK_MAX_LENGTH = 2_000

export interface FeedbackInput {
  feedbackId: string
  content: string
}

export interface DeviceIdentity {
  deviceId: string
  publicKey: string
  alias: string
}

export class NotifyApiError extends Error {
  constructor(message: string, readonly retryable: boolean) {
    super(message)
    this.name = 'NotifyApiError'
  }
}

export interface DeviceSigner {
  sign(alias: string, dataBase64: string): Promise<string>
}

export interface NotificationSettings {
  email: string | null
  emailVerified: boolean
  emailEnabled: boolean
  consentVersion: string | null
  lastDelivery: { status: string; updatedAt: number } | null
}

export interface VerificationChallenge {
  challengeId: string
  expiresAt: number
  resendAvailableAt: number
}

export interface DiaryShareRecipient {
  enabled: boolean
  authorized: boolean
  recipientName: string | null
  recipientEmail: string | null
  consentVersion: string
}

export interface DiaryShareReceipt {
  shareId: string
  status: string
  readAt: number | null
  reaction: string | null
}

export function getNotifyApiOrigin() {
  const configured = import.meta.env.VITE_NOTIFY_API_ORIGIN?.trim()
  if (!configured) return ''
  try {
    const url = new URL(configured)
    if (
      url.protocol !== 'https:' ||
      url.username ||
      url.password ||
      url.pathname !== '/' ||
      url.search ||
      url.hash
    ) return ''
    return url.origin
  } catch {
    return ''
  }
}

export function isNotificationServiceConfigured() {
  return Boolean(getNotifyApiOrigin())
}

export async function sendDiaryCreatedEvent(
  event: DiaryCreatedEvent,
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  const payload = toAllowedPayload(event)
  if (payload.deviceId !== identity.deviceId) throw new NotifyApiError('device_id_mismatch', false)
  const body = JSON.stringify(payload)
  return sendSignedRequest({ method: 'POST', path: '/v1/events', body, identity, request, signer, expectedEventId: event.eventId })
}

export async function registerDevice(
  identity: DeviceIdentity,
  appVersion: string,
  request: typeof fetch = fetch,
) {
  const origin = requireNotifyApiOrigin()
  const body = JSON.stringify({ deviceId: identity.deviceId, publicKey: identity.publicKey, platform: 'android', appVersion })
  const { response, result } = await requestJsonWithTimeout(request, `${origin}/v1/device/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  })
  if (response.status === 201 || response.status === 200) return result
  throw apiError(result, response.status)
}

export async function getDeviceStatus(
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  return sendSignedRequest({ method: 'GET', path: '/v1/device/status', body: '', identity, request, signer })
}

export async function requestNotificationEmailVerification(
  email: string,
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
): Promise<VerificationChallenge> {
  const result = await sendSignedRequest({
    method: 'POST',
    path: '/v1/notification-email/request-verification',
    body: JSON.stringify({ email }),
    identity,
    request,
    signer,
  })
  if (typeof result.challengeId !== 'string' || !Number.isSafeInteger(result.expiresAt) || !Number.isSafeInteger(result.resendAvailableAt)) {
    throw new NotifyApiError('invalid_server_response', false)
  }
  return result as VerificationChallenge
}

export async function confirmNotificationEmail(
  challengeId: string,
  code: string,
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  const body = JSON.stringify({ challengeId, code, consentVersion: 'email-reminder-v1' })
  return sendSignedRequest({ method: 'POST', path: '/v1/notification-email/confirm', body, identity, request, signer })
}

export async function getNotificationSettings(
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
): Promise<NotificationSettings> {
  const result = await sendSignedRequest({ method: 'GET', path: '/v1/notification-settings', body: '', identity, request, signer })
  if (
    (result.email !== null && typeof result.email !== 'string') ||
    typeof result.emailVerified !== 'boolean' ||
    typeof result.emailEnabled !== 'boolean' ||
    (result.consentVersion !== null && typeof result.consentVersion !== 'string')
  ) throw new NotifyApiError('invalid_server_response', false)
  return {
    email: result.email,
    emailVerified: result.emailVerified,
    emailEnabled: result.emailEnabled,
    consentVersion: result.consentVersion,
    lastDelivery: result.lastDelivery && typeof result.lastDelivery.status === 'string' && Number.isSafeInteger(result.lastDelivery.updatedAt)
      ? { status: result.lastDelivery.status, updatedAt: result.lastDelivery.updatedAt }
      : null,
  }
}

export async function setNotificationEmailEnabled(
  emailEnabled: boolean,
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  return sendSignedRequest({
    method: 'PATCH',
    path: '/v1/notification-settings',
    body: JSON.stringify({ emailEnabled }),
    identity,
    request,
    signer,
  })
}

export async function deleteNotificationEmail(
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  return sendSignedRequest({ method: 'DELETE', path: '/v1/notification-email', body: '', identity, request, signer })
}

export async function getDiaryShareRecipient(
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
): Promise<DiaryShareRecipient> {
  const result = await sendSignedRequest({ method: 'GET', path: '/v1/diary-share-recipient', body: '', identity, request, signer })
  if (typeof result.enabled !== 'boolean' || typeof result.authorized !== 'boolean' ||
      (result.recipientName !== null && typeof result.recipientName !== 'string') ||
      (result.recipientEmail !== null && typeof result.recipientEmail !== 'string') ||
      typeof result.consentVersion !== 'string') throw new NotifyApiError('invalid_server_response', false)
  return result as DiaryShareRecipient
}

export async function redeemDiarySharePairing(
  code: string,
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  return sendSignedRequest({ method: 'POST', path: '/v1/diary-share-pairing', body: JSON.stringify({ code }), identity, request, signer })
}

export async function ensureDiaryShareAuthorization(
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
): Promise<DiaryShareRecipient> {
  const result = await sendSignedRequest({ method: 'POST', path: '/v1/diary-share-auto-authorize', body: '', identity, request, signer })
  if (typeof result.enabled !== 'boolean' || typeof result.authorized !== 'boolean' ||
      (result.recipientName !== null && typeof result.recipientName !== 'string') ||
      (result.recipientEmail !== null && typeof result.recipientEmail !== 'string') ||
      typeof result.consentVersion !== 'string') throw new NotifyApiError('invalid_server_response', false)
  return result as DiaryShareRecipient
}

export async function createDiaryShare(
  input: { shareId: string; occurredAt: number; title: string; body: string; consentVersion: string },
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  const payload = {
    shareId: input.shareId,
    occurredAt: input.occurredAt,
    title: input.title,
    body: input.body,
    consentVersion: input.consentVersion,
  }
  const result = await sendSignedRequest({ method: 'POST', path: '/v1/diary-shares', body: JSON.stringify(payload), identity, request, signer })
  if (typeof result.shareId !== 'string' || typeof result.status !== 'string') throw new NotifyApiError('invalid_server_response', false)
  return { shareId: result.shareId, status: result.status }
}

export async function getDiaryShareReceipts(
  identity: DeviceIdentity,
  cursor: string | null = null,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
): Promise<{ items: DiaryShareReceipt[]; nextCursor: string | null }> {
  const path = cursor ? `/v1/diary-share-receipts?cursor=${encodeURIComponent(cursor)}` : '/v1/diary-share-receipts'
  const result = await sendSignedRequest({ method: 'GET', path, body: '', identity, request, signer })
  if (!Array.isArray(result.items) || (result.nextCursor !== null && typeof result.nextCursor !== 'string')) throw new NotifyApiError('invalid_server_response', false)
  return {
    items: result.items.filter((item: any) => typeof item?.shareId === 'string' && typeof item?.status === 'string').map((item: any) => ({
      shareId: item.shareId,
      status: item.status,
      readAt: Number.isSafeInteger(item.readAt) ? item.readAt : null,
      reaction: typeof item.reaction === 'string' ? item.reaction : null,
    })),
    nextCursor: result.nextCursor,
  }
}

export async function submitFeedback(
  input: FeedbackInput,
  identity: DeviceIdentity,
  request: typeof fetch = fetch,
  signer: DeviceSigner = deviceKeyAuth,
) {
  const content = input.content.replace(/\r\n?/g, '\n').trim()
  if (!/^fb_[\w-]{1,128}$/.test(input.feedbackId) || !content || Array.from(content).length > FEEDBACK_MAX_LENGTH || /[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(content)) {
    throw new NotifyApiError('invalid_feedback', false)
  }
  const result = await sendSignedRequest({
    method: 'POST', path: '/v1/feedback', body: JSON.stringify({ feedbackId: input.feedbackId, content }), identity, request, signer,
  })
  if (result.feedbackId !== input.feedbackId || result.status !== 'accepted') throw new NotifyApiError('invalid_server_response', true)
}

async function sendSignedRequest(options: {
  method: string
  path: string
  body: string
  identity: DeviceIdentity
  request: typeof fetch
  signer: DeviceSigner
  expectedEventId?: string
}) {
  const origin = requireNotifyApiOrigin()
  const timestamp = Math.floor(Date.now() / 1_000).toString()
  const nonce = crypto.randomUUID()
  const bodyHash = await sha256Hex(options.body)
  const canonical = ['v1', options.method.toUpperCase(), options.path, options.identity.deviceId, timestamp, nonce, bodyHash].join('\n')
  let signature: string
  try {
    signature = await options.signer.sign(options.identity.alias, encodeBase64(canonical))
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    throw new NotifyApiError(message, isTransientKeyError(message))
  }

  const { response, result } = await requestJsonWithTimeout(options.request, `${origin}${options.path}`, {
    method: options.method,
    headers: {
      ...(options.body ? { 'content-type': 'application/json' } : {}),
      'x-device-id': options.identity.deviceId,
      'x-timestamp': timestamp,
      'x-nonce': nonce,
      'x-signature': signature,
    },
    ...(options.body ? { body: options.body } : {}),
  })
  if ((response.status === 202 && result.status === 'accepted') || (response.status === 200 && result.status === 'duplicate')) {
    if (options.expectedEventId !== undefined && result.eventId !== options.expectedEventId) {
      throw new NotifyApiError('event_id_mismatch', false)
    }
    return result
  }
  if (response.status >= 200 && response.status < 300) return result
  throw apiError(result, response.status)
}

function requireNotifyApiOrigin() {
  const origin = getNotifyApiOrigin()
  if (!origin) throw new NotifyApiError('notification_service_unconfigured', false)
  return origin
}

async function requestJsonWithTimeout(request: typeof fetch, url: string, init: RequestInit) {
  const controller = new AbortController()
  let timeout: ReturnType<typeof setTimeout> | undefined
  const deadline = new Promise<never>((_resolve, reject) => {
    timeout = setTimeout(() => {
      reject(new NotifyApiError('request_timeout', true))
      controller.abort()
    }, REQUEST_TIMEOUT_MS)
  })
  try {
    return await Promise.race([
      (async () => {
        const response = await request(url, { ...init, signal: controller.signal })
        return { response, result: await readResponse(response) }
      })(),
      deadline,
    ])
  } catch (error) {
    if (error instanceof NotifyApiError) throw error
    throw new NotifyApiError(error instanceof Error && error.name === 'AbortError' ? 'request_timeout' : 'network_unavailable', true)
  } finally {
    clearTimeout(timeout)
  }
}

async function readResponse(response: Response): Promise<Record<string, any>> {
  if (response.headers.get('cf-mitigated') === 'challenge') {
    throw new NotifyApiError('cloudflare_challenge', true)
  }
  try {
    const result: unknown = await response.json()
    return result && typeof result === 'object' ? result as Record<string, any> : {}
  } catch {
    throw new NotifyApiError('invalid_server_response', response.ok || response.status >= 500)
  }
}

function apiError(body: Record<string, any>, status: number) {
  return new NotifyApiError(typeof body.error === 'string' ? body.error : `http_${status}`, status === 408 || status === 429 || status >= 500)
}

function isTransientKeyError(message: string) {
  return message === 'KEYSTORE_UNAVAILABLE' || message === 'SIGN_FAILED'
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

export async function sha256Hex(value: string) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(value))
  return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('')
}

function encodeBase64(value: string) {
  const bytes = new TextEncoder().encode(value)
  let binary = ''
  for (const byte of bytes) binary += String.fromCharCode(byte)
  return btoa(binary)
}
