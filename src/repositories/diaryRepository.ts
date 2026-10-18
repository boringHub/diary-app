import { Capacitor } from '@capacitor/core'
import type { Diary, DiaryImageInput, Mood } from '../types/diary'
import type { DiaryShareRecipient, NotificationSettings, VerificationChallenge } from '../services/notifyApiClient'
import { LocalStorageDiaryRepository } from './localStorageDiaryRepository'

export interface SaveDiaryInput {
  id?: string
  title: string
  body: string
  mood: Mood
  images?: DiaryImageInput[]
}

export interface DiaryShareReadNotice {
  diaryId: string
  title: string
  readAt: number
}

export interface DiaryShareReceiptSync {
  notices: DiaryShareReadNotice[]
  checked: boolean
  nextCheckAt: number | null
}

export interface DiaryRepository {
  list(): Promise<Diary[]>
  get(id: string): Promise<Diary | undefined>
  save(input: SaveDiaryInput): Promise<Diary>
  toggleFavorite(id: string): Promise<void>
  remove(id: string): Promise<void>
  syncPendingNotificationEvents(): Promise<void>
  syncPendingNotificationSettings(): Promise<void>
  getNotificationSettings(): Promise<NotificationSettings>
  requestNotificationEmailVerification(email: string): Promise<VerificationChallenge>
  confirmNotificationEmail(challengeId: string, code: string): Promise<void>
  setNotificationEmailEnabled(enabled: boolean): Promise<void>
  deleteNotificationEmail(): Promise<void>
  getDiaryShareRecipient(): Promise<DiaryShareRecipient>
  ensureDiaryShareAuthorization(): Promise<DiaryShareRecipient>
  redeemDiarySharePairing(code: string): Promise<void>
  shareDiary(id: string): Promise<Diary>
  retryDiaryShare(id: string): Promise<Diary>
  syncPendingDiaryShares(): Promise<void>
  syncDiaryShareReceipts(): Promise<DiaryShareReceiptSync>
}

let repositoryPromise: Promise<DiaryRepository> | undefined

function resolveRepository(): Promise<DiaryRepository> {
  repositoryPromise ??= Capacitor.isNativePlatform()
    ? import('./sqliteDiaryRepository').then(({ SQLiteDiaryRepository }) => new SQLiteDiaryRepository())
    : Promise.resolve(new LocalStorageDiaryRepository(() => window.localStorage))
  return repositoryPromise
}

export const diaryRepository: DiaryRepository = {
  async list() {
    return (await resolveRepository()).list()
  },
  async get(id) {
    return (await resolveRepository()).get(id)
  },
  async save(input) {
    return (await resolveRepository()).save(input)
  },
  async toggleFavorite(id) {
    return (await resolveRepository()).toggleFavorite(id)
  },
  async remove(id) {
    return (await resolveRepository()).remove(id)
  },
  async syncPendingNotificationEvents() {
    return (await resolveRepository()).syncPendingNotificationEvents()
  },
  async syncPendingNotificationSettings() {
    return (await resolveRepository()).syncPendingNotificationSettings()
  },
  async getNotificationSettings() {
    return (await resolveRepository()).getNotificationSettings()
  },
  async requestNotificationEmailVerification(email) {
    return (await resolveRepository()).requestNotificationEmailVerification(email)
  },
  async confirmNotificationEmail(challengeId, code) {
    return (await resolveRepository()).confirmNotificationEmail(challengeId, code)
  },
  async setNotificationEmailEnabled(enabled) {
    return (await resolveRepository()).setNotificationEmailEnabled(enabled)
  },
  async deleteNotificationEmail() {
    return (await resolveRepository()).deleteNotificationEmail()
  },
  async getDiaryShareRecipient() {
    return (await resolveRepository()).getDiaryShareRecipient()
  },
  async ensureDiaryShareAuthorization() {
    return (await resolveRepository()).ensureDiaryShareAuthorization()
  },
  async redeemDiarySharePairing(code) {
    return (await resolveRepository()).redeemDiarySharePairing(code)
  },
  async shareDiary(id) {
    return (await resolveRepository()).shareDiary(id)
  },
  async retryDiaryShare(id) {
    return (await resolveRepository()).retryDiaryShare(id)
  },
  async syncPendingDiaryShares() {
    return (await resolveRepository()).syncPendingDiaryShares()
  },
  async syncDiaryShareReceipts() {
    return (await resolveRepository()).syncDiaryShareReceipts()
  },
}
