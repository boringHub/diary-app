import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { diaryAssetStorage, type StoredDiaryAsset } from '../services/diaryAssetStorage'
import { validateDiaryImageInputs } from '../services/diaryImageValidation'
import {
  listReadyDiaryEvents,
  markDiaryEventAttempt,
  markDiaryEventFailed,
  markDiaryEventSent,
  markDiaryEventTerminal,
} from '../services/diaryEventQueue'
import {
  confirmNotificationEmail,
  createDiaryShare,
  deleteNotificationEmail,
  DIARY_SHARE_CONSENT_VERSION,
  getDiaryShareReceipts,
  getDiaryShareRecipient,
  ensureDiaryShareAuthorization,
  getNotificationSettings,
  isNotificationServiceConfigured,
  NotifyApiError,
  redeemDiarySharePairing,
  requestNotificationEmailVerification,
  sendDiaryCreatedEvent,
  setNotificationEmailEnabled,
  submitFeedback,
  type FeedbackInput,
} from '../services/notifyApiClient'
import { withRegisteredDevice } from '../services/deviceIdentity'
import { settingsRepository } from './settingsRepository'
import {
  createFixedLayout,
  DEFAULT_DIARY_BOARD_PACK,
  getDiaryBoardPack,
  isLayoutForBoardPack,
  type DiaryBoardPack,
} from '../services/diaryBoardService'
import type {
  Diary,
  DiaryAsset,
  DiaryBlock,
  DiaryImageInput,
  DiaryLayout,
  DiaryShareStatus,
  Mood,
  SaveDiaryImageInput,
} from '../types/diary'
import type { DiaryRepository, DiaryShareReadNotice, DiaryShareReceiptSync, SaveDiaryInput } from './diaryRepository'
import { DATABASE_NAME, DATABASE_SCHEMA, DATABASE_UPGRADES, DATABASE_VERSION } from './sqliteSchema'

type Row = Record<string, unknown>

const DIARY_SHARE_AUTHORIZATION_CACHE_MS = 60_000
const SHARE_RECEIPT_INTERVAL_MS = 5 * 60_000
const SHARE_RETRY_DELAY_MS = 30_000
const MAX_SHARE_RETRY_DELAY_MS = 30 * 60_000
let diaryShareAuthorizationCache: { recipient: Awaited<ReturnType<typeof ensureDiaryShareAuthorization>>; expiresAt: number } | undefined

export class SQLiteDiaryRepository implements DiaryRepository {
  private readonly sqlite = new SQLiteConnection(CapacitorSQLite)
  private connectionPromise?: Promise<SQLiteDBConnection>
  private nextShareRetryAt = 0
  private shareRetryDelay = SHARE_RETRY_DELAY_MS
  private receiptSyncPromise?: Promise<DiaryShareReceiptSync>

  async list(): Promise<Diary[]> {
    const db = await this.connection()
    const result = await db.query('SELECT * FROM diaries WHERE is_deleted = 0 ORDER BY updated_at DESC')
    return Promise.all((result.values ?? []).map((row) => this.hydrate(db, row as Row)))
  }

  async get(id: string): Promise<Diary | undefined> {
    const db = await this.connection()
    const result = await db.query('SELECT * FROM diaries WHERE id = ? AND is_deleted = 0 LIMIT 1', [id])
    return result.values?.[0] ? this.hydrate(db, result.values[0] as Row) : undefined
  }

