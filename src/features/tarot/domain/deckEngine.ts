import { catalog } from '../data/catalog'
import type { DeckCard } from './types'

export type RandomInt = (n: number) => number
export const randomInt: RandomInt = (n) => {
  if (!Number.isInteger(n) || n <= 0 || n > 2 ** 32) throw new Error('invalid_n')
  if (!globalThis.crypto?.getRandomValues) throw new Error('这台设备暂时无法安全洗牌')
  const limit = Math.floor(2 ** 32 / n) * n
  const bytes = new Uint32Array(1)
  do { crypto.getRandomValues(bytes) } while (bytes[0] >= limit)
  return bytes[0] % n
}
export function shuffleDeck(includeReversals = true, random: RandomInt = randomInt): DeckCard[] {
  const cards = catalog.map(card => card.cardId)
  for (let i = cards.length - 1; i > 0; i--) {
    const j = random(i+1)
    ;[cards[i],cards[j]] = [cards[j],cards[i]]
  }
  return cards.map((cardId, i) => ({ cardId, orientation: includeReversals && random(2) === 1 ? 'reversed' : 'upright', originalSlot: i, number: i+1 }))
}
export function cutDeck(deck: DeckCard[], index: number): DeckCard[] {
  if (deck.length !== 78 || new Set(deck.map(c => c.cardId)).size !== 78 || !Number.isInteger(index) || index < 1 || index > 77) throw new Error('牌组或切点无效')
  return [...deck.slice(index), ...deck.slice(0,index)].map((card,i) => ({ ...card, number: i+1 }))
}
