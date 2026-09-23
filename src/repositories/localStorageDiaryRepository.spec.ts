import { beforeEach, describe, expect, it, vi } from 'vitest'
import { DIARY_STORAGE_KEY, LocalStorageDiaryRepository } from './localStorageDiaryRepository'

class MemoryStorage implements Storage {
  private readonly values = new Map<string, string>()

  get length() {
    return this.values.size
  }

  clear() {
    this.values.clear()
  }

  getItem(key: string) {
    return this.values.get(key) ?? null
  }

  key(index: number) {
    return [...this.values.keys()][index] ?? null
  }

  removeItem(key: string) {
    this.values.delete(key)
  }

  setItem(key: string, value: string) {
    this.values.set(key, value)
  }
}

describe('LocalStorageDiaryRepository', () => {
  let storage: MemoryStorage
  let repository: LocalStorageDiaryRepository

  beforeEach(() => {
    storage = new MemoryStorage()
    repository = new LocalStorageDiaryRepository(() => storage)
    vi.spyOn(crypto, 'randomUUID').mockReturnValue('00000000-0000-4000-8000-000000000001')
  })

  it('initializes the welcome diary once', async () => {
    const first = await repository.list()
    const second = await repository.list()

    expect(first).toHaveLength(1)
    expect(first[0].id).toBe('welcome')
    expect(second).toHaveLength(1)
    expect(storage.getItem(DIARY_STORAGE_KEY)).not.toBeNull()
  })

  it('creates and edits a diary without changing its creation time', async () => {
    const created = await repository.save({ title: '今天', body: '第一段正文', mood: 'happy' })
    const updated = await repository.save({ id: created.id, title: '今天（续）', body: '修改后的正文', mood: 'calm' })

    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(updated.title).toBe('今天（续）')
    expect(updated.body).toBe('修改后的正文')
    expect((await repository.list()).filter((item) => item.id === created.id)).toHaveLength(1)
  })

  it('persists favorite changes and filters soft-deleted diaries', async () => {
    const created = await repository.save({ title: '', body: '需要保留在本地', mood: 'tired' })

    await repository.toggleFavorite(created.id)
    expect((await repository.get(created.id))?.isFavorite).toBe(true)

    await repository.remove(created.id)
    expect(await repository.get(created.id)).toBeUndefined()
    expect((await repository.list()).some((item) => item.id === created.id)).toBe(false)

    const raw = JSON.parse(storage.getItem(DIARY_STORAGE_KEY) ?? '[]') as Array<{ id: string; isDeleted: boolean }>
    expect(raw.find((item) => item.id === created.id)?.isDeleted).toBe(true)
  })
})
