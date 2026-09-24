import { beforeEach, describe, expect, it, vi } from 'vitest'
import { diaryAssetStorage } from '../services/diaryAssetStorage'
import { selectTheme } from '../services/themeService'
import { DIARY_STORAGE_KEY, LocalStorageDiaryRepository } from './localStorageDiaryRepository'

vi.mock('../services/diaryAssetStorage', () => ({
  diaryAssetStorage: {
    saveImage: vi.fn(async () => ({
      id: 'asset-1',
      localPath: 'diaries/diary-1/asset-1.jpg',
      fileSize: 4,
      mimeType: 'image/jpeg',
      width: 640,
      height: 480,
      createdAt: 100,
    })),
    resolveUrl: vi.fn(async () => 'data:image/jpeg;base64,dGVzdA=='),
    remove: vi.fn(async () => undefined),
  },
}))

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
    vi.stubGlobal('localStorage', new MemoryStorage())
    vi.clearAllMocks()
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

  it('normalizes a legacy text diary without replacing its content', async () => {
    storage.setItem(DIARY_STORAGE_KEY, JSON.stringify([{
      id: 'legacy',
      title: '旧日记',
      summary: '还在这里',
      body: '原来的正文',
      mood: 'calm',
      createdAt: 10,
      updatedAt: 20,
      isFavorite: false,
      isDeleted: false,
      themeId: 'default',
      themeVersion: '1.0.0',
      layoutId: 'layout-legacy',
    }]))

    const diary = await repository.get('legacy')

    expect(diary?.body).toBe('原来的正文')
    expect(diary?.blocks).toEqual([
      expect.objectContaining({ blockType: 'text', content: { text: '原来的正文' } }),
    ])
    expect(diary?.layout.elements[0].content).toEqual({ blockId: 'legacy:text:0' })
  })

  it('persists image assets and removes files only after a successful edit', async () => {
    const image = new Blob(['test'], { type: 'image/jpeg' })
    const created = await repository.save({
      title: '照片',
      body: '',
      mood: 'happy',
      images: [{ name: 'memory.jpg', mimeType: 'image/jpeg', data: image, width: 640, height: 480 }],
    })

    expect(created.assets).toEqual([
      expect.objectContaining({ id: 'asset-1', localPath: 'diaries/diary-1/asset-1.jpg', width: 640, height: 480 }),
    ])
    expect(created.blocks).toEqual([
      expect.objectContaining({ blockType: 'image', content: { assetId: 'asset-1' } }),
    ])
    expect(created.summary).toContain('1 张')

    await repository.save({ id: created.id, title: created.title, body: '', mood: created.mood, images: [] })
    expect(diaryAssetStorage.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-1' }))
  })

  it('keeps diary-board data independent from the selected global theme', async () => {
    selectTheme('mist-paper', '1.0.0')
    const created = await repository.save({ title: '晨雾', body: '第一版', mood: 'calm' })
    selectTheme('sunset-post', '1.0.0')
    const updated = await repository.save({ id: created.id, title: '晨雾', body: '第二版', mood: 'calm' })
    const next = await repository.save({ title: '晚风', body: '新日记', mood: 'excited' })

    expect(updated.boardPackId).toBe('plain-diary-board')
    expect(updated.boardPackVersion).toBe('1.0.0')
    expect(next.boardPackId).toBe(updated.boardPackId)
    expect(next.layout.board).toEqual(updated.layout.board)
    expect(next.layout.background).toEqual(updated.layout.background)
  })

  it('rejects more than five images before writing any files', async () => {
    const image = new Blob(['test'], { type: 'image/jpeg' })
    const images = Array.from({ length: 6 }, (_, index) => ({
      name: `memory-${index}.jpg`,
      mimeType: 'image/jpeg',
      data: image,
    }))

    await expect(repository.save({ title: '太多图片', body: '', mood: 'happy', images })).rejects.toThrow('最多放 5 张')
    expect(diaryAssetStorage.saveImage).not.toHaveBeenCalled()
  })

  it('rejects non-image files and duplicate existing references before writing', async () => {
    await expect(repository.save({
      title: '不是图片',
      body: '',
      mood: 'calm',
      images: [{ name: 'note.txt', mimeType: 'text/plain', data: new Blob(['note']) }],
    })).rejects.toThrow('只能把图片')

    await expect(repository.save({
      id: 'welcome',
      title: '重复',
      body: '正文',
      mood: 'calm',
      images: [{ assetId: 'same' }, { assetId: 'same' }],
    })).rejects.toThrow('重复')
    expect(diaryAssetStorage.saveImage).not.toHaveBeenCalled()
  })

  it('removes newly written image files when persistence fails', async () => {
    await repository.list()
    vi.spyOn(storage, 'setItem').mockImplementationOnce(() => {
      throw new Error('storage full')
    })

    await expect(repository.save({
      title: '写入失败',
      body: '',
      mood: 'sad',
      images: [{ name: 'memory.jpg', mimeType: 'image/jpeg', data: new Blob(['test']) }],
    })).rejects.toThrow('storage full')

    expect(diaryAssetStorage.remove).toHaveBeenCalledWith(expect.objectContaining({ id: 'asset-1' }))
  })
})
