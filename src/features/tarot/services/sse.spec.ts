import { describe,expect,it } from 'vitest'
import { consumeSse,type SseEvent } from './sse'
function bytes(text:string,chunkSize=1){
  const encoded=new TextEncoder().encode(text)
  return new ReadableStream<Uint8Array>({start(controller){for(let i=0;i<encoded.length;i+=chunkSize)controller.enqueue(encoded.slice(i,i+chunkSize));controller.close()}})
}
describe('tarot SSE framing',()=>{
  it('decodes Chinese byte-by-byte with CRLF, comments, unknown events and multiline data',async()=>{
    const events:SseEvent[]=[]
    await consumeSse(bytes(': heartbeat\r\nevent: delta\r\ndata: 第一行\r\ndata: 第二行😀\r\n\r\nevent: future\ndata: extension\n\n'),event=>{events.push(event)})
    expect(events).toEqual([{event:'delta',data:'第一行\n第二行😀'},{event:'future',data:'extension'}])
  })
  it('does not dispatch an unterminated done event and supports cancelling after a valid done',async()=>{
    const events:SseEvent[]=[]
    await consumeSse(bytes('event: done\ndata: incomplete'),e=>{events.push(e)})
    expect(events).toEqual([])
    await consumeSse(bytes('event: done\ndata: complete\n\nevent: delta\ndata: late\n\n',100),e=>{events.push(e);return false})
    expect(events).toEqual([{event:'done',data:'complete'}])
  })
  it('rejects oversize events and malformed UTF-8',async()=>{
    await expect(consumeSse(bytes(`data: ${'x'.repeat(66000)}\n\n`,8000),()=>undefined)).rejects.toThrow('event_too_large')
    const stream=new ReadableStream<Uint8Array>({start(c){c.enqueue(new Uint8Array([0xe4,0xff]));c.close()}})
    await expect(consumeSse(stream,()=>undefined)).rejects.toThrow()
  })
})
