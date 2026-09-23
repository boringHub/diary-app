import type { Diary } from '../types/diary'

const KEY = 'shiguangjian.diaries.v1'

const seed: Diary[] = [
  {
    id: 'welcome',
    title: '把今天收进一页笺',
    summary: '这是一个可以慢慢写下来的地方。',
    body: '欢迎来到拾光笺。\n\n先记下一点此刻的心情，日记会保存在当前设备中。',
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

function read(): Diary[] {
  const value = localStorage.getItem(KEY)
  if (!value) {
    localStorage.setItem(KEY, JSON.stringify(seed))
    return seed
  }
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed as Diary[] : seed
  } catch {
    localStorage.setItem(KEY, JSON.stringify(seed))
    return seed
  }
}

function write(items: Diary[]) {
  localStorage.setItem(KEY, JSON.stringify(items))
}

export const diaryRepository = {
  list(): Diary[] {
    return read().filter((item) => !item.isDeleted).sort((a, b) => b.updatedAt - a.updatedAt)
  },
  get(id: string): Diary | undefined {
    return read().find((item) => item.id === id && !item.isDeleted)
  },
  save(input: Pick<Diary, 'title' | 'body' | 'mood'> & { id?: string }): Diary {
    const items = read()
    const now = Date.now()
    const existing = input.id ? items.find((item) => item.id === input.id) : undefined
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
    write(existing ? items.map((entry) => (entry.id === item.id ? item : entry)) : [item, ...items])
    return item
  },
  toggleFavorite(id: string) {
    write(read().map((item) => (item.id === id ? { ...item, isFavorite: !item.isFavorite } : item)))
  },
  remove(id: string) {
    write(read().map((item) => (item.id === id ? { ...item, isDeleted: true } : item)))
  },
}
