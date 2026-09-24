import type { Diary } from '../types/diary'
import type { DiaryRepository, SaveDiaryInput } from './diaryRepository'
import type { DiaryAsset, DiaryBlock, DiaryImageInput, SaveDiaryImageInput } from '../types/diary'
import { diaryAssetStorage, type StoredDiaryAsset } from '../services/diaryAssetStorage'
import { validateDiaryImageInputs } from '../services/diaryImageValidation'
import {
  createFixedLayout,
  DEFAULT_DIARY_BOARD_PACK,
  getDiaryBoardPack,
  isLayoutForBoardPack,
} from '../services/diaryBoardService'

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
    boardPackId: DEFAULT_DIARY_BOARD_PACK.id,
    boardPackVersion: DEFAULT_DIARY_BOARD_PACK.version,
    layoutId: 'layout-default',
    blocks: [{ id: 'welcome:text:0', diaryId: 'welcome', blockType: 'text', sortOrder: 0, content: { text: '欢迎来到拾光笺呀~\n\n先记下一点此刻的心情吧，日记只会留在这台设备里。' } }],
    assets: [],
    layout: createFixedLayout([{ id: 'welcome:text:0', blockType: 'text' }]),
  },
]

export class LocalStorageDiaryRepository implements DiaryRepository {
  constructor(private readonly getStorage: () => Storage) {}

  async list(): Promise<Diary[]> {
    const items = this.read().filter((item) => !item.isDeleted).sort((a, b) => b.updatedAt - a.updatedAt)
    return Promise.all(items.map((item) => this.hydrate(item)))
  }

  async get(id: string): Promise<Diary | undefined> {
    const item = this.read().find((entry) => entry.id === id && !entry.isDeleted)
    return item ? this.hydrate(item) : undefined
  }

  async save(input: SaveDiaryInput): Promise<Diary> {
    const items = this.read()
    const now = Date.now()
    const existing = input.id ? items.find((item) => item.id === input.id && !item.isDeleted) : undefined
    const id = existing?.id ?? crypto.randomUUID()
    const imageInputs = input.images ?? existing?.assets.map((asset) => ({ assetId: asset.id })) ?? []
    validateDiaryImageInputs(imageInputs)
    const resolved = await this.resolveImages(id, imageInputs, existing?.assets ?? [])
    const images = resolved.assets
    const blocks = this.createBlocks(id, input.body, images)
    const item: Diary = existing
      ? { ...existing, title: input.title, body: input.body, mood: input.mood, summary: this.summary(input.body, images), blocks, assets: images, updatedAt: now }
      : {
          id,
          title: input.title,
          summary: this.summary(input.body, images),
          body: input.body,
          mood: input.mood,
          createdAt: now,
          updatedAt: now,
          isFavorite: false,
          isDeleted: false,
          boardPackId: DEFAULT_DIARY_BOARD_PACK.id,
          boardPackVersion: DEFAULT_DIARY_BOARD_PACK.version,
          layoutId: 'layout-default',
          blocks,
          assets: images,
          layout: createFixedLayout(blocks),
        }
    item.layoutId = `layout-${id}`
    const boardPack = getDiaryBoardPack(item.boardPackId, item.boardPackVersion)
    item.layout = createFixedLayout(blocks, boardPack)
    const removed = (existing?.assets ?? []).filter((asset) => !images.some((next) => next.id === asset.id))
    try {
      this.write(existing ? items.map((entry) => (entry.id === item.id ? item : entry)) : [item, ...items])
    } catch (error) {
      await Promise.all(resolved.created.map((asset) => diaryAssetStorage.remove(asset)))
      throw error
    }
    await Promise.all(removed.map((asset) => diaryAssetStorage.remove(asset)))
    return this.hydrate(item)
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
      return Array.isArray(parsed) ? (parsed as Diary[]).map((item) => this.normalize(item)) : this.restoreSeed()
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

  private normalize(item: Diary): Diary {
    const blocks = Array.isArray(item.blocks) && item.blocks.length > 0
      ? item.blocks
      : [{ id: `${item.id}:text:0`, diaryId: item.id, blockType: 'text' as const, sortOrder: 0, content: { text: item.body ?? '' } }]
    const assets = Array.isArray(item.assets) ? item.assets : []
    const boardPack = getDiaryBoardPack(item.boardPackId, item.boardPackVersion)
    const layout = isLayoutForBoardPack(item.layout, boardPack)
      ? item.layout
      : createFixedLayout(blocks, boardPack)
    return {
      ...item,
      body: item.body ?? '',
      boardPackId: boardPack.id,
      boardPackVersion: boardPack.version,
      layoutId: item.layoutId ?? `layout-${item.id}`,
      blocks,
      assets,
      layout,
    }
  }

  private summary(body: string, assets: DiaryAsset[]) {
    return body.trim().slice(0, 48) || (assets.length > 0 ? `收好了一张图片 · ${assets.length} 张` : '')
  }

  private createBlocks(diaryId: string, body: string, assets: DiaryAsset[]): DiaryBlock[] {
    const blocks: DiaryBlock[] = []
    if (body.trim()) blocks.push({ id: `${diaryId}:text:0`, diaryId, blockType: 'text', sortOrder: 0, content: { text: body } })
    assets.forEach((asset, index) => blocks.push({ id: `${diaryId}:image:${asset.id}`, diaryId, blockType: 'image', sortOrder: blocks.length, content: { assetId: asset.id } }))
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
    return { id: stored.id, diaryId, assetType: 'image', localPath: stored.localPath, fileSize: stored.fileSize, mimeType: stored.mimeType, width: stored.width, height: stored.height, createdAt: stored.createdAt }
  }

  private async hydrate(item: Diary): Promise<Diary> {
    const assets = await Promise.all(item.assets.map(async (asset) => ({ ...asset, url: await diaryAssetStorage.resolveUrl(asset).catch(() => undefined) })))
    return { ...item, assets, blocks: item.blocks.map((block) => ({ ...block, content: { ...block.content } })) }
  }
}