  async save(input: SaveDiaryInput): Promise<Diary> {
    const db = await this.connection()
    const existing = input.id ? await this.get(input.id) : undefined
    const now = Date.now()
    const id = existing?.id ?? crypto.randomUUID()
    const createdAt = existing?.createdAt ?? now
    const imageInputs = input.images ?? existing?.assets.map((asset) => ({ assetId: asset.id })) ?? []
    validateDiaryImageInputs(imageInputs)
    const resolved = await this.resolveImages(id, imageInputs, existing?.assets ?? [])
    const blocks = this.createBlocks(id, input.body, resolved.assets)
    const boardPack = getDiaryBoardPack(existing?.boardPackId, existing?.boardPackVersion)
    const boardPackId = boardPack.id
    const boardPackVersion = boardPack.version
    const layoutId = existing?.layoutId ?? `layout-${id}`
    const layout = createFixedLayout(blocks, boardPack)
    const summary = this.summary(input.body, resolved.assets)
    const removed = (existing?.assets ?? []).filter(
      (asset) => !resolved.assets.some((next) => next.id === asset.id),
    )
    let transactionStarted = false
    try {
      await db.beginTransaction()
      transactionStarted = true
      await db.run(
        `INSERT INTO diaries (
          id, title, summary, created_at, updated_at, mood, theme_id, theme_version,
          layout_id, is_favorite, is_archived, is_deleted, cover_asset_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0, 0, ?)
        ON CONFLICT(id) DO UPDATE SET
          title = excluded.title,
          summary = excluded.summary,
          updated_at = excluded.updated_at,
          mood = excluded.mood,
          theme_id = excluded.theme_id,
          theme_version = excluded.theme_version,
          layout_id = excluded.layout_id,
          cover_asset_id = excluded.cover_asset_id`,
        [
          id,
          input.title,
          summary,
          createdAt,
          now,
          input.mood,
          boardPackId,
          boardPackVersion,
          layoutId,
          existing?.isFavorite ? 1 : 0,
          resolved.assets[0]?.id ?? null,
        ],
        false,
      )

      await db.run('DELETE FROM diary_blocks WHERE diary_id = ?', [id], false)
      for (const block of blocks) {
        await db.run(
          `INSERT INTO diary_blocks (
            id, diary_id, block_type, sort_order, content_json, created_at, updated_at
          ) VALUES (?, ?, ?, ?, ?, ?, ?)`,
          [block.id, id, block.blockType, block.sortOrder, JSON.stringify(block.content), createdAt, now],
          false,
        )
      }

      await db.run('DELETE FROM diary_assets WHERE diary_id = ?', [id], false)
      for (const asset of resolved.assets) {
        await db.run(
          `INSERT INTO diary_assets (
            id, diary_id, asset_type, local_path, width, height, file_size, mime_type, created_at, metadata_json
          ) VALUES (?, ?, 'image', ?, ?, ?, ?, ?, ?, NULL)`,
          [
            asset.id,
            id,
            asset.localPath,
            asset.width ?? null,
            asset.height ?? null,
            asset.fileSize ?? null,
            asset.mimeType ?? null,
            asset.createdAt,
          ],
          false,
        )
      }

      await db.run(
        `INSERT INTO diary_layouts (
          id, diary_id, schema_version, layout_json, created_at, updated_at
        ) VALUES (?, ?, 1, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          layout_json = excluded.layout_json,
          updated_at = excluded.updated_at`,
        [layoutId, id, JSON.stringify(layout), createdAt, now],
        false,
      )
      await db.commitTransaction()
      transactionStarted = false
    } catch (error) {
      if (transactionStarted) await db.rollbackTransaction().catch(() => undefined)
      await Promise.all(resolved.created.map((asset) => diaryAssetStorage.remove(asset)))
      throw error
    }

    await Promise.all(removed.map((asset) => diaryAssetStorage.remove(asset)))
    return this.hydrate(db, {
      id,
      title: input.title,
      summary,
      created_at: createdAt,
      updated_at: now,
      mood: input.mood,
      theme_id: boardPackId,
      theme_version: boardPackVersion,
      layout_id: layoutId,
      is_favorite: existing?.isFavorite ? 1 : 0,
      is_deleted: 0,
    })
  }

  async toggleFavorite(id: string): Promise<void> {
    const db = await this.connection()
    await db.run(
      `UPDATE diaries
       SET is_favorite = CASE is_favorite WHEN 1 THEN 0 ELSE 1 END, updated_at = ?
       WHERE id = ? AND is_deleted = 0`,
      [Date.now(), id],
    )
  }

  async remove(id: string): Promise<void> {
    const db = await this.connection()
    await db.run('UPDATE diaries SET is_deleted = 1, updated_at = ? WHERE id = ?', [Date.now(), id])
  }

