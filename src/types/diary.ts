export const moodOptions = ['calm', 'happy', 'excited', 'loved', 'playful', 'proud', 'relaxed', 'touched', 'sleepy', 'tired', 'sad', 'lonely', 'angry', 'anxious', 'confused'] as const
export type Mood = typeof moodOptions[number]

export function isMood(value: unknown): value is Mood {
  return typeof value === 'string' && moodOptions.some((mood) => mood === value)
}

export const moodColors: Record<Mood, string> = {
  calm: '#81d3bd',
  happy: '#ffd27d',
  sad: '#8bb8e8',
  tired: '#b6a8d6',
  excited: '#ff9e82',
  loved: '#f3abc0',
  playful: '#dfbf79',
  proud: '#e7bd83',
  relaxed: '#a9d8ca',
  touched: '#efb5a2',
  sleepy: '#a9b4dc',
  lonely: '#9ebbd2',
  angry: '#ee9290',
  anxious: '#d4b0d3',
  confused: '#bfbedc',
}

export type DiaryShareStatus = 'none' | 'pending' | 'queued' | 'processing' | 'sent' | 'read' | 'failed' | 'cancelled' | 'expired'

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
  shareStatus: DiaryShareStatus
  shareId?: string
  shareReadAt?: number
  shareError?: string
}

export const moodLabels: Record<Mood, string> = {
  calm: '平静',
  happy: '开心',
  sad: '低落',
  tired: '疲惫',
  excited: '期待',
  loved: '心动',
  playful: '调皮',
  proud: '得意',
  relaxed: '放松',
  touched: '感动',
  sleepy: '困困',
  lonely: '孤单',
  angry: '生气',
  anxious: '焦虑',
  confused: '迷茫',
}
