import type { SQLiteDBConnection } from '@capacitor-community/sqlite'
import { getSQLiteDatabase,withSQLiteTransaction } from '../../../repositories/sqliteDatabase'
import { assertReading } from '../domain/reading'
import type { TarotReading } from '../domain/types'
import { validateRestart, validateUpdate, type CleanupEntry, type TarotRepository } from './tarotRepository'

export const tarotDatabase=getSQLiteDatabase
export class SQLiteTarotRepository implements TarotRepository {
  private queue: Promise<unknown> = Promise.resolve()
  private write<T>(action: (db: SQLiteDBConnection) => Promise<T>) {
    const next = this.queue.then(async () => {
      const db = await tarotDatabase()
      return withSQLiteTransaction(db,action)
    })
    this.queue = next.catch(() => undefined)
    return next
  }
  async list() {
    await this.queue
    const db = await tarotDatabase()
    const rows = (await db.query('SELECT id FROM tarot_readings ORDER BY updated_at DESC,id DESC')).values ?? []
    return Promise.all(rows.map(row => this.read(db,String(row.id)).then(r => r!)))
  }
  async get(id: string) { await this.queue; return this.read(await tarotDatabase(),id) }
  private async read(db: SQLiteDBConnection,id: string): Promise<TarotReading | undefined> {
    const row = (await db.query('SELECT * FROM tarot_readings WHERE id=?',[id])).values?.[0]
    if (!row) return undefined
    const drawn = (await db.query('SELECT * FROM tarot_drawn_cards WHERE reading_id=? ORDER BY draw_order',[id])).values ?? []
    const messages = (await db.query('SELECT * FROM tarot_messages WHERE reading_id=? ORDER BY seq',[id])).values ?? []
    const requests = (await db.query('SELECT * FROM tarot_ai_requests WHERE reading_id=? ORDER BY created_at',[id])).values ?? []
    const reading: TarotReading = {
      id, schemaVersion: row.schema_version, scenarioId: row.scenario_id, spreadId: row.spread_id, spreadVersion: row.spread_version,
      deckId: row.deck_id, deckVersion: row.deck_version, catalogVersion: row.catalog_version,
      question: row.question, context: row.context, options: JSON.parse(row.options_json ?? 'null'), details: JSON.parse(row.details_json),
      includeReversals: !!row.include_reversals, stage: row.stage, deckOrder: JSON.parse(row.deck_order_json ?? '[]'), cutIndex: row.cut_index,
      spreadSnapshot: JSON.parse(row.spread_snapshot_json), displayTitle: row.display_title, note: row.note, isFavorite: !!row.is_favorite,
      createdAt: row.created_at, updatedAt: row.updated_at, revealedAt: row.revealed_at, revision: row.revision,
      drawn: drawn.map(c => ({ ...JSON.parse(c.snapshot_json), cardId: c.card_id, positionId: c.position_id, drawOrder: c.draw_order, orientation: c.orientation, originalSlot: c.original_slot })),
      messages: messages.map(m => ({ id: m.id, role: m.role, kind: m.kind, content: m.content, status: m.status, requestId: m.request_id,
        createdAt: m.created_at, errorCode: m.error_code ?? undefined, metadata: JSON.parse(m.metadata_json ?? '{}') })),
      requests: requests.map(r => ({ requestId: r.request_id, assistantMessageId: r.assistant_message_id, body: r.body_json, state: r.state, createdAt: r.created_at })),
    }
    assertReading(reading)
    return reading
  }
  save(r: TarotReading, expected: number | null) {
    return this.write(db => this.persist(db,r,expected))
  }
  private async persist(db: SQLiteDBConnection,r: TarotReading,expected: number | null) {
      validateUpdate(r,await this.read(db,r.id),expected)
      const fields = ['id','schema_version','scenario_id','spread_id','spread_version','deck_id','deck_version','catalog_version','question','context','options_json','details_json','include_reversals','stage','deck_order_json','cut_index','spread_snapshot_json','display_title','note','is_favorite','revision','created_at','updated_at','revealed_at']
      const values = [r.id,r.schemaVersion,r.scenarioId,r.spreadId,r.spreadVersion,r.deckId,r.deckVersion,r.catalogVersion,r.question,r.context,JSON.stringify(r.options),JSON.stringify(r.details),+r.includeReversals,r.stage,JSON.stringify(r.deckOrder),r.cutIndex,JSON.stringify(r.spreadSnapshot),r.displayTitle,r.note,+r.isFavorite,r.revision,r.createdAt,r.updatedAt,r.revealedAt]
      await db.run(`INSERT INTO tarot_readings (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')}) ON CONFLICT(id) DO UPDATE SET ${fields.slice(1).map(f => `${f}=excluded.${f}`).join(',')}`,values,false)
      await db.run('DELETE FROM tarot_drawn_cards WHERE reading_id=?',[r.id],false)
      for (const c of r.drawn) await db.run('INSERT INTO tarot_drawn_cards VALUES (?,?,?,?,?,?,?)',[r.id,c.positionId,c.drawOrder,c.cardId,c.orientation,c.originalSlot,JSON.stringify({ snapshot: c.snapshot, number: c.number })],false)
      await db.run('DELETE FROM tarot_messages WHERE reading_id=?',[r.id],false)
      for (const [seq,m] of r.messages.entries()) await db.run('INSERT INTO tarot_messages (id,reading_id,seq,role,kind,content,status,request_id,error_code,metadata_json,created_at) VALUES (?,?,?,?,?,?,?,?,?,?,?)',[m.id,r.id,seq,m.role,m.kind,m.content,m.status,m.requestId,m.errorCode ?? null,JSON.stringify(m.metadata ?? {}),m.createdAt],false)
      await db.run('DELETE FROM tarot_ai_requests WHERE reading_id=?',[r.id],false)
      for (const q of r.requests) await db.run('INSERT INTO tarot_ai_requests VALUES (?,?,?,?,?,?)',[q.requestId,r.id,q.assistantMessageId,q.body,q.state,q.createdAt],false)
  }
  restart(originalId: string,expected: number,draft: TarotReading) {
    return this.write(async db => {
      validateRestart(await this.read(db,originalId),expected,draft)
      await this.persist(db,draft,null)
      await db.run('DELETE FROM tarot_readings WHERE id=?',[originalId],false)
    })
  }
  remove(id: string) {
    return this.write(async db => {
      const row = await this.read(db,id)
      if (row?.requests.length) await db.run('INSERT OR IGNORE INTO tarot_cleanup_outbox (reading_id,expires_at) VALUES (?,?)',[id,Date.now()+86400000],false)
      await db.run('DELETE FROM tarot_ai_requests WHERE reading_id=?',[id],false)
      await db.run('DELETE FROM tarot_messages WHERE reading_id=?',[id],false)
      await db.run('DELETE FROM tarot_drawn_cards WHERE reading_id=?',[id],false)
      await db.run('DELETE FROM tarot_readings WHERE id=?',[id],false)
    })
  }
  async cleanup(): Promise<CleanupEntry[]> {
    await this.queue
    const rows = (await (await tarotDatabase()).query('SELECT * FROM tarot_cleanup_outbox')).values ?? []
    return rows.map(r => ({ readingId: r.reading_id,expiresAt: r.expires_at,nextAttemptAt: r.next_attempt_at,attempts: r.attempts }))
  }
  enqueueCleanup(id:string) {
    return this.write(async db=>{await db.run('INSERT INTO tarot_cleanup_outbox (reading_id,expires_at,next_attempt_at) VALUES (?,?,0) ON CONFLICT(reading_id) DO UPDATE SET expires_at=excluded.expires_at,next_attempt_at=0,attempts=0',[id,Date.now()+86400000],false)})
  }
  acknowledgeCleanup(id: string,nextAttemptAt?: number) {
    return this.write(async db => {
      if (nextAttemptAt === undefined) await db.run('DELETE FROM tarot_cleanup_outbox WHERE reading_id=?',[id],false)
      else await db.run('UPDATE tarot_cleanup_outbox SET next_attempt_at=?,attempts=attempts+1 WHERE reading_id=?',[nextAttemptAt,id],false)
    })
  }
}
