<script setup lang="ts">
import { computed,nextTick,onBeforeUnmount,ref,watch } from 'vue'
import { onBeforeRouteLeave,useRoute } from 'vue-router'
import { alertController,onIonViewWillEnter,useIonRouter } from '@ionic/vue'
import TarotShell from '../components/TarotShell.vue'
import TarotCard from '../components/TarotCard.vue'
import CardSheet from '../components/CardSheet.vue'
import { getScenario } from '../data/spreads'
import { countText,readingPath } from '../domain/reading'
import { useTarotStore } from '../stores/tarotStore'
import { useTarotChatStore } from '../stores/tarotChatStore'
import { aiConfiguration,grantAiConsent,hasAiConsent } from '../services/tarotConsent'
const route=useRoute(),router=useIonRouter(),store=useTarotStore(),chat=useTarotChatStore()
const id=ref(''),text=ref(''),note=ref(''),title=ref(''),error=ref(''),consent=ref(false),details=ref<string|null>(null),messages=ref<HTMLElement>(),hasNew=ref(false),autoScroll=ref(true),metadataOpen=ref(false),noteDirty=ref(false)
const reading=computed(()=>store.get(id.value)),scenario=computed(()=>reading.value?getScenario(reading.value.scenarioId):null)
const config=aiConfiguration(),busy=computed(()=>chat.activeReadingId===id.value)
const initial=computed(()=>reading.value?.messages.find(m=>m.role==='assistant'&&m.kind==='initial'&&m.status==='completed'))
const lastIncomplete=computed(()=>{
  const latest=[...(reading.value?.messages??[])].reverse().find(m=>m.role==='assistant')
  return latest?.status!=='completed'?latest:undefined
})
const card=computed(()=>reading.value?.drawn.find(c=>c.positionId===details.value)??null)
let noteTimer:ReturnType<typeof setTimeout>|undefined,noteVersion=0,notePromise:Promise<boolean>|undefined
onIonViewWillEnter(async()=>{
  try{
    id.value=String(route.params.id);error.value='';await store.load();const current=reading.value
    if(!current)throw new Error('这条记录不存在或已删除')
    if(current.stage!=='revealed'){router.navigate(readingPath(current),'back','replace');return}
    note.value=current.note;title.value=current.displayTitle;noteDirty.value=false;consent.value=hasAiConsent()
    await chat.settleStale(id.value)
  }catch(e){error.value=(e as Error).message}
})
watch(()=>chat.liveText,async()=>{
  if(!busy.value)return
  await nextTick()
  if(autoScroll.value)scrollBottom();else hasNew.value=true
})
function onScroll(){const el=messages.value;if(el)autoScroll.value=el.scrollHeight-el.scrollTop-el.clientHeight<100}
function scrollBottom(){const el=messages.value;if(el)el.scrollTop=el.scrollHeight;hasNew.value=false;autoScroll.value=true}
async function start(){
  try{if(!hasAiConsent())grantAiConsent();consent.value=true;await chat.start(id.value)}catch(e){error.value=(e as Error).message}
}
async function send(){
  if(busy.value||!text.value.trim())return
  const input=text.value;text.value='';autoScroll.value=true
  await chat.start(id.value,input)
  if(!reading.value?.messages.some(m=>m.role==='user'&&m.content===input.trim()))text.value=input
}
async function retry(){
  const alert=await alertController.create({header:'重新请求这次解读？',message:'会保留上次未完成的回复，并建立一次新请求。上游可能已经产生费用，这次可能再次计入额度。',buttons:[{text:'先保留',role:'cancel'},{text:'重新请求',role:'confirm'}]})
  await alert.present();if((await alert.onDidDismiss()).role!=='confirm')return
  const last=lastIncomplete.value
  const user=last?.kind==='followup'?reading.value?.messages.find(m=>m.role==='user'&&m.requestId===last.requestId):null
  await chat.start(id.value,user?.content??'',true)
}
function editNote(){noteVersion++;noteDirty.value=true;clearTimeout(noteTimer);noteTimer=setTimeout(()=>void saveNote(),450)}
function saveNote():Promise<boolean>{
  clearTimeout(noteTimer)
  if(notePromise)return notePromise
  notePromise=(async()=>{
    try{
      while(noteDirty.value){
        if(countText(note.value)>2000||countText(title.value)>80){error.value='个人笔记最多 2,000 字，显示标题最多 80 字。';return false}
        const version=noteVersion,nextNote=note.value,nextTitle=title.value.trim()
        await store.update(id.value,r=>{r.note=nextNote;r.displayTitle=nextTitle})
        if(version===noteVersion)noteDirty.value=false
      }
      error.value='';return true
    }catch(e){error.value=`${(e as Error).message}。笔记尚未保存。`;return false}
  })().finally(()=>{notePromise=undefined})
  return notePromise
}
async function toggleNotes(){
  if(metadataOpen.value&&!(await saveNote()))return
  metadataOpen.value=!metadataOpen.value
}
async function favorite(){try{await store.update(id.value,r=>{r.isFavorite=!r.isFavorite})}catch(e){error.value=(e as Error).message}}
onBeforeRouteLeave(async()=>{if(details.value){details.value=null;return false}await chat.stopAndWait(id.value);return saveNote()})
onBeforeUnmount(()=>{clearTimeout(noteTimer);void chat.stopAndWait(id.value)})
</script>
<template>
  <TarotShell>
    <template #header><button class="t-text" @click="toggleNotes">{{ metadataOpen ? '收起' : '笔记' }}</button></template>
    <div v-if="reading && scenario" class="t-chat-layout">
      <details class="t-chat-summary" open><summary><span>{{ scenario.name }} · {{ reading.displayTitle || reading.question }}</span></summary><p>{{ reading.question }}</p><p v-if="reading.options" class="t-caption">A · {{ reading.options.a }}<br>B · {{ reading.options.b }}</p><div class="t-mini-cards"><button v-for="position in reading.spreadSnapshot" :key="position.id" :aria-label="`查看${reading.drawn.find(c=>c.positionId===position.id)?.snapshot.nameZh}本地牌义`" @click="details=position.id"><TarotCard :card="reading.drawn.find(c=>c.positionId===position.id)!.snapshot" :orientation="reading.drawn.find(c=>c.positionId===position.id)!.orientation" revealed /><small>{{ position.label }}</small></button></div></details>
      <div ref="messages" class="t-messages" @scroll="onScroll">
        <p class="t-caption t-center">牌面与聊天保存在本机，点击卡牌可查看本地牌义。</p>
        <section v-if="!reading.requests.length" class="t-ai-intro">
          <h2>先认识这些牌，<br>再听听新的角度。</h2>
          <template v-if="config.enabled">
            <template v-if="!consent"><p>AI 会收到这次的问题、你填写的背景、牌阵及必要聊天内容，经拾光笺 API 请求模型服务。个人笔记和其他日记不会发送。</p><details><summary>数据如何处理</summary><p>模型服务：{{ config.provider }}。服务器会加密缓存完整回复，最长 24 小时有效；过期数据由服务端清理，平台备份可能保留更久的加密副本。模型方的数据处理以其政策为准。</p><a :href="config.policyUrl" target="_blank" rel="noopener noreferrer">查看服务商政策 ↗</a></details></template>
            <button class="t-primary" :disabled="busy" @click="start">{{ consent ? '让 AI 解读' : '同意并开始解读' }}</button>
          </template>
          <template v-else><p>AI 解读尚未接通。你仍可以完整查看本地牌义，写下自己的思考，之后从这条记录继续。</p></template>
          <button class="t-secondary" @click="details=reading.spreadSnapshot[0].id">{{ config.enabled ? '先看本地牌义' : '查看本地牌义' }}</button>
        </section>
        <article v-for="message in reading.messages" :key="message.id" class="t-message" :class="message.role"><small>{{ message.role === 'assistant' ? '星语' : '你' }}</small><div class="t-message-text">{{ busy && message.id === reading.messages.at(-1)?.id && message.role === 'assistant' ? (chat.liveText || message.content || '正在连接解读…') : (message.content || (message.status === 'pending' ? '等待回复…' : '这次没有收到完整回复。')) }}</div><small v-if="message.role === 'assistant' && message.status !== 'completed'">{{ busy && message.id === reading.messages.at(-1)?.id ? '正在解读…' : '未完成 · 已保留收到的文字' }}</small><small v-if="message.metadata?.finishReason === 'length'">已达到本次长度上限</small></article>
        <p v-if="chat.error || error" class="t-error" role="alert">{{ error || chat.error }}</p>
        <div v-if="lastIncomplete && !busy && config.enabled && consent" class="t-recovery"><button class="t-secondary" @click="chat.recover(id,lastIncomplete.requestId)">取回上次回复</button><button class="t-text" @click="retry">重新请求，可能再次计入额度</button></div>
        <div v-if="initial && !busy" class="t-suggestions"><button @click="text='我可以先做哪一步？'">我可以先做哪一步？</button><button @click="text='这几张牌之间有什么联系？'">看看牌之间的联系</button></div>
        <section v-show="metadataOpen" class="t-local-note"><h2>只写给自己</h2><label class="t-field">显示标题<input v-model="title" placeholder="给这段星语起个名字" @input="editNote" @blur="saveNote" /></label><label class="t-field">个人笔记 · 不发送给 AI<textarea v-model="note" placeholder="这些牌，让你想起了什么？" @input="editNote" @blur="saveNote" /><small>{{ countText(note) }} / 2,000 · {{ noteDirty ? '尚未保存' : '已保存' }}</small></label><button v-if="noteDirty" class="t-secondary" @click="saveNote">保存笔记</button></section>
        <div class="t-chat-tools"><button class="t-text" :aria-pressed="reading.isFavorite" @click="favorite">{{ reading.isFavorite ? '★ 已收藏' : '☆ 收藏' }}</button><button class="t-text" @click="toggleNotes">个人笔记{{ reading.note ? ' · 已写' : '' }}</button><button class="t-text" @click="router.navigate('/tarot','forward','push')">再问一个问题 ↗</button></div>
      </div>
      <button v-if="hasNew" class="t-new-reply" @click="scrollBottom">有新回复 ↓</button>
      <form v-if="initial && config.enabled && consent" class="t-composer" @submit.prevent="send"><textarea v-model="text" rows="1" aria-label="追问内容" placeholder="聊聊你在意的地方…" :disabled="busy" /><small>{{ countText(text) }} / 1,000</small><button v-if="busy" type="button" @click="chat.stop">停止</button><button v-else type="submit" :disabled="!text.trim() || countText(text)>1000 || !!chat.activeReadingId">发送</button></form>
      <button v-else-if="busy" class="t-secondary t-stop" @click="chat.stop">停止解读</button>
      <CardSheet :card="card" :scenario="reading.scenarioId" @close="details=null" />
    </div>
    <p v-else class="t-page-body t-error" role="alert">{{ error || '正在打开星语…' }}</p>
  </TarotShell>
</template>
