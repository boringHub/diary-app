export interface SseEvent { event: string; data: string }
// Incremental framing: handles UTF-8 split bytes, CRLF split chunks, comments and multi-line data.
export async function consumeSse(stream:ReadableStream<Uint8Array>,onEvent:(event:SseEvent)=>void|boolean|Promise<void|boolean>,signal?:AbortSignal) {
  const reader=stream.getReader(),decoder=new TextDecoder('utf-8',{fatal:true})
  let buffer='',event='message',data:string[]=[],total=0,eventBytes=0,stopped=false
  async function line(text:string){
    if(text===''){
      if(data.length)stopped=(await onEvent({event,data:data.join('\n')}))===false
      event='message';data=[];eventBytes=0;return
    }
    eventBytes+=new TextEncoder().encode(text).length
    if(eventBytes>64*1024)throw new Error('event_too_large')
    if(text.startsWith(':'))return
    const split=text.indexOf(':'),field=split<0?text:text.slice(0,split)
    let value=split<0?'':text.slice(split+1);if(value.startsWith(' '))value=value.slice(1)
    if(field==='event')event=value
    if(field==='data')data.push(value)
  }
  const abort=()=>{void reader.cancel().catch(()=>undefined)}
  signal?.addEventListener('abort',abort,{once:true})
  try{
    while(true){
      if(signal?.aborted)throw new DOMException('Aborted','AbortError')
      const chunk=await reader.read()
      if(chunk.done){buffer+=decoder.decode();break}
      total+=chunk.value.byteLength;if(total>128*1024)throw new Error('response_too_large')
      buffer+=decoder.decode(chunk.value,{stream:true})
      let index:number
      while((index=buffer.indexOf('\n'))>=0){await line(buffer.slice(0,index).replace(/\r$/,''));buffer=buffer.slice(index+1);if(stopped)return}
      if(buffer.length>64*1024)throw new Error('event_too_large')
    }
    // An unterminated final event is deliberately not dispatched as a success.
    if(signal?.aborted)throw new DOMException('Aborted','AbortError')
  }finally{signal?.removeEventListener('abort',abort);await reader.cancel().catch(()=>undefined);reader.releaseLock()}
}