  async syncPendingNotificationEvents(): Promise<void> {
    if (!isNotificationServiceConfigured()) return
    const notificationSettings = settingsRepository.get()
    if (!notificationSettings.notificationEnabled || !notificationSettings.notificationEmailVerified) return
    const db = await this.connection()
    const events = await listReadyDiaryEvents(db)
    for (const event of events) {
      await markDiaryEventAttempt(db, event.id)
      try {
        await withRegisteredDevice(db, (identity) => sendDiaryCreatedEvent(event.payload, identity))
        await markDiaryEventSent(db, event.id)
      } catch (error) {
        if (error instanceof NotifyApiError && !error.retryable) {
          await markDiaryEventTerminal(db, event.id, error)
        } else {
          await markDiaryEventFailed(db, event.id, error)
        }
      }
    }
  }

  async syncPendingNotificationSettings(): Promise<void> {
    if (!isNotificationServiceConfigured()) return
    const local = settingsRepository.get()
    if (!local.notificationSyncPending || !local.notificationEmailVerified) return
    const db = await this.connection()
    await withRegisteredDevice(db, (identity) => setNotificationEmailEnabled(local.notificationEnabled, identity))
    settingsRepository.update({ notificationSyncPending: false })
  }

  async getNotificationSettings() {
    this.requireNotificationService()
    const db = await this.connection()
    return withRegisteredDevice(db, getNotificationSettings)
  }

  async requestNotificationEmailVerification(email: string) {
    this.requireNotificationService()
    const db = await this.connection()
    return withRegisteredDevice(db, (identity) => requestNotificationEmailVerification(email, identity))
  }

  async confirmNotificationEmail(challengeId: string, code: string) {
    this.requireNotificationService()
    const db = await this.connection()
    await withRegisteredDevice(db, (identity) => confirmNotificationEmail(challengeId, code, identity))
  }

  async setNotificationEmailEnabled(enabled: boolean) {
    this.requireNotificationService()
    const db = await this.connection()
    await withRegisteredDevice(db, (identity) => setNotificationEmailEnabled(enabled, identity))
    settingsRepository.update({ notificationSyncPending: false })
  }

  async deleteNotificationEmail() {
    this.requireNotificationService()
    const db = await this.connection()
    await withRegisteredDevice(db, deleteNotificationEmail)
    settingsRepository.update({
      notificationEnabled: false,
      notificationEmail: '',
      notificationPendingEmail: '',
      notificationEmailVerified: false,
      notificationChallengeId: '',
      notificationChallengeExpiresAt: 0,
      notificationChallengeResendAvailableAt: 0,
      notificationSyncPending: false,
    })
  }

  async submitFeedback(input: FeedbackInput): Promise<void> {
    this.requireNotificationService()
    const db = await this.connection()
    await withRegisteredDevice(db, (identity) => submitFeedback(input, identity))
  }

  async getDiaryShareRecipient() {
    this.requireNotificationService()
    const db = await this.connection()
    return withRegisteredDevice(db, getDiaryShareRecipient)
  }

  async ensureDiaryShareAuthorization() {
    this.requireNotificationService()
    const cached = diaryShareAuthorizationCache
    if (cached && cached.expiresAt > Date.now()) return cached.recipient
    const db = await this.connection()
    const recipient = await withRegisteredDevice(db, ensureDiaryShareAuthorization)
    diaryShareAuthorizationCache = { recipient, expiresAt: Date.now() + DIARY_SHARE_AUTHORIZATION_CACHE_MS }
    return recipient
  }

  async redeemDiarySharePairing(code: string) {
    this.requireNotificationService()
    const db = await this.connection()
    await withRegisteredDevice(db, (identity) => redeemDiarySharePairing(code.trim().toUpperCase(), identity))
    diaryShareAuthorizationCache = undefined
  }

  async shareDiary(id: string): Promise<Diary> {
    this.requireNotificationService()
    const db = await this.connection()
    const diary = await this.get(id)
    if (!diary) throw new NotifyApiError('diary_not_found', false)
    if (diary.shareStatus !== 'none') throw new NotifyApiError('diary_already_shared', false)

    const shareId = `dsh_${crypto.randomUUID()}`
    const now = Date.now()
    await db.run(
      `INSERT INTO diary_share_states (
        diary_id, share_id, status, consent_version, shared_title, shared_body, shared_occurred_at,
        created_at, updated_at, read_at, notified_at, last_error
      ) VALUES (?, ?, 'pending', ?, ?, ?, ?, ?, ?, NULL, NULL, NULL)`,
      [id, shareId, DIARY_SHARE_CONSENT_VERSION, diary.title, diary.body, now, now, now],
    )
    return this.sendDiaryShare(db, diary.id, {
      shareId,
      occurredAt: now,
      title: diary.title,
      body: diary.body,
      consentVersion: DIARY_SHARE_CONSENT_VERSION,
    })
  }

