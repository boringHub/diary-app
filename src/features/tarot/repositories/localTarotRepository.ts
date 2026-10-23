import { assertReading } from '../domain/reading'
import type { TarotReading } from '../domain/types'
import { validateRestart, validateUpdate, type CleanupEntry, type TarotRepository } from './tarotRepository'

export class LocalTarotRepository implements TarotRepository {
  private database?: Promise<IDBDatabase>
  private open() {
    return this.database ??= new Promise((resolve, reject) => {
      const request = indexedDB.open('shiguangjian.tarot.v1', 1)
      request.onupgradeneeded = () => {
        const store = request.result.createObjectStore('readings', { keyPath: 'id' })
        store.createIndex('updatedAt', 'updatedAt')
        request.result.createObjectStore('cleanup', { keyPath: 'readingId' })
      }
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => { this.database = undefined; reject(new Error('本机记录无法打开，请确认浏览器存储可用')) }
    })
  }
  async list(): Promise<TarotReading[]> {
    const db = await this.open()
    return new Promise((resolve, reject) => {
      const request = db.transaction('readings').objectStore('readings').getAll()
      request.onsuccess = () => {
        try { const rows = request.result as TarotReading[]; rows.forEach(assertReading); resolve(rows.sort((a,b) => b.updatedAt-a.updatedAt || b.id.localeCompare(a.id))) }
        catch (error) { reject(error) }
      }
      request.onerror = () => reject(request.error)
    })
  }
  async get(id: string): Promise<TarotReading | undefined> {
    const db = await this.open()
    return new Promise((resolve,reject) => {
      const request = db.transaction('readings').objectStore('readings').get(id)
      request.onsuccess = () => { try { if (request.result) assertReading(request.result); resolve(request.result) } catch(error) { reject(error) } }
      request.onerror = () => reject(request.error)
    })
  }
  async save(reading: TarotReading, expected: number | null) {
    const db = await this.open()
    return new Promise<void>((resolve,reject) => {
      const transaction = db.transaction('readings','readwrite')
      const store = transaction.objectStore('readings'), request = store.get(reading.id)
      let failure: unknown
      request.onsuccess = () => {
        try { validateUpdate(reading,request.result,expected); store.put(reading) }
        catch (error) { failure = error instanceof DOMException ? new Error('本机空间不足或不可用，进度尚未保存') : error; transaction.abort() }
      }
      transaction.oncomplete = () => resolve()
      transaction.onabort = transaction.onerror = () => reject(failure ?? new Error('本机空间不足或不可用，进度尚未保存'))
    })
  }
  async restart(originalId: string, expected: number, draft: TarotReading) {
    const db = await this.open()
    return new Promise<void>((resolve,reject) => {
      const tx=db.transaction('readings','readwrite'),store=tx.objectStore('readings'),request=store.get(originalId)
      let failure:unknown
      request.onsuccess=()=>{
        try { validateRestart(request.result,expected,draft);store.add(draft);store.delete(originalId) }
        catch(error){failure=error;tx.abort()}
      }
      tx.oncomplete=()=>resolve()
      tx.onabort=tx.onerror=()=>reject(failure??new Error('修改未成功，原问题和牌面已保留'))
    })
  }
  async remove(id: string) {
    const db = await this.open()
    return new Promise<void>((resolve,reject) => {
      const tx = db.transaction(['readings','cleanup'],'readwrite'), store = tx.objectStore('readings')
      const request = store.get(id)
      request.onsuccess = () => {
        const row = request.result as TarotReading | undefined
        if (row?.requests.length) tx.objectStore('cleanup').put({ readingId: id, expiresAt: Date.now()+86400000, nextAttemptAt: 0, attempts: 0 })
        store.delete(id)
      }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(new Error('删除未成功，请重试'))
    })
  }
  async cleanup(): Promise<CleanupEntry[]> {
    const db = await this.open()
    return new Promise((resolve,reject) => {
      const request = db.transaction('cleanup').objectStore('cleanup').getAll()
      request.onsuccess = () => resolve(request.result)
      request.onerror = () => reject(request.error)
    })
  }
  async enqueueCleanup(id: string) {
    const db = await this.open()
    return new Promise<void>((resolve,reject) => {
      const tx=db.transaction('cleanup','readwrite')
      tx.objectStore('cleanup').put({readingId:id,expiresAt:Date.now()+86400000,nextAttemptAt:0,attempts:0})
      tx.oncomplete=()=>resolve()
      tx.onabort=tx.onerror=()=>reject(tx.error)
    })
  }
  async acknowledgeCleanup(id: string, nextAttemptAt?: number) {
    const db = await this.open()
    return new Promise<void>((resolve,reject) => {
      const tx = db.transaction('cleanup','readwrite'), store = tx.objectStore('cleanup')
      if (nextAttemptAt === undefined) store.delete(id)
      else {
        const request = store.get(id)
        request.onsuccess = () => { if (request.result) store.put({ ...request.result,nextAttemptAt,attempts:(request.result.attempts??0)+1 }) }
      }
      tx.oncomplete = () => resolve()
      tx.onabort = tx.onerror = () => reject(tx.error)
    })
  }
}
