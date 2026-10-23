import { afterEach,beforeEach,expect,it,vi } from 'vitest'
const mocks=vi.hoisted(()=>({enabled:true,consent:true,identity:vi.fn(),headers:vi.fn(),cleanup:vi.fn(),ack:vi.fn()}))
vi.mock('../../../services/notifyApiClient',()=>({getNotifyApiOrigin:()=> 'https://api.example.test'}))
vi.mock('../../../services/deviceIdentity',()=>({ensureRegisteredDevice:mocks.identity}))
vi.mock('../../../services/signedTransport',()=>({signedHeaders:mocks.headers}))
vi.mock('../repositories/sqliteTarotRepository',()=>({tarotDatabase:async()=>({})}))
vi.mock('../repositories/tarotRepository',()=>({getTarotRepository:async()=>({cleanup:mocks.cleanup,acknowledgeCleanup:mocks.ack})}))
vi.mock('./tarotConsent',()=>({aiConfiguration:()=>({enabled:mocks.enabled}),hasAiConsent:()=>mocks.consent}))
import { flushTarotCleanup,recoverInterpretation,requestInterpretation } from './tarotAiClient'
const fetchMock=vi.fn(),requestId='dd8d92ed-261c-4339-b368-bf894ba5399c'
const signal=()=>new AbortController().signal
const event=(name:string,seq:number,rest:Record<string,unknown>)=>`event: ${name}\ndata: ${JSON.stringify({requestId,seq,...rest})}\n\n`
const stream=(text:string)=>new Response(text,{headers:{'content-type':'text/event-stream'}})
beforeEach(()=>{
  vi.clearAllMocks();mocks.enabled=true;mocks.consent=true
  mocks.identity.mockResolvedValue({deviceId:'device',alias:'alias'});mocks.headers.mockResolvedValue({'x-signature':'signed'})
  mocks.cleanup.mockResolvedValue([]);mocks.ack.mockResolvedValue(undefined)
  vi.stubGlobal('fetch',fetchMock);vi.stubGlobal('navigator',{onLine:true})
})
afterEach(()=>vi.unstubAllGlobals())
it('never registers or sends when AI is disabled or consent is absent, including recovery',async()=>{
  mocks.enabled=false
  await expect(requestInterpretation('{}',requestId,vi.fn(),vi.fn(),signal())).rejects.toThrow('consent_required')
  await expect(recoverInterpretation(requestId,signal())).rejects.toThrow('consent_required')
  mocks.enabled=true;mocks.consent=false
  await expect(requestInterpretation('{}',requestId,vi.fn(),vi.fn(),signal())).rejects.toThrow('consent_required')
  expect(fetchMock).not.toHaveBeenCalled();expect(mocks.identity).not.toHaveBeenCalled()
})
it('uses the documented signed stream route and exact body, deduplicates sequences and requires done',async()=>{
  const body='{"exact":"请求字节"}',text=vi.fn(),meta=vi.fn()
  fetchMock.mockResolvedValueOnce(stream(event('meta',0,{model:'configured'})+event('delta',1,{text:'先看看'})+event('delta',1,{text:'重复'})+event('delta',2,{text:'你的选择。'})+event('done',3,{finishReason:'stop'})))
  await expect(requestInterpretation(body,requestId,text,meta,signal())).resolves.toBe('先看看你的选择。')
  expect(mocks.headers).toHaveBeenCalledWith('POST','/v1/tarot/chat/stream',body,{deviceId:'device',alias:'alias'})
  expect(fetchMock).toHaveBeenCalledOnce()
  expect(fetchMock).toHaveBeenCalledWith('https://api.example.test/v1/tarot/chat/stream',expect.objectContaining({method:'POST',body}))
  expect(text.mock.calls.map(call=>call[0])).toEqual(['先看看','先看看你的选择。'])
  expect(meta.mock.calls.at(-1)?.[0].finishReason).toBe('stop')
})
it('preserves incomplete text and reports unknown outcomes without any automatic retry',async()=>{
  const text=vi.fn()
  fetchMock.mockResolvedValueOnce(stream(event('delta',1,{text:'已收到的部分'})))
  await expect(requestInterpretation('{}',requestId,text,vi.fn(),signal())).rejects.toThrow('stream_interrupted')
  expect(text).toHaveBeenLastCalledWith('已收到的部分');expect(fetchMock).toHaveBeenCalledOnce()
})
it('queries only the original request and cancels oversized recovery bodies while reading',async()=>{
  fetchMock.mockResolvedValueOnce(new Response(JSON.stringify({requestId,state:'completed',content:'原回复',finishReason:'stop'})))
  await expect(recoverInterpretation(requestId,signal())).resolves.toMatchObject({content:'原回复'})
  expect(mocks.headers).toHaveBeenCalledWith('GET',`/v1/tarot/requests/${requestId}`,'',expect.anything())
  const cancel=vi.fn()
  fetchMock.mockResolvedValueOnce(new Response(new ReadableStream({pull(c){c.enqueue(new Uint8Array(129*1024))},cancel})))
  await expect(recoverInterpretation(requestId,signal())).rejects.toThrow('response_too_large')
  expect(cancel).toHaveBeenCalledOnce();expect(fetchMock).toHaveBeenCalledTimes(2)
})
it('keeps empty, disabled and exhausted cleanup queues offline and removes only expired entries locally',async()=>{
  await flushTarotCleanup()
  mocks.enabled=false
  mocks.cleanup.mockResolvedValue([{readingId:'pending',expiresAt:Date.now()+100000,nextAttemptAt:0,attempts:0},{readingId:'expired',expiresAt:0,nextAttemptAt:0,attempts:0}])
  await flushTarotCleanup()
  expect(mocks.ack).toHaveBeenCalledExactlyOnceWith('expired')
  mocks.enabled=true;mocks.cleanup.mockResolvedValue([{readingId:'pending',expiresAt:Date.now()+100000,nextAttemptAt:0,attempts:3}])
  await flushTarotCleanup()
  expect(fetchMock).not.toHaveBeenCalled();expect(mocks.identity).not.toHaveBeenCalled()
})
it('coalesces cleanup triggers and records bounded backoff without uploading reading content',async()=>{
  mocks.cleanup.mockResolvedValue([{readingId:'reading-id',expiresAt:Date.now()+86400000,nextAttemptAt:0,attempts:1}])
  fetchMock.mockRejectedValueOnce(new TypeError('offline'))
  const before=Date.now(),first=flushTarotCleanup(),second=flushTarotCleanup()
  expect(first).toBe(second);await first
  expect(fetchMock).toHaveBeenCalledExactlyOnceWith('https://api.example.test/v1/tarot/readings/reading-id/purge',expect.objectContaining({method:'POST'}))
  expect(fetchMock.mock.calls[0][1]).not.toHaveProperty('body')
  const [,nextAttempt]=mocks.ack.mock.calls[0]
  expect(nextAttempt).toBeGreaterThanOrEqual(before+600000)
})
