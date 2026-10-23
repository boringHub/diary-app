import { expect,it,vi } from 'vitest'
const bridge=vi.hoisted(()=>({created:0,managers:0,raw:null as any}))
vi.mock('@capacitor-community/sqlite',()=>({
  CapacitorSQLite:{},
  SQLiteConnection:class{
    constructor(){bridge.managers++}
    async addUpgradeStatement(){}
    async isConnection(){return{result:bridge.created>0}}
    async retrieveConnection(){return bridge.raw}
    async createConnection(){if(++bridge.created>1)throw new Error('native connection already exists');return bridge.raw}
  },
}))
import { getSQLiteDatabase,withSQLiteTransaction } from './sqliteDatabase'
import { tarotDatabase } from '../features/tarot/repositories/sqliteTarotRepository'
it('opens one shared native connection and isolates tarot transactions from diary/identity operations, including transaction=false writes',async()=>{
  const log:string[]=[]
  bridge.raw={
    async isDBOpen(){return{result:true}},
    execute:vi.fn().mockRejectedValueOnce(new Error('schema write failed')).mockResolvedValue(undefined),
    async beginTransaction(){log.push('begin')},
    async commitTransaction(){log.push('commit')},
    async rollbackTransaction(){log.push('rollback')},
    async run(sql:string){log.push(sql);return{}},
    async query(sql:string){log.push(sql);return{values:[]}},
  }
  await expect(getSQLiteDatabase()).rejects.toThrow('schema write failed')
  const [diary,tarot,identity]=await Promise.all([getSQLiteDatabase(),tarotDatabase(),getSQLiteDatabase()])
  expect(diary).toBe(tarot);expect(identity).toBe(tarot)
  expect(bridge.managers).toBe(1);expect(bridge.created).toBe(1);expect(bridge.raw.execute).toHaveBeenCalledTimes(2)
  let unblock!:()=>void,entered!:()=>void
  const gate=new Promise<void>(resolve=>{unblock=resolve}),started=new Promise<void>(resolve=>{entered=resolve})
  const transaction=withSQLiteTransaction(tarot,async db=>{
    await db.run('tarot snapshot',[],false);entered();await gate;await db.run('tarot cards',[],false)
  })
  await started
  const queueWrite=diary.run('mail queue update',[],false),identityWrite=identity.run('identity update',[],false),read=diary.query('diary read')
  await Promise.resolve();expect(log).toEqual(['begin','tarot snapshot'])
  unblock();await Promise.all([transaction,queueWrite,identityWrite,read])
  expect(log).toEqual(['begin','tarot snapshot','tarot cards','commit','mail queue update','identity update','diary read'])
  await expect(withSQLiteTransaction(tarot,async db=>{await db.run('failed draw',[],false);throw new Error('disk full')})).rejects.toThrow('disk full')
  await diary.run('next diary write')
  expect(log.slice(-4)).toEqual(['begin','failed draw','rollback','next diary write'])
})
