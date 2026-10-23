import initSqlJs from 'sql.js'
import { expect,it,vi } from 'vitest'
const bridge=vi.hoisted(()=>({adapter:null as any}))
vi.mock('@capacitor-community/sqlite',()=>({
  CapacitorSQLite:{},
  SQLiteConnection:class{
    async addUpgradeStatement(){}
    async isConnection(){return{result:true}}
    async retrieveConnection(){return bridge.adapter}
  },
}))
import { SQLiteTarotRepository } from './sqliteTarotRepository'
import { createReading } from '../domain/reading'
import { shuffleDeck,cutDeck } from '../domain/deckEngine'
import { getCard } from '../data/catalog'
it('round-trips native snapshots, atomically rolls back failed draws, prevents stale writes and never resurrects deleted readings',async()=>{
  const SQL=await initSqlJs({locateFile:f=>`node_modules/sql.js/dist/${f}`}),db=new SQL.Database()
  let failDraw=false
  bridge.adapter={
    async isDBOpen(){return{result:true}},
    async execute(sql:string){db.run(sql)},
    async beginTransaction(){db.run('BEGIN TRANSACTION')},
    async commitTransaction(){db.run('COMMIT')},
    async rollbackTransaction(){db.run('ROLLBACK')},
    async query(sql:string,values:unknown[]=[]){
      const statement=db.prepare(sql);statement.bind(values as any[]);const rows=[]
      while(statement.step())rows.push(statement.getAsObject());statement.free();return{values:rows}
    },
    async run(sql:string,values:unknown[]=[]){
      if(failDraw&&sql.startsWith('INSERT INTO tarot_drawn_cards'))throw new Error('injected disk failure')
      db.run(sql,values as any[]);return{changes:{changes:db.getRowsModified()}}
    },
  }
  const repository=new SQLiteTarotRepository(),r=createReading('guidance')
  r.question='今天我可以留意些什么？'
  await repository.save(r,null)
  expect(await repository.get(r.id)).toEqual(r)
  const shuffled=structuredClone(r);shuffled.deckOrder=shuffleDeck(true,n=>n-1);shuffled.stage='shuffling';shuffled.revision++
  await repository.save(shuffled,0)
  const drawing=structuredClone(shuffled);drawing.deckOrder=cutDeck(drawing.deckOrder,30);drawing.cutIndex=30;drawing.stage='drawing';drawing.revision++
  await repository.save(drawing,1)
  const selected=structuredClone(drawing),card=selected.deckOrder[55]
  selected.drawn=[{...card,positionId:'guidance',drawOrder:0,snapshot:{...getCard(card.cardId),positionLabel:'此刻提醒'}}];selected.revision++
  failDraw=true
  await expect(repository.save(selected,2)).rejects.toThrow('disk failure')
  expect(await repository.get(r.id)).toEqual(drawing)
  failDraw=false;await repository.save(selected,2)
  expect(await repository.get(r.id)).toEqual(selected)
  await expect(repository.save(selected,2)).rejects.toThrow('其他页面')
  const completed=structuredClone(selected);completed.stage='revealed';completed.revealedAt=Date.now();completed.revision++
  completed.note='私人笔记';completed.displayTitle='一个提醒';completed.isFavorite=true
  const requestId=crypto.randomUUID(),messageId=crypto.randomUUID()
  completed.messages=[{id:messageId,role:'assistant',kind:'initial',content:'已完成的解读',status:'completed',requestId,createdAt:10,metadata:{finishReason:'stop'}}]
  completed.requests=[{requestId,assistantMessageId:messageId,body:'{"exact":"请求原始字节"}',state:'completed',createdAt:10}]
  await repository.save(completed,3)
  expect(await repository.get(r.id)).toEqual(completed)
  await repository.remove(r.id)
  expect(await repository.get(r.id)).toBeUndefined();expect(await repository.list()).toEqual([])
  expect((await repository.cleanup())[0].readingId).toBe(r.id)
  await repository.acknowledgeCleanup(r.id,Date.now()+300000)
  expect((await repository.cleanup())[0].attempts).toBe(1)
  const late=structuredClone(completed);late.revision++
  await expect(repository.save(late,4)).rejects.toThrow('其他页面')
  expect(await repository.get(r.id)).toBeUndefined()
  for(const table of ['tarot_drawn_cards','tarot_messages','tarot_ai_requests'])expect(db.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]).toBe(0)
  const unfinished=structuredClone(selected);unfinished.id=crypto.randomUUID();unfinished.revision=0
  await repository.save(unfinished,null)
  const draft=createReading('guidance');draft.question=unfinished.question
  await expect(repository.restart(unfinished.id,1,draft)).rejects.toThrow('其他页面')
  expect(await repository.get(unfinished.id)).toEqual(unfinished)
  await repository.restart(unfinished.id,0,draft)
  expect(await repository.get(unfinished.id)).toBeUndefined()
  expect(await repository.get(draft.id)).toEqual(draft)
  expect(db.exec('SELECT COUNT(*) FROM tarot_drawn_cards')[0].values[0][0]).toBe(0)
  db.close()
})
