export type Mood = 'calm' | 'happy' | 'sad' | 'tired' | 'excited'

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
  themeId: string
  themeVersion: string
  layoutId: string
}

export const moodLabels: Record<Mood, string> = {
  calm: '平静',
  happy: '开心',
  sad: '低落',
  tired: '疲惫',
  excited: '期待',
}
