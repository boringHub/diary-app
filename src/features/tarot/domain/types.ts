export type ScenarioId = 'shopping' | 'choice' | 'self' | 'relationship' | 'growth' | 'guidance'
export type Orientation = 'upright' | 'reversed'
export type Stage = 'draft' | 'shuffling' | 'cutting' | 'drawing' | 'revealed'
export interface Position { id: string; label: string; x: number; y: number; w: number; h: number }
export interface Scenario {
  id: ScenarioId; name: string; glyph: string; description: string; example: string
  spreadId: string; positions: Position[]
}
export interface CardDefinition {
  cardId: string; nameZh: string; nameEn: string; arcana: 'major' | 'minor'
  suit: string | null; rank: number; imagePath: string
  upright: string[]; reversed: string[]; meaning: string; reversedMeaning: string
}
export interface DeckCard { cardId: string; orientation: Orientation; originalSlot: number; number: number }
export interface DrawnCard extends DeckCard {
  positionId: string; drawOrder: number
  snapshot: CardDefinition & { positionLabel: string }
}
export interface TarotMessage {
  id: string; role: 'user' | 'assistant'; kind: 'initial' | 'followup'; content: string
  status: 'pending' | 'streaming' | 'completed' | 'failed' | 'interrupted' | 'unknown'
  requestId: string; createdAt: number; errorCode?: string; metadata?: Record<string, unknown>
}
export interface PreparedRequest {
  requestId: string; assistantMessageId: string; body: string
  state: TarotMessage['status']; createdAt: number
}
export interface TarotReading {
  id: string; schemaVersion: 1; scenarioId: ScenarioId; spreadId: string; spreadVersion: 1
  deckId: string; deckVersion: string; catalogVersion: string
  question: string; context: string; options: { a: string; b: string } | null
  details: Partial<Record<'item' | 'price' | 'currency' | 'budget' | 'alternative' | 'timeframe', string>>
  includeReversals: boolean; stage: Stage; deckOrder: DeckCard[]; cutIndex: number | null
  spreadSnapshot: Position[]; drawn: DrawnCard[]; messages: TarotMessage[]; requests: PreparedRequest[]
  displayTitle: string; note: string; isFavorite: boolean
  createdAt: number; updatedAt: number; revealedAt: number | null; revision: number
}
