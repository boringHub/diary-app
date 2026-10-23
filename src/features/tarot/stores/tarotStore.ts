import { defineStore } from 'pinia'
import { ref, toRaw } from 'vue'
import { getCard } from '../data/catalog'
import { createReading, validateQuestion } from '../domain/reading'
import { cutDeck, randomInt, shuffleDeck } from '../domain/deckEngine'
import { getTarotRepository } from '../repositories/tarotRepository'
import type { ScenarioId, TarotReading } from '../domain/types'

export const useTarotStore = defineStore('tarot', () => {
  const readings = ref<TarotReading[]>([])
  const loaded = ref(false)
  let loading: Promise<void> | undefined
  let queue: Promise<unknown> = Promise.resolve()
  const clone = (r: TarotReading) => structuredClone(toRaw(r))
  const get = (id: string) => readings.value.find(r => r.id === id)
  function serialized<T>(operation: () => Promise<T>): Promise<T> {
    const promise = queue.then(operation)
    queue = promise.catch(() => undefined)
    return promise
  }
  async function load(force = false) {
    if (loading) return loading
    if (loaded.value && !force) return
    loading = (async () => {
      await queue
      readings.value = await (await getTarotRepository()).list()
      loaded.value = true
    })().finally(() => { loading = undefined })
    return loading
  }
  function update(id: string, action: (reading: TarotReading) => void) {
    return serialized(async () => {
      const current = get(id)
      if (!current) throw new Error('记录不存在或已经删除')
      const next = clone(current)
      action(next)
      next.revision++
      next.updatedAt = Date.now()
      await (await getTarotRepository()).save(next,current.revision)
      readings.value = readings.value.map(r => r.id === id ? next : r)
      return next
    })
  }
  function create(scenarioId: ScenarioId) {
    return serialized(async () => {
      const reading = createReading(scenarioId)
      await (await getTarotRepository()).save(reading,null)
      readings.value.unshift(reading)
      return reading
    })
  }
  const begin = (id: string) => update(id, r => {
    if (r.stage !== 'draft') throw new Error('问题已经锁定')
    validateQuestion(r)
    r.question = r.question.trim()
    if (r.options) r.options = { a: r.options.a.trim(), b: r.options.b.trim() }
    r.stage = 'shuffling'
  })
  function revise(id: string) {
    return serialized(async () => {
      const current=get(id)
      if(!current)throw new Error('记录不存在或已经删除')
      const original=clone(current),draft=createReading(original.scenarioId)
      draft.question=original.question;draft.context=original.context;draft.options=original.options;draft.details=original.details
      await (await getTarotRepository()).restart(id,original.revision,draft)
      readings.value=[draft,...readings.value.filter(r=>r.id!==id)]
      return draft
    })
  }
  const shuffle = (id: string) => update(id, r => {
    if (r.drawn.length || r.stage === 'revealed' || r.stage === 'draft') throw new Error('已抽牌，不能重新洗牌')
    r.deckOrder = shuffleDeck(r.includeReversals)
    r.cutIndex = null
    r.stage = 'shuffling'
  })
  const toCut = (id: string) => update(id,r => {
    if (r.deckOrder.length !== 78) throw new Error('请先完成洗牌')
    if (r.stage !== 'revealed') r.stage = 'cutting'
  })
  const cut = (id: string) => update(id,r => {
    if (r.drawn.length || r.stage !== 'cutting') throw new Error('已抽牌，不能重新切牌')
    r.cutIndex = 18+randomInt(43)
    r.deckOrder = cutDeck(r.deckOrder,r.cutIndex)
  })
  const toDraw = (id: string) => update(id,r => {
    if (!r.cutIndex || r.stage === 'revealed') throw new Error('请先完成切牌')
    r.stage = 'drawing'
  })
  const draw = (id: string,positionId: string,originalSlot: number) => update(id,r => {
    if (r.stage !== 'drawing' || r.drawn.some(c => c.positionId === positionId || c.originalSlot === originalSlot)) throw new Error('这张牌或牌位已选定')
    const position = r.spreadSnapshot.find(p => p.id === positionId)
    const card = r.deckOrder.find(c => c.originalSlot === originalSlot)
    if (!position || !card) throw new Error('牌位无效')
    r.drawn.push({ ...card, positionId, drawOrder: r.drawn.length, snapshot: { ...getCard(card.cardId), positionLabel: position.label } })
  })
  const reveal = (id: string) => update(id,r => {
    if (r.stage !== 'drawing' || r.drawn.length !== r.spreadSnapshot.length) throw new Error('请先抽满所有牌位')
    r.stage = 'revealed'
    r.revealedAt = Date.now()
  })
  function remove(id: string) {
    return serialized(async () => {
      await (await getTarotRepository()).remove(id)
      readings.value = readings.value.filter(r => r.id !== id)
    })
  }
  return { readings,loaded,get,load,update,create,begin,revise,shuffle,toCut,cut,toDraw,draw,reveal,remove }
})
