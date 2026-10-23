import { describe,expect,it } from 'vitest'
import { catalog,getCard } from '../data/catalog'
import { getScenario } from '../data/spreads'
import { cutDeck,randomInt,shuffleDeck } from './deckEngine'
import { assertReading,countText,createReading,validateQuestion } from './reading'
import { validateUpdate } from '../repositories/tarotRepository'
import { buildRequest } from './contextBuilder'
import type { TarotReading } from './types'

function completed():TarotReading{
  const r=createReading('guidance');r.question='今天我可以留意些什么？';r.deckOrder=cutDeck(shuffleDeck(true,n=>n-1),39);r.cutIndex=39;r.stage='revealed';r.revealedAt=Date.now()
  const c=r.deckOrder[0];r.drawn=[{...c,positionId:'guidance',drawOrder:0,snapshot:{...getCard(c.cardId),positionLabel:'此刻提醒'}}]
  return r
}
describe('tarot deck invariants',()=>{
  it('ships 78 unique cards with individual upright/reversed meanings and RWS numbering',()=>{
    expect(catalog).toHaveLength(78);expect(new Set(catalog.map(c=>c.cardId)).size).toBe(78)
    expect(catalog.filter(c=>c.arcana==='major')).toHaveLength(22)
    for(const suit of ['wands','cups','swords','pentacles'])expect(catalog.filter(c=>c.suit===suit)).toHaveLength(14)
    expect(getCard('major-08').nameZh).toBe('力量');expect(getCard('major-11').nameZh).toBe('正义')
    for(const c of catalog){expect(c.meaning.length).toBeGreaterThan(15);expect(c.reversedMeaning.length).toBeGreaterThan(15);expect(c.upright.length).toBeGreaterThan(1)}
  })
  it('preserves identity and orientation through repeated cuts, with stable selectable numbers',()=>{
    const deck=shuffleDeck(true,n=>n-1),copy=structuredClone(deck)
    let cut=cutDeck(deck,18);cut=cutDeck(cut,60)
    expect(cut.map(c=>c.cardId)).toEqual(deck.map(c=>c.cardId))
    expect(cut.map(c=>c.orientation)).toEqual(deck.map(c=>c.orientation))
    expect(cut.map(c=>c.number)).toEqual(Array.from({length:78},(_,i)=>i+1))
    expect(deck).toEqual(copy)
    expect(shuffleDeck(false,n=>n-1).every(c=>c.orientation==='upright')).toBe(true)
    expect(()=>cutDeck(deck,78)).toThrow();expect(()=>randomInt(0)).toThrow()
  })
  it('keeps A and B columns consistent while permitting any position to be selected first',()=>{
    const positions=getScenario('choice').positions
    expect(positions.map(p=>p.id)).toEqual(['present','a-support','a-challenge','b-support','b-challenge'])
    expect(positions[1].x).toBe(positions[2].x);expect(positions[3].x).toBe(positions[4].x)
    const r=createReading('choice');r.question='哪一个方案更适合我现在？';r.options={a:'甲方案',b:'乙方案'}
    r.stage='drawing';r.deckOrder=cutDeck(shuffleDeck(false,n=>n-1),20);r.cutIndex=20
    r.drawn=[{...r.deckOrder[0],positionId:'b-challenge',drawOrder:0,snapshot:{...getCard(r.deckOrder[0].cardId),positionLabel:'B 的挑战'}}]
    expect(()=>assertReading(r)).not.toThrow()
    r.stage='revealed';r.revealedAt=Date.now();expect(()=>assertReading(r)).toThrow('抽满')
  })
})
describe('tarot snapshots and privacy',()=>{
  it('counts Unicode code points and rejects equivalent choice inputs',()=>{
    expect(countText('😀星语')).toBe(3)
    const r=createReading('choice');r.question='选哪一种方案适合现在？';r.options={a:' Ａ 方案 ',b:'A方案'}
    expect(()=>validateQuestion(r)).toThrow('有所不同')
    r.options.b='B方案';expect(()=>validateQuestion(r)).not.toThrow()
  })
  it('rejects stale writes, deleted-record resurrection, changed questions, replacement cards and duplicate slots',()=>{
    const r=completed();assertReading(r)
    const next=structuredClone(r);next.revision++
    expect(()=>validateUpdate(next,undefined,0)).toThrow('其他页面')
    expect(()=>validateUpdate(next,r,1)).toThrow('其他页面')
    next.question='改成另外一个不同的问题';expect(()=>validateUpdate(next,r,0)).toThrow('问题已经锁定')
    next.question=r.question;next.drawn[0].orientation=next.drawn[0].orientation==='upright'?'reversed':'upright'
    expect(()=>validateUpdate(next,r,0)).toThrow()
    const duplicate=structuredClone(r);duplicate.drawn.push({...duplicate.drawn[0]});expect(()=>assertReading(duplicate)).toThrow('不可重复')
  })
  it('uploads only stable-order selected cards and complete conversation pairs, excluding private notes and deck order',()=>{
    const r=completed();r.note='绝不上传的私人笔记';r.displayTitle='不属于原问题的标题'
    r.messages.push({id:crypto.randomUUID(),role:'assistant',kind:'initial',status:'completed',content:'已完成的首解',requestId:crypto.randomUUID(),createdAt:1})
    for(let i=0;i<8;i++){
      const requestId=crypto.randomUUID()
      r.messages.push({id:crypto.randomUUID(),role:'user',kind:'followup',status:'completed',content:`问题${i}`,requestId,createdAt:i+2})
      r.messages.push({id:crypto.randomUUID(),role:'assistant',kind:'followup',status:i===7?'interrupted':'completed',content:`回答${i}`,requestId,createdAt:i+2})
    }
    const user={id:crypto.randomUUID(),role:'user' as const,kind:'followup' as const,status:'completed' as const,content:'下一步是什么？',requestId:crypto.randomUUID(),createdAt:10}
    const body=buildRequest(r,'followup',user.requestId,crypto.randomUUID(),user)
    const payload=JSON.parse(body)
    expect(body).not.toContain(r.note);expect(body).not.toContain(r.displayTitle);expect(body).not.toContain('deckOrder');expect(body).not.toContain('snapshot');expect(body).not.toContain('回答7')
    expect(payload.contextWindow.turns).toHaveLength(6);expect(payload.contextWindow.turns[0].user.content).toBe('问题1')
    expect(payload.reading.cards).toEqual([{positionId:'guidance',cardId:r.drawn[0].cardId,orientation:r.drawn[0].orientation}])
    expect(payload.message.content).toBe(user.content)
  })
})
