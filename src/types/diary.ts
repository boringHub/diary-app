export type Mood = 'calm' | 'happy' | 'sad' | 'tired' | 'excited'

export const MAX_DIARY_IMAGES = 5

export type DiaryBlockType = 'text' | 'image'

export interface TextBlockContent {
  text: string
}

export interface ImageBlockContent {
  assetId: string
  caption?: string
}

export interface DiaryBlock {
  id: string
  diaryId: string
  blockType: DiaryBlockType
  sortOrder: number
  content: TextBlockContent | ImageBlockContent
}

export interface DiaryAsset {
  id: string
  diaryId: string
  assetType: 'image'
  localPath: string
  width?: number
  height?: number
  fileSize?: number
  mimeType?: string
  createdAt: number
  url?: string
}

export interface DiaryLayoutElement {
  id: string
  type: DiaryBlockType
  content: { blockId: string } | { assetId: string }
  position: { x: number; y: number }
  size: { width: number; height: number }
  zIndex: number
}

export interface DiaryLayout {
  schemaVersion: 1
  canvas: { width: number; height: number }
  background: { assetId: string }
  board: { assetId: string }
  elements: DiaryLayoutElement[]
}

export interface SaveDiaryImageInput {
  name: string
  mimeType: string
  data: Blob
  width?: number
  height?: number
}

export interface ExistingDiaryImageInput {
  assetId: string
  caption?: string
}

export type DiaryImageInput = SaveDiaryImageInput | ExistingDiaryImageInput

export interface Diary {
  id: string
  title: string
  summary: string
  body: string
  mood: Mood
  createdAt: number
  updatedAt: number
  isFavorite: boolean
  isDeleted: boolean
  boardPackId: string
  boardPackVersion: string
  layoutId: string
  blocks: DiaryBlock[]
  assets: DiaryAsset[]
  layout: DiaryLayout
}

export const moodLabels: Record<Mood, string> = {
  calm: '平静',
  happy: '开心',
  sad: '低落',
  tired: '疲惫',
  excited: '期待',
}