  async retryDiaryShare(id: string): Promise<Diary> {
    this.requireNotificationService()
    const db = await this.connection()
    const diary = await this.get(id)
    if (!diary) throw new NotifyApiError('diary_not_found', false)
    const state = await this.getShareState(db, id)
    if (!state || this.mapShareStatus(state.status) !== 'failed') {
      throw new NotifyApiError('diary_share_not_retryable', false)
    }
    await this.updateShareState(db, id, 'pending', null)
    return this.sendDiaryShare(db, diary.id, this.sharePayload(state))
  }

  async syncPendingDiaryShares(): Promise<void> {
    if (!isNotificationServiceConfigured() || Date.now() < this.nextShareRetryAt) return
    const db = await this.connection()
    const result = await db.query(
      `SELECT s.diary_id, s.share_id, s.consent_version, s.shared_title, s.shared_body, s.shared_occurred_at
       FROM diary_share_states s
       JOIN diaries d ON d.id = s.diary_id
       WHERE s.status = 'pending' AND d.is_deleted = 0 AND s.updated_at <= ?
       ORDER BY s.updated_at ASC`,
      [Date.now() - SHARE_RETRY_DELAY_MS],
    )
    if (!result.values?.length) return
    this.nextShareRetryAt = Date.now() + this.shareRetryDelay
    let retryNeeded = false
    for (const row of result.values ?? []) {
      try {
        const response = await withRegisteredDevice(db, (identity) => createDiaryShare(this.sharePayload(row as Row), identity))
        await this.updateShareState(db, String(row.diary_id), this.mapShareStatus(response.status), null)
      } catch (error) {
        const status = this.failureStatus(error)
        await this.updateShareState(db, String(row.diary_id), status, this.errorMessage(error))
        if (status === 'pending') {
          retryNeeded = true
          break
        }
      }
    }
    this.shareRetryDelay = retryNeeded ? Math.min(this.shareRetryDelay * 2, MAX_SHARE_RETRY_DELAY_MS) : SHARE_RETRY_DELAY_MS
    this.nextShareRetryAt = Date.now() + this.shareRetryDelay
  }

  syncDiaryShareReceipts(): Promise<DiaryShareReceiptSync> {
    this.receiptSyncPromise ??= this.syncShareReceipts().finally(() => { this.receiptSyncPromise = undefined })
    return this.receiptSyncPromise
  }

