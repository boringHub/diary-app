import { CATALOG_VERSION, DECK_ID, DECK_VERSION, getCard } from '../data/catalog'
import { getScenario, scenarios } from '../data/spreads'
import type { ScenarioId, TarotReading } from './types'
export const countText = (text: string) => Array.from(text).length
export function createReading(scenarioId: ScenarioId): TarotReading {
  const scenario = getScenario(scenarioId)
  const now = Date.now()
  return { id: crypto.randomUUID(), schemaVersion: 1, scenarioId, spreadId: scenario.spreadId, spreadVersion: 1,
    deckId: DECK_ID, deckVersion: DECK_VERSION, catalogVersion: CATALOG_VERSION, question: '', context: '',
    options: scenarioId === 'choice' ? { a: '', b: '' } : null, details: {}, includeReversals: true,
    stage: 'draft', deckOrder: [], cutIndex: null, spreadSnapshot: structuredClone(scenario.positions), drawn: [], messages: [], requests: [],
    displayTitle: '', note: '', isFavorite: false, createdAt: now, updatedAt: now, revealedAt: null, revision: 0 }
}
export function validateQuestion(reading: TarotReading) {
  const n = countText(reading.question.trim())
  if (n < 5 || n > 800) throw new Error('问题请写 5–800 个字')
  if (countText(reading.context) > 1200) throw new Error('补充背景最多 1,200 字')
  if (Object.values(reading.details).some(value => countText(value ?? '') > 200)) throw new Error('每项补充信息最多 200 字')
  if (reading.scenarioId === 'choice') {
    const a = reading.options?.a.trim() ?? '', b = reading.options?.b.trim() ?? ''
    if (!a || !b || countText(a) > 100 || countText(b) > 100) throw new Error('请分别填写 1–100 字的选项 A 和 B')
    if (a.normalize('NFKC').replace(/\s/gu,'') === b.normalize('NFKC').replace(/\s/gu,'')) throw new Error('两个选项需要有所不同')
  }
}
export function assertReading(r: TarotReading): void {
  if (!r || r.schemaVersion !== 1 || typeof r.id !== 'string' || !scenarios.some(s => s.id === r.scenarioId)
      || !['draft','shuffling','cutting','drawing','revealed'].includes(r.stage)
      || !Array.isArray(r.deckOrder) || !Array.isArray(r.drawn) || !Array.isArray(r.messages) || !Array.isArray(r.requests)
      || !Number.isInteger(r.revision) || r.revision < 0) throw new Error('这条星语记录格式不受支持，请保留本机数据')
  const scenario = getScenario(r.scenarioId)
  if (r.spreadId !== scenario.spreadId || r.spreadSnapshot.length !== scenario.positions.length
      || r.spreadSnapshot.some((p,i) => p.id !== scenario.positions[i].id)) throw new Error('牌阵资料不一致')
  if (r.stage !== 'draft') validateQuestion(r)
  if (r.deckOrder.length) {
    if (r.deckOrder.length !== 78 || new Set(r.deckOrder.map(c => c.cardId)).size !== 78
        || new Set(r.deckOrder.map(c => c.originalSlot)).size !== 78) throw new Error('牌组不完整')
    r.deckOrder.forEach(c => {
      getCard(c.cardId)
      if (!['upright','reversed'].includes(c.orientation) || (!r.includeReversals && c.orientation !== 'upright')
          || !Number.isInteger(c.originalSlot) || c.originalSlot < 0 || c.originalSlot > 77) throw new Error('牌组方向无效')
    })
  }
  if (['cutting','drawing','revealed'].includes(r.stage) && r.deckOrder.length !== 78) throw new Error('请先洗牌')
  if (['drawing','revealed'].includes(r.stage) && (!Number.isInteger(r.cutIndex) || r.cutIndex! < 1 || r.cutIndex! > 77)) throw new Error('请先切牌')
  if (new Set(r.drawn.map(c => c.cardId)).size !== r.drawn.length || new Set(r.drawn.map(c => c.positionId)).size !== r.drawn.length
      || new Set(r.drawn.map(c => c.drawOrder)).size !== r.drawn.length) throw new Error('牌位已选定，不可重复抽取')
  r.drawn.forEach(c => {
    const card = r.deckOrder.find(card => card.cardId === c.cardId)
    if (!card || !scenario.positions.some(p => p.id === c.positionId) || c.orientation !== card.orientation
        || c.originalSlot !== card.originalSlot || c.number !== card.number) throw new Error('抽牌结果与牌组不一致')
  })
  if (r.stage === 'revealed' && (r.drawn.length !== scenario.positions.length || !r.revealedAt)) throw new Error('抽满全部牌位后才能翻牌')
}
export function readingPath(reading: TarotReading) {
  return reading.stage === 'draft' ? `/tarot/new?id=${reading.id}`
    : `/tarot/${reading.id}/${reading.stage === 'revealed' ? 'chat' : 'ritual'}`
}
