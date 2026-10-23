import { defineStore } from 'pinia'
import { ref } from 'vue'
import { buildRequest } from '../domain/contextBuilder'
import { countText } from '../domain/reading'
import type { TarotMessage } from '../domain/types'
import { useTarotStore } from './tarotStore'
import { hasAiConsent } from '../services/tarotConsent'
import { aiErrorText, flushTarotCleanup, recoverInterpretation, requestInterpretation, TarotAiError } from '../services/tarotAiClient'

export const useTarotChatStore=defineStore('tarot-chat',()=>{
  const activeReadingId=ref<string|null>(null),liveText=ref(''),error=ref('')
  const readings=useTarotStore()
  let controller:AbortController|undefined,operation:Promise<void>|undefined
  function stop(){controller?.abort()}
  window.addEventListener('tarot-consent-revoked',stop)
  document.addEventListener('visibilitychange',()=>{if(document.hidden)stop()})
  window.addEventListener('pagehide',stop)
  async function settleStale(id:string){
    if(activeReadingId.value===id)return
    if(readings.get(id)?.messages.some(m=>['pending','streaming'].includes(m.status))){
      await readings.update(id,r=>{
        for(const m of r.messages)if(['pending','streaming'].includes(m.status))m.status='unknown'
        for(const q of r.requests)if(['pending','streaming'].includes(q.state))q.state='unknown'
      })
    }
  }
  async function start(id:string,text='',retry=false){
    if(activeReadingId.value)return
    if(!hasAiConsent()){error.value=aiErrorText('consent_required');return}
    const reading=readings.get(id);if(!reading)return
    const initial=reading.messages.find(m=>m.kind==='initial'&&m.role==='assistant'&&m.status==='completed')
    const purpose=initial?'followup':'initial'
    if(purpose==='followup'&&(countText(text.trim())<1||countText(text.trim())>1000)){error.value='追问请写 1–1,000 个字';return}
    if(purpose==='initial'&&reading.requests.length&&!retry){error.value='请先取回上次回复，或明确选择重新请求。';return}
    activeReadingId.value=id;error.value='';liveText.value='';controller=new AbortController()
    const signal=controller.signal,requestId=crypto.randomUUID(),assistantMessageId=crypto.randomUUID()
    let content='',metadata:Record<string,unknown>={},lastFlush=Date.now(),lastLength=0,prepared=false
    const assistant:TarotMessage={id:assistantMessageId,role:'assistant',kind:purpose,content:'',status:'pending',requestId,createdAt:Date.now()}
    const user:TarotMessage|null=purpose==='followup'?{id:crypto.randomUUID(),role:'user',kind:purpose,content:text.trim(),status:'completed',requestId,createdAt:Date.now()}:null
    const previous=retry?reading.requests.at(-1)?.requestId:undefined
    const save=async(status:TarotMessage['status'],code?:string)=>{
      if(!readings.get(id))return
      await readings.update(id,r=>{
        const message=r.messages.find(m=>m.id===assistantMessageId),request=r.requests.find(q=>q.requestId===requestId)
        if(!message||!request)return
        message.content=content;message.status=status;message.metadata=metadata;message.errorCode=code;request.state=status
      })
      lastFlush=Date.now();lastLength=content.length
    }
    operation=(async()=>{
      try{
        const body=buildRequest(reading,purpose,requestId,assistantMessageId,user,previous)
        await readings.update(id,r=>{
          if(user)r.messages.push(user)
          r.messages.push(assistant)
          r.requests.push({requestId,assistantMessageId,body,state:'pending',createdAt:Date.now()})
        })
        prepared=true
        await flushTarotCleanup()
        content=await requestInterpretation(body,requestId,async text=>{
          content=text;liveText.value=text
          if(!readings.get(id)){controller?.abort();return}
          if(Date.now()-lastFlush>=300||content.length-lastLength>=256)await save('streaming')
        },data=>{metadata={...metadata,...data}},signal)
        await save('completed')
      }catch(e){
        const aborted=signal.aborted,code=e instanceof TarotAiError?e.code:e instanceof Error?e.message:'network_unavailable'
        const status=aborted?'interrupted':e instanceof TarotAiError&&e.state==='failed'?'failed':'unknown'
        if(prepared)await save(status,aborted?'stopped':code).catch(()=>{error.value='最新文字未能保存，请保留当前页面后重试。'})
        if(!error.value)error.value=aborted?'已停止。部分回复已保留；上游可能已产生费用。':aiErrorText(code)
      }finally{activeReadingId.value=null;controller=undefined;operation=undefined}
    })()
    return operation
  }
  async function stopAndWait(id?:string){if(!id||activeReadingId.value===id){stop();await operation}}
  async function recover(id:string,requestId:string){
    if(activeReadingId.value||!hasAiConsent())return
    activeReadingId.value=id;error.value='';controller=new AbortController()
    try{
      const result=await recoverInterpretation(requestId,controller.signal)
      if(!readings.get(id))return
      if(result.state==='completed'&&result.content){
        await readings.update(id,r=>{
          const q=r.requests.find(q=>q.requestId===requestId),m=r.messages.find(m=>m.role==='assistant'&&m.requestId===requestId)
          if(q&&m){q.state='completed';m.content=result.content!;m.status='completed';m.errorCode=undefined;m.metadata={...m.metadata,finishReason:result.finishReason}}
        })
      }else error.value=result.state==='running'?`服务器仍在处理，请约 ${result.retryAfterSeconds??10} 秒后手动取回。`:'上次回复未完成，可以保留现状或明确重新请求。'
    }catch(e){error.value=aiErrorText(e instanceof TarotAiError?e.code:'network_unavailable')}
    finally{activeReadingId.value=null;controller=undefined}
  }
  return{activeReadingId,liveText,error,start,stop,stopAndWait,recover,settleStale}
})