  private async syncShareReceipts(): Promise<DiaryShareReceiptSync> {
    const skipped: DiaryShareReceiptSync = { notices: [], checked: false, nextCheckAt: null }
    if (!isNotificationServiceConfigured()) return skipped
    const db = await this.connection()
    const pending = await db.query(
      `SELECT s.share_id FROM diary_share_states s JOIN diaries d ON d.id = s.diary_id
       WHERE s.status IN ('queued', 'processing', 'sent') AND d.is_deleted = 0 LIMIT 1`,
    )
    if (!pending.values?.length) return skipped
    const lastCheck = await db.query("SELECT value_json FROM app_settings WHERE key = 'diary_share_receipt_last_check' LIMIT 1")
    const lastCheckedAt = Number(lastCheck.values?.[0]?.value_json ?? 0)
    const checkedAt = Date.now()
    if (Number.isFinite(lastCheckedAt) && lastCheckedAt <= checkedAt && checkedAt - lastCheckedAt < SHARE_RECEIPT_INTERVAL_MS) {
      return { ...skipped, nextCheckAt: lastCheckedAt + SHARE_RECEIPT_INTERVAL_MS }
    }
    // Persist the attempt time so restarting or losing the network cannot bypass the request interval.
    await db.run(
      `INSERT INTO app_settings (key, value_json, updated_at) VALUES ('diary_share_receipt_last_check', ?, ?)
       ON CONFLICT(key) DO UPDATE SET value_json = excluded.value_json, updated_at = excluded.updated_at`,
      [JSON.stringify(checkedAt), checkedAt],
    )

    const notices: DiaryShareReadNotice[] = []
    let cursor: string | null = null
    do {
      const page = await withRegisteredDevice(db, (identity) => getDiaryShareReceipts(identity, cursor))
      for (const receipt of page.items) {
        const local = await db.query(
          `SELECT s.diary_id, s.status, s.notified_at, d.title
           FROM diary_share_states s
           JOIN diaries d ON d.id = s.diary_id
           WHERE s.share_id = ? LIMIT 1`,
          [receipt.shareId],
        )
        const row = local.values?.[0]
        if (!row) continue
        const status = this.mapShareStatus(receipt.status)
        const readAt = status === 'read' ? receipt.readAt ?? Date.now() : null
        const firstRead = status === 'read' && row.notified_at == null
        const now = Date.now()
        await db.run(
          `UPDATE diary_share_states
           SET status = ?, read_at = ?, notified_at = CASE WHEN ? THEN ? ELSE notified_at END,
               last_error = CASE WHEN ? IN ('failed', 'cancelled', 'expired') THEN last_error ELSE NULL END,
               updated_at = ?
           WHERE share_id = ?`,
          [status, readAt, firstRead ? 1 : 0, now, status, now, receipt.shareId],
        )
        if (firstRead) {
          notices.push({ diaryId: String(row.diary_id), title: String(row.title ?? ''), readAt: readAt! })
        }
      }
      cursor = page.nextCursor
    } while (cursor)
    const outstanding = await db.query(
      `SELECT s.share_id FROM diary_share_states s JOIN diaries d ON d.id = s.diary_id
       WHERE s.status IN ('queued', 'processing', 'sent') AND d.is_deleted = 0 LIMIT 1`,
    )
    return { notices, checked: true, nextCheckAt: outstanding.values?.length ? checkedAt + SHARE_RECEIPT_INTERVAL_MS : null }
  }

  private async connection(): Promise<SQLiteDBConnection> {
    this.connectionPromise ??= this.openConnection()
    return this.connectionPromise
  }

  private requireNotificationService() {
    if (!isNotificationServiceConfigured()) {
      throw new NotifyApiError('notification_service_unconfigured', false)
    }
  }

  private async openConnection(): Promise<SQLiteDBConnection> {
    await this.sqlite.addUpgradeStatement(DATABASE_NAME, DATABASE_UPGRADES)
    const existing = await this.sqlite.isConnection(DATABASE_NAME, false)
    const db = existing.result
      ? await this.sqlite.retrieveConnection(DATABASE_NAME, false)
      : await this.sqlite.createConnection(DATABASE_NAME, false, 'no-encryption', DATABASE_VERSION, false)

    if (!(await db.isDBOpen()).result) await db.open()
    await db.execute(DATABASE_SCHEMA, true)
    await this.seedWelcome(db)
    return db
  }

  private async seedWelcome(db: SQLiteDBConnection) {
    const count = await db.query('SELECT COUNT(*) AS total FROM diaries')
    if (Number(count.values?.[0]?.total ?? 0) > 0) return

    const now = Date.now() - 86400000
    const body = '欢迎来到拾光笺呀~\n\n先记下一点此刻的心情吧，日记只会留在这台设备里。'
    const block: DiaryBlock = {
      id: 'welcome:text:0',
      diaryId: 'welcome',
      blockType: 'text',
      sortOrder: 0,
      content: { text: body },
    }
    const layout = createFixedLayout([block])

    await db.beginTransaction()
    try {
      await db.run(
        `INSERT INTO diaries (
          id, title, summary, created_at, updated_at, mood, theme_id, theme_version,
          layout_id, is_favorite, is_archived, is_deleted
        ) VALUES ('welcome', ?, ?, ?, ?, 'calm', ?, ?, 'layout-default', 1, 0, 0)`,
        [
          '把今天收进一页笺',
          '这里可以慢慢写下今天的小心情。',
          now,
          now,
          DEFAULT_DIARY_BOARD_PACK.id,
          DEFAULT_DIARY_BOARD_PACK.version,
        ],
        false,
      )
      await db.run(
        `INSERT INTO diary_blocks (
          id, diary_id, block_type, sort_order, content_json, created_at, updated_at
        ) VALUES (?, 'welcome', 'text', 0, ?, ?, ?)`,
        [block.id, JSON.stringify(block.content), now, now],
        false,
      )
      await db.run(
        `INSERT INTO diary_layouts (
          id, diary_id, schema_version, layout_json, created_at, updated_at
        ) VALUES ('layout-default', 'welcome', 1, ?, ?, ?)`,
        [JSON.stringify(layout), now, now],
        false,
      )
      await db.commitTransaction()
    } catch (error) {
      await db.rollbackTransaction()
      throw error
    }
  }

