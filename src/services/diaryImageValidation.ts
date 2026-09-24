import { MAX_DIARY_IMAGES, type DiaryImageInput } from '../types/diary'

export function validateDiaryImageInputs(inputs: DiaryImageInput[]) {
  if (inputs.length > MAX_DIARY_IMAGES) {
    throw new Error(`每篇日记最多放 ${MAX_DIARY_IMAGES} 张图片哦`)
  }

  const assetIds = new Set<string>()
  for (const input of inputs) {
    if ('assetId' in input) {
      if (!input.assetId || assetIds.has(input.assetId)) {
        throw new Error('日记里有重复的图片引用')
      }
      assetIds.add(input.assetId)
      continue
    }

    if (!input.mimeType.toLowerCase().startsWith('image/')) {
      throw new Error('只能把图片放进日记哦')
    }
  }
}
