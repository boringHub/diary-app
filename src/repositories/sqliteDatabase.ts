import { CapacitorSQLite,SQLiteConnection,type SQLiteDBConnection } from '@capacitor-community/sqlite'
import { DATABASE_NAME,DATABASE_SCHEMA,DATABASE_UPGRADES,DATABASE_VERSION } from './sqliteSchema'

let opening:Promise<SQLiteDBConnection>|undefined
let manager:SQLiteConnection|undefined
let operations:Promise<unknown>=Promise.resolve()
const rawConnections=new WeakMap<SQLiteDBConnection,SQLiteDBConnection>()
function serialize<T>(action:()=>Promise<T>):Promise<T>{
  const next=operations.then(action)
  operations=next.catch(()=>undefined)
  return next
}

// One manager and open promise for diary, tarot, identity and theme storage.
// SQLiteConnection's registry belongs to its JS instance, not to the plugin.
export function getSQLiteDatabase():Promise<SQLiteDBConnection>{
  return opening??=(async()=>{
    const sqlite=manager??=new SQLiteConnection(CapacitorSQLite)
    await sqlite.addUpgradeStatement(DATABASE_NAME,DATABASE_UPGRADES)
    const existing=await sqlite.isConnection(DATABASE_NAME,false)
    const raw=existing.result?await sqlite.retrieveConnection(DATABASE_NAME,false)
      :await sqlite.createConnection(DATABASE_NAME,false,'no-encryption',DATABASE_VERSION,false)
    if(!(await raw.isDBOpen()).result)await raw.open()
    await raw.execute(DATABASE_SCHEMA,true)
    const database=new Proxy(raw,{
      get(target,key){
        const value=Reflect.get(target,key,target)
        if(typeof value!=='function')return value
        // Even transaction=false writes outside a multi-statement transaction
        // must wait, e.g. device identity and notification queue updates.
        if(['run','execute','executeSet','query'].includes(String(key)))return(...args:unknown[])=>serialize(()=>value.apply(target,args))
        return value.bind(target)
      },
    })
    rawConnections.set(database,raw)
    return database
  })().catch(error=>{opening=undefined;throw error})
}

// The callback uses the raw connection exclusively until commit/rollback;
// other repositories' reads and writes wait instead of joining its transaction.
export function withSQLiteTransaction<T>(database:SQLiteDBConnection,action:(db:SQLiteDBConnection)=>Promise<T>):Promise<T>{
  return serialize(async()=>{
    const db=rawConnections.get(database)??database
    await db.beginTransaction()
    try{const result=await action(db);await db.commitTransaction();return result}
    catch(error){await db.rollbackTransaction().catch(()=>undefined);throw error}
  })
}