  private async hydrate(db: SQLiteDBConnection, row: Row): Promise<Diary> {
    const id = String(row.id)
    const [blockRows, assetRows, layoutRows, shareRows] = await Promise.all([
      db.query('SELECT * FROM diary_blocks WHERE diary_id = ? ORDER BY sort_order', [id]),
      db.query('SELECT * FROM diary_assets WHERE diary_id = ? ORDER BY created_at', [id]),
      db.query('SELECT layout_json FROM diary_layouts WHERE id = ? LIMIT 1', [String(row.layout_id)]),
      db.query('SELECT * FROM diary_share_states WHERE diary_id = ? LIMIT 1', [id]),
    ])
    const blocks = (blockRows.values ?? []).map((value) => this.mapBlock(value as Row))
    const assets = await Promise.all((assetRows.values ?? []).map((value) => this.mapAsset(value as Row)))
    const bodyContent = blocks.find((block) => block.blockType === 'text')?.content
    const body = bodyContent && 'text' in bodyContent ? String(bodyContent.text ?? '') : ''
    const boardPack = getDiaryBoardPack(String(row.theme_id), String(row.theme_version))
    const share = shareRows.values?.[0]

    return {
      id,
      title: String(row.title ?? ''),
      summary: String(row.summary ?? ''),
      body,
      mood: this.readMood(row.mood),
      createdAt: Number(row.created_at),
      updatedAt: Number(row.updated_at),
      isFavorite: Number(row.is_favorite) === 1,
      isDeleted: Number(row.is_deleted) === 1,
      boardPackId: boardPack.id,
      boardPackVersion: boardPack.version,
      layoutId: String(row.layout_id),
      blocks,
      assets,
      layout: this.readLayout(layoutRows.values?.[0]?.layout_json, boardPack, blocks),
      shareStatus: share ? this.mapShareStatus(share.status) : 'none',
      shareId: share ? String(share.share_id) : undefined,
      shareReadAt: share?.read_at == null ? undefined : Number(share.read_at),
      shareError: share?.last_error == null ? undefined : String(share.last_error),
    }
  }

  private async sendDiaryShare(
    db: SQLiteDBConnection,
    diaryId: string,
    payload: { shareId: string; occurredAt: number; title: string; body: string; consentVersion: string },
  ): Promise<Diary> {
    try {
      const response = await withRegisteredDevice(db, (identity) => createDiaryShare(payload, identity))
      await this.updateShareState(db, diaryId, this.mapShareStatus(response.status), null)
    } catch (error) {
      await this.updateShareState(db, diaryId, this.failureStatus(error), this.errorMessage(error))
      throw error
    }
    return (await this.get(diaryId))!
  }

  private sharePayload(row: Row) {
    return {
      shareId: String(row.share_id),
      occurredAt: Number(row.shared_occurred_at),
      title: String(row.shared_title ?? ''),
      body: String(row.shared_body ?? ''),
      consentVersion: String(row.consent_version),
    }
  }

  private async getShareState(db: SQLiteDBConnection, diaryId: string): Promise<Row | undefined> {
    const result = await db.query('SELECT * FROM diary_share_states WHERE diary_id = ? LIMIT 1', [diaryId])
    return result.values?.[0] as Row | undefined
  }

  private async updateShareState(
    db: SQLiteDBConnection,
    diaryId: string,
    status: DiaryShareStatus,
    error: string | null,
  ) {
    await db.run(
      'UPDATE diary_share_states SET status = ?, last_error = ?, updated_at = ? WHERE diary_id = ?',
      [status, error, Date.now(), diaryId],
    )
  }

  private mapShareStatus(value: unknown): DiaryShareStatus {
    switch (value) {
      case 'pending':
      case 'pending_enqueue':
      case 'retry_scheduled':
        return 'pending'
      case 'queued':
      case 'processing':
      case 'sent':
      case 'read':
      case 'cancelled':
      case 'expired':
        return value
      case 'failed':
      case 'terminal_failed':
        return 'failed'
      default:
        return 'failed'
    }
  }

