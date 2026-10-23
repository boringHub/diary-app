import initSqlJs from 'sql.js'
import { describe,expect,it } from 'vitest'
import { DATABASE_UPGRADES } from '../../../repositories/sqliteSchema'
import { TAROT_MIGRATION } from './tarotSchema'
describe('tarot SQLite V5 migration',()=>{
  it('preserves V4 diary, image, settings, queues and share rows, and cascades tarot deletion only',async()=>{
    const SQL=await initSqlJs({locateFile:f=>`node_modules/sql.js/dist/${f}`}),db=new SQL.Database()
    db.run('PRAGMA foreign_keys=ON')
    for(const migration of DATABASE_UPGRADES.filter(m=>m.toVersion<5))for(const statement of migration.statements)db.run(statement)
    db.run("INSERT INTO diaries (id,title,created_at,updated_at,theme_id,theme_version,layout_id) VALUES ('diary','旧日记',1,2,'default','1.0.0','layout')")
    db.run("INSERT INTO diary_assets (id,diary_id,asset_type,local_path,created_at) VALUES ('asset','diary','image','original.jpg',1)")
    db.run("INSERT INTO app_settings VALUES ('theme','\"default\"',1)")
    db.run("INSERT INTO event_queue (id,event_type,payload_json,created_at) VALUES ('event','diary_created','{}',1)")
    db.run("INSERT INTO diary_share_states (diary_id,share_id,consent_version,shared_title,shared_body,shared_occurred_at,created_at,updated_at) VALUES ('diary','share','v1','原题','原文',1,1,1)")
    const tables=['diaries','diary_assets','app_settings','event_queue','diary_share_states']
    const before=tables.map(t=>db.exec(`SELECT * FROM ${t}`))
    for(const statement of TAROT_MIGRATION)db.run(statement)
    expect(tables.map(t=>db.exec(`SELECT * FROM ${t}`))).toEqual(before)
    db.run("INSERT INTO tarot_readings (id,scenario_id,spread_id,spread_version,deck_id,deck_version,catalog_version,question,stage,spread_snapshot_json,created_at,updated_at) VALUES ('r','guidance','guidance-1',1,'rws-1909','1.0.0','rws-zh-v1','问题','draft','[]',1,1)")
    db.run("INSERT INTO tarot_drawn_cards VALUES ('r','guidance',0,'major-00','upright',0,'{}')")
    db.run("INSERT INTO tarot_messages (id,reading_id,seq,role,kind,status,created_at) VALUES ('m','r',0,'assistant','initial','pending',1)")
    db.run("INSERT INTO tarot_ai_requests VALUES ('q','r','m','{}','pending',1)")
    expect(()=>db.run("INSERT INTO tarot_drawn_cards VALUES ('r','other',1,'major-00','upright',0,'{}')")).toThrow()
    db.run("DELETE FROM tarot_readings WHERE id='r'")
    for(const table of ['tarot_drawn_cards','tarot_messages','tarot_ai_requests'])expect(db.exec(`SELECT COUNT(*) FROM ${table}`)[0].values[0][0]).toBe(0)
    expect(tables.map(t=>db.exec(`SELECT * FROM ${t}`))).toEqual(before)
    expect(db.exec('PRAGMA foreign_key_check')).toEqual([])
    db.close()
  })
})
