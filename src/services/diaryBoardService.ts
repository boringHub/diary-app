import { MAX_DIARY_IMAGES, type DiaryBlock, type DiaryLayout } from '../types/diary'

export interface DiaryBoardPack {
  id: string
  version: string
  backgroundAssetId: string
  boardAssetId: string
}

export const DEFAULT_DIARY_BOARD_PACK: DiaryBoardPack = {
  id: 'plain-diary-board',
  version: '1.0.0',
  backgroundAssetId: 'diary-background-default',
  boardAssetId: 'diary-board-default',
}

type LayoutBlockInput = Pick<DiaryBlock, 'id' | 'blockType'> & Partial<Pick<DiaryBlock, 'content'>>

export function getDiaryBoardPack(id?: string, version?: string) {
  if (id === DEFAULT_DIARY_BOARD_PACK.id && version === DEFAULT_DIARY_BOARD_PACK.version) {
    return DEFAULT_DIARY_BOARD_PACK
  }
  // Legacy theme IDs are not diary-board IDs; keep their content on the stable default board.
  return DEFAULT_DIARY_BOARD_PACK
}

export function createFixedLayout(
  blocks: LayoutBlockInput[],
  boardPack = DEFAULT_DIARY_BOARD_PACK,
): DiaryLayout {
  const imageCount = blocks.filter((block) => block.blockType === 'image').length
  if (imageCount > MAX_DIARY_IMAGES) throw new Error(`固定布局最多支持 ${MAX_DIARY_IMAGES} 张图片`)

  const hasText = blocks.some((block) => block.blockType === 'text')
  let imageIndex = 0
  return {
    schemaVersion: 1,
    canvas: { width: 1080, height: 1440 },
    background: { assetId: boardPack.backgroundAssetId },
    board: { assetId: boardPack.boardAssetId },
    elements: blocks.map((block, index) => {
      if (block.blockType === 'text') {
        return {
          id: `${block.id}:element`,
          type: block.blockType,
          content: { blockId: block.id },
          position: { x: 0.1, y: 0.08 },
          size: { width: 0.8, height: 0.18 },
          zIndex: index,
        }
      }

      const slot = imageIndex++
      const content = block.content && 'assetId' in block.content
        ? { assetId: block.content.assetId }
        : { assetId: '' }
      return {
        id: `${block.id}:element`,
        type: block.blockType,
        content,
        position: {
          x: slot % 2 === 0 ? 0.1 : 0.52,
          y: (hasText ? 0.31 : 0.1) + Math.floor(slot / 2) * 0.22,
        },
        size: { width: 0.38, height: 0.18 },
        zIndex: index,
      }
    }),
  }
}

export function isLayoutForBoardPack(layout: DiaryLayout | undefined, boardPack: DiaryBoardPack) {
  return layout?.schemaVersion === 1
    && Array.isArray(layout.elements)
    && layout.background?.assetId === boardPack.backgroundAssetId
    && layout.board?.assetId === boardPack.boardAssetId
}
