import type { Diary } from '../types/diary'
import type { DiaryRepository, SaveDiaryInput } from './diaryRepository'

export const DIARY_STORAGE_KEY = 'shiguangjian.diaries.v1'

const seed: Diary[] = [
  {
    id: 'welcome',
    title: '把今天收进一页笺',
    summary: '这里可以慢慢写下今天的小心情。',
    body: '欢迎来到拾光笺呀~\n\n先记下一点此刻的心情吧，日记只会留在这台设备里。',
    mood: 'calm',
    createdAt: Date.now() - 86400000,
    updatedAt: Date.now() - 86400000,
    isFavorite: true,
    isDeleted: false,
    themeId: 'default',
    themeVersion: '1.0.0',
    layoutId: 'layout-default',
  },
]

export class LocalStorageDiaryRepository implements DiaryRepository {
  constructor(private readonly getStorage: () => Storage) {}

  async list(): Promise<Diary[]> {
    return this.read().filter((item) => !item.isDeleted).sort((a, b) => b.updatedAt - a.updatedAt)
  }

  async get(id: string): Promise<Diary | undefined> {
    return this.read().find((item) => item.id === id && !item.isDeleted)
  }

  async save(input: SaveDiaryInput): Promise<Diary> {
    const items = this.read()
    const now = Date.now()
    const existing = input.id ? items.find((item) => item.id === input.id && !item.isDeleted) : undefined
    const item: Diary = existing
      ? { ...existing, ...input, summary: input.body.slice(0, 48), updatedAt: now }
      : {
          id: crypto.randomUUID(),
          title: input.title,
          summary: input.body.slice(0, 48),
          body: input.body,
          mood: input.mood,
          createdAt: now,
          updatedAt: now,
          isFavorite: false,
          isDeleted: false,
          themeId: 'default',
          themeVersion: '1.0.0',
          layoutId: 'layout-default',
        }
    this.write(existing ? items.map((entry) => (entry.id === item.id ? item : entry)) : [item, ...items])
    return item
  }

  async toggleFavorite(id: string): Promise<void> {
    this.write(this.read().map((item) => (item.id === id ? { ...item, isFavorite: !item.isFavorite } : item)))
  }

  async remove(id: string): Promise<void> {
    this.write(this.read().map((item) => (item.id === id ? { ...item, isDeleted: true, updatedAt: Date.now() } : item)))
  }

  private read(): Diary[] {
    const value = this.getStorage().getItem(DIARY_STORAGE_KEY)
    if (!value) return this.restoreSeed()
    try {
      const parsed: unknown = JSON.parse(value)
      return Array.isArray(parsed) ? parsed as Diary[] : this.restoreSeed()
    } catch {
      return this.restoreSeed()
    }
  }

  private restoreSeed(): Diary[] {
    this.write(seed)
    return seed.map((item) => ({ ...item }))
  }

  private write(items: Diary[]) {
    this.getStorage().setItem(DIARY_STORAGE_KEY, JSON.stringify(items))
  }
}
