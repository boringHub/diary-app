import { getNotifyApiOrigin } from '../../../services/notifyApiClient'
import { ensureRegisteredDevice } from '../../../services/deviceIdentity'
import { signedHeaders } from '../../../services/signedTransport'
import { tarotDatabase } from '../repositories/sqliteTarotRepository'
import { getTarotRepository } from '../repositories/tarotRepository'
import { aiConfiguration, hasAiConsent } from './tarotConsent'
import { consumeSse } from './sse'

export class TarotAiError extends Error {
  constructor(readonly code:string,readonly state='unknown',readonly retryAfterSeconds?:number){super(code);this.name='TarotAiError'}
}
async function signedFetch(path:string,method:string,body:string,signal:AbortSignal) {
  const origin=getNotifyApiOrigin()
  if(!origin)throw new TarotAiError('ai_unavailable','failed')
  const identity=await ensureRegisteredDevice(await tarotDatabase())
  if(signal.aborted)throw new DOMException('Aborted','AbortError')
  const headers=await signedHeaders(method,path,body,identity)
  return fetch(origin+path,{method,headers,signal,...(body?{body}:{})})
}
async function boundedJson(response:Response) {
  if(!response.body)throw new TarotAiError('invalid_response')
  const reader=response.body.getReader(),decoder=new TextDecoder('utf-8',{fatal:true})
  let size=0,text=''
  try{
    while(true){
      const {value,done}=await reader.read()
      if(done)break
      size+=value.byteLength
      if(size>128*1024)throw new TarotAiError('response_too_large')
      text+=decoder.decode(value,{stream:true})
    }
    return JSON.parse(text+decoder.decode())
  }finally{await reader.cancel().catch(()=>undefined);reader.releaseLock()}
}
async function checkResponse(response:Response){
  if(response.ok)return
  let code=`http_${response.status}`,state='unknown'
  try{const body=await boundedJson(response);code=typeof body.error==='string'?body.error:body.error?.code??code;state=body.requestState??(response.status<500?'failed':'unknown')}catch{/* Error bodies may be HTML. */}
  throw new TarotAiError(code,state,Number(response.headers.get('retry-after'))||undefined)
}
export async function requestInterpretation(body:string,requestId:string,onText:(text:string)=>Promise<void>,onMeta:(meta:Record<string,unknown>)=>void,externalSignal:AbortSignal) {
  if(!aiConfiguration().enabled||!hasAiConsent())throw new TarotAiError('consent_required','failed')
  const controller=new AbortController()
  let timedOut=false,firstText=false,done=false,lastSeq=-1,content='',idle:ReturnType<typeof setTimeout>|undefined
  const abort=()=>controller.abort()
  externalSignal.addEventListener('abort',abort,{once:true});if(externalSignal.aborted)abort()
  const expire=()=>{timedOut=true;controller.abort()}
  const total=setTimeout(expire,90000)
  const reset=()=>{clearTimeout(idle);idle=setTimeout(expire,firstText?25000:20000)}
  reset()
  try{
    const response=await signedFetch('/v1/tarot/chat/stream','POST',body,controller.signal)
    await checkResponse(response)
    if(!response.headers.get('content-type')?.includes('text/event-stream')||!response.body)throw new TarotAiError('invalid_stream')
    await consumeSse(response.body,async event=>{
      if(!['meta','delta','done','error'].includes(event.event))return
      const data=JSON.parse(event.data)
      if(data.requestId!==requestId||!Number.isSafeInteger(data.seq))throw new TarotAiError('invalid_stream')
      if(data.seq<=lastSeq)return
      if(done)throw new TarotAiError('invalid_stream')
      lastSeq=data.seq
      if(event.event==='meta')onMeta(data)
      if(event.event==='delta'){
        if(typeof data.text!=='string')throw new TarotAiError('invalid_stream')
        content+=data.text
        if(Array.from(content).length>8000)throw new TarotAiError('response_too_large')
        if(data.text){firstText=true;reset();await onText(content)}
      }
      if(event.event==='error')throw new TarotAiError(data.code??'provider_error',data.requestState??'unknown')
      if(event.event==='done'){if(!content.trim()||!['stop','length'].includes(data.finishReason))throw new TarotAiError('invalid_stream');done=true;clearTimeout(idle);onMeta(data);return false}
    },controller.signal)
    if(!done)throw new TarotAiError('stream_interrupted')
    return content
  }catch(e){if(timedOut)throw new TarotAiError('provider_timeout');throw e}
  finally{clearTimeout(total);clearTimeout(idle);controller.abort();externalSignal.removeEventListener('abort',abort)}
}
export async function recoverInterpretation(requestId:string,signal:AbortSignal) {
  if(!aiConfiguration().enabled||!hasAiConsent())throw new TarotAiError('consent_required','failed')
  const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),20000)
  const abort=()=>controller.abort();signal.addEventListener('abort',abort,{once:true});if(signal.aborted)abort()
  try{
    const response=await signedFetch(`/v1/tarot/requests/${encodeURIComponent(requestId)}`,'GET','',controller.signal)
    await checkResponse(response)
    const result=await boundedJson(response)
    if(result.requestId!==requestId)throw new TarotAiError('invalid_response')
    if(result.state==='completed'&&(typeof result.content!=='string'||Array.from(result.content).length>8000))throw new TarotAiError('invalid_response')
    return result as {state:string;requestId:string;content?:string;finishReason?:string;retryAfterSeconds?:number}
  }finally{clearTimeout(timeout);signal.removeEventListener('abort',abort)}
}
let cleaning:Promise<void>|undefined
export function flushTarotCleanup() {
  if(cleaning)return cleaning
  cleaning=(async()=>{
    const repository=await getTarotRepository(),entries=await repository.cleanup()
    // Empty/expired queues never register a device or issue a status request.
    for(const entry of entries){
      if(entry.expiresAt<=Date.now()){await repository.acknowledgeCleanup(entry.readingId);continue}
    if((entry.attempts??0)>=3||!aiConfiguration().enabled||!navigator.onLine||entry.nextAttemptAt>Date.now())continue
      const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),15000)
      try{
        const response=await signedFetch(`/v1/tarot/readings/${encodeURIComponent(entry.readingId)}/purge`,'POST','',controller.signal)
        await checkResponse(response);await repository.acknowledgeCleanup(entry.readingId)
      }catch(e){
        if(e instanceof TarotAiError&&['invalid_signature','revoked_device','unknown_device'].includes(e.code))await repository.acknowledgeCleanup(entry.readingId)
        else await repository.acknowledgeCleanup(entry.readingId,Date.now()+300000*2**(entry.attempts??0))
      }finally{clearTimeout(timeout)}
    }
  })().finally(()=>{cleaning=undefined})
  return cleaning
}
export function aiErrorText(code:string){
  const messages:Record<string,string>={consent_required:'请先阅读并同意 AI 数据说明。',ai_not_enabled:'服务器尚未为这台设备启用 AI，仍可查看本地牌义。',ai_unavailable:'AI 服务暂未接通，可以先查看本地牌义。',provider_timeout:'回复等待超时，已收到的文字已保留。可以取回上次回复。',stream_interrupted:'连接中断，回复尚未完成。可以取回上次回复。',request_in_progress:'服务器仍在处理，请稍后手动取回。',request_outcome_unknown:'上次请求结果不确定。重新请求可能再次计入额度。',result_expired:'服务器恢复缓存已过期，本机文字仍保留。',result_purged:'服务器恢复缓存已清理。',budget_exhausted:'本次额度暂不可用，请稍后再试。本地牌面会保留。',device_limit:'本次请求达到设备额度限制，请稍后再试。',revoked_device:'设备授权已撤回，无法继续在线解读。',invalid_signature:'设备签名未通过，请保留记录并联系维护者。',network_unavailable:'当前无法连接服务，已收到的文字会保留。',not_found:'服务器尚未部署星语解读接口，本地功能可以正常使用。'}
  return messages[code]??`解读未完成（${code}），牌面和已收到的内容已保留。`
}
