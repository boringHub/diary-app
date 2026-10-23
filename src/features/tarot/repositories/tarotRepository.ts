import { Capacitor } from '@capacitor/core'
import { assertReading } from '../domain/reading'
import type { TarotReading } from '../domain/types'

export interface CleanupEntry { readingId: string; expiresAt: number; nextAttemptAt: number; attempts: number }
export interface TarotRepository {
  list(): Promise<TarotReading[]>
  get(id: string): Promise<TarotReading | undefined>
  save(reading: TarotReading, expectedRevision: number | null): Promise<void>
  restart(originalId: string, expectedRevision: number, draft: TarotReading): Promise<void>
  remove(id: string): Promise<void>
  enqueueCleanup(id: string): Promise<void>
  cleanup(): Promise<CleanupEntry[]>
  acknowledgeCleanup(id: string, nextAttemptAt?: number): Promise<void>
}
export function validateRestart(previous: TarotReading | undefined, expected: number, draft: TarotReading) {
  if (!previous || previous.revision !== expected) throw new Error('记录已在其他页面变化，请重新打开后继续')
  if (previous.stage === 'revealed' || previous.requests.length || draft.id === previous.id || draft.stage !== 'draft') throw new Error('已揭示的记录须保留为独立历史')
  validateUpdate(draft,undefined,null)
}
function canonical(value:unknown):string {
  const sort=(v:unknown):unknown => Array.isArray(v)?v.map(sort):v&&typeof v==='object'
    ?Object.fromEntries(Object.entries(v).filter(([,item])=>item!==undefined).sort(([a],[b])=>a.localeCompare(b)).map(([key,item])=>[key,sort(item)])):v
  return JSON.stringify(sort(value))
}
export function validateUpdate(next: TarotReading, previous: TarotReading | undefined, expected: number | null) {
  assertReading(next)
  if ((expected === null && previous) || (expected !== null && (!previous || previous.revision !== expected))) throw new Error('记录已在其他页面变化，请重新打开后继续')
  if (next.revision !== (expected ?? -1)+1) throw new Error('记录版本不一致')
  if (previous && previous.stage !== 'draft') {
    const fields = ['question','context','options','details','spreadId','spreadSnapshot','includeReversals','deckId','deckVersion','catalogVersion'] as const
    if (fields.some(key => canonical(next[key]) !== canonical(previous[key]))) throw new Error('问题已经锁定，请建立新记录修改')
    if (previous.drawn.length && (canonical(next.deckOrder) !== canonical(previous.deckOrder)
        || previous.drawn.some(card => canonical(next.drawn.find(c => c.positionId === card.positionId)) !== canonical(card)))) throw new Error('已选定的牌不能更换')
    if (previous.stage === 'revealed' && next.stage !== 'revealed') throw new Error('已揭示的记录不能重新抽牌')
  }
}
let repository: Promise<TarotRepository> | undefined
export function getTarotRepository(): Promise<TarotRepository> {
  return repository ??= Capacitor.isNativePlatform()
    ? import('./sqliteTarotRepository').then(m => new m.SQLiteTarotRepository())
    : import('./localTarotRepository').then(m => new m.LocalTarotRepository())
}