  private errorMessage(error: unknown) {
    return error instanceof Error ? error.message : String(error)
  }

  private failureStatus(error: unknown): DiaryShareStatus {
    return error instanceof NotifyApiError && error.retryable ? 'pending' : 'failed'
  }

  private mapBlock(row: Row): DiaryBlock {
    const blockType = row.block_type === 'image' ? 'image' : 'text'
    let content: DiaryBlock['content'] = blockType === 'image' ? { assetId: '' } : { text: '' }
    if (typeof row.content_json === 'string') {
      try {
        content = JSON.parse(row.content_json) as DiaryBlock['content']
      } catch {
        // Invalid legacy content remains an empty block of its stored type.
      }
    }
    return {
      id: String(row.id),
      diaryId: String(row.diary_id),
      blockType,
      sortOrder: Number(row.sort_order),
      content,
    }
  }

  private async mapAsset(row: Row): Promise<DiaryAsset> {
    const asset: DiaryAsset = {
      id: String(row.id),
      diaryId: String(row.diary_id),
      assetType: 'image',
      localPath: String(row.local_path),
      width: row.width == null ? undefined : Number(row.width),
      height: row.height == null ? undefined : Number(row.height),
      fileSize: row.file_size == null ? undefined : Number(row.file_size),
      mimeType: row.mime_type == null ? undefined : String(row.mime_type),
      createdAt: Number(row.created_at),
    }
    try {
      asset.url = await diaryAssetStorage.resolveUrl(asset)
    } catch {
      // Missing image files should not make the rest of a diary unreadable.
    }
    return asset
  }

  private readLayout(value: unknown, boardPack: DiaryBoardPack, blocks: DiaryBlock[]): DiaryLayout {
    if (typeof value === 'string') {
      try {
        const layout = JSON.parse(value) as DiaryLayout
        if (isLayoutForBoardPack(layout, boardPack)) return layout
      } catch {
        // Legacy or corrupt layouts are regenerated from blocks below.
      }
    }
    return createFixedLayout(blocks, boardPack)
  }

  private createBlocks(diaryId: string, body: string, assets: DiaryAsset[]): DiaryBlock[] {
    const blocks: DiaryBlock[] = []
    if (body.trim()) {
      blocks.push({
        id: `${diaryId}:text:0`,
        diaryId,
        blockType: 'text',
        sortOrder: 0,
        content: { text: body },
      })
    }
    assets.forEach((asset) => {
      blocks.push({
        id: `${diaryId}:image:${asset.id}`,
        diaryId,
        blockType: 'image',
        sortOrder: blocks.length,
        content: { assetId: asset.id },
      })
    })
    return blocks
  }

  private async resolveImages(diaryId: string, inputs: DiaryImageInput[], existing: DiaryAsset[]) {
    const assets: DiaryAsset[] = []
    const created: DiaryAsset[] = []
    try {
      for (const input of inputs) {
        if ('assetId' in input) {
          const asset = existing.find((item) => item.id === input.assetId)
          if (!asset) throw new Error('有一张原来的图片暂时找不到索引')
          assets.push(asset)
          continue
        }
        const stored = await diaryAssetStorage.saveImage(diaryId, input as SaveDiaryImageInput)
        const asset = this.toAsset(diaryId, stored)
        assets.push(asset)
        created.push(asset)
      }
    } catch (error) {
      await Promise.all(created.map((asset) => diaryAssetStorage.remove(asset)))
      throw error
    }
    return { assets, created }
  }

  private toAsset(diaryId: string, stored: StoredDiaryAsset): DiaryAsset {
    return {
      id: stored.id,
      diaryId,
      assetType: 'image',
      localPath: stored.localPath,
      fileSize: stored.fileSize,
      mimeType: stored.mimeType,
      width: stored.width,
      height: stored.height,
      createdAt: stored.createdAt,
    }
  }

  private summary(body: string, assets: DiaryAsset[]) {
    return body.trim().slice(0, 48) || (assets.length > 0 ? `收好了一张图片 · ${assets.length} 张` : '')
  }

  private readMood(value: unknown): Mood {
    return value === 'happy' || value === 'sad' || value === 'tired' || value === 'excited' ? value : 'calm'
  }
}
