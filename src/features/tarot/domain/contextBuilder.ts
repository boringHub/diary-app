import type { TarotReading, TarotMessage } from './types'
import { CONSENT_VERSION } from '../services/tarotConsent'

export function buildRequest(r: TarotReading,purpose:'initial'|'followup',requestId:string,assistantMessageId:string,current:TarotMessage|null,attemptOf?:string) {
  if(r.stage!=='revealed')throw new Error('请先揭示完整牌阵')
  const initial=r.messages.find(m=>m.role==='assistant'&&m.kind==='initial'&&m.status==='completed')
  if(purpose==='followup'&&!initial)throw new Error('首解完成后才能继续追问')
  const pairs: {user:TarotMessage;assistant:TarotMessage}[]=[]
  for(let i=0;i<r.messages.length-1;i++){
    const user=r.messages[i],assistant=r.messages[i+1]
    if(user.role==='user'&&assistant.role==='assistant'&&user.requestId===assistant.requestId&&assistant.status==='completed')pairs.push({user,assistant})
  }
  let turns=pairs.slice(-6).map(pair=>({user:{id:pair.user.id,content:pair.user.content},assistant:{id:pair.assistant.id,content:pair.assistant.content}}))
  const payload={schemaVersion:1,requestCreatedAt:Date.now(),requestId,assistantMessageId,purpose,consentVersion:CONSENT_VERSION,locale:'zh-CN',
    reading:{id:r.id,scenarioId:r.scenarioId,spreadId:r.spreadId,spreadVersion:r.spreadVersion,deckId:r.deckId,deckVersion:r.deckVersion,catalogVersion:r.catalogVersion,
      question:r.question,context:r.context,options:r.options,details:r.details,includeReversals:r.includeReversals,
      cards:r.spreadSnapshot.map(p=>{const c=r.drawn.find(c=>c.positionId===p.id)!;return{positionId:p.id,cardId:c.cardId,orientation:c.orientation}})},
    contextWindow:{initialAssistant:initial?{id:initial.id,content:initial.content}:null,turns},message:current?{id:current.id,content:current.content}:null,...(attemptOf?{attemptOf}:{})}
  const encode=()=>JSON.stringify(payload)
  while(turns.length&&(Array.from(JSON.stringify(payload.contextWindow)).length>20000||new TextEncoder().encode(encode()).byteLength>96*1024)){
    turns=turns.slice(1);payload.contextWindow.turns=turns
  }
  if(new TextEncoder().encode(encode()).byteLength>96*1024||Array.from(JSON.stringify(payload.contextWindow)).length>20000)throw new Error('对话内容超出本次上限，请保留原记录并建立新问题')
  return encode()
}
