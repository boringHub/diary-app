<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { alertController, onIonViewWillEnter, useIonRouter } from '@ionic/vue'
import TarotShell from '../components/TarotShell.vue'
import TarotCard from '../components/TarotCard.vue'
import SpreadBoard from '../components/SpreadBoard.vue'
import CardSheet from '../components/CardSheet.vue'
import FanPicker from '../components/FanPicker.vue'
import { getScenario } from '../data/spreads'
import type { DeckCard, Stage } from '../domain/types'
import { readingPath } from '../domain/reading'
import { useTarotStore } from '../stores/tarotStore'
const route=useRoute(),router=useIonRouter(),store=useTarotStore()
const id=ref(''),view=ref<Stage>('shuffling'),busy=ref(false),motion=ref(''),error=ref(''),activeSlot=ref<string|null>(null),detail=ref<string|null>(null),flyingSlot=ref<string|null>(null),turning=ref(false),board=ref<HTMLElement>()
const reading=computed(() => store.get(id.value))
const scenario=computed(() => reading.value ? getScenario(reading.value.scenarioId) : null)
const remaining=computed(() => reading.value?.deckOrder.filter(c => !reading.value!.drawn.some(d => d.cardId === c.cardId)) ?? [])
const selectedDetail=computed(() => reading.value?.drawn.find(c => c.positionId === detail.value) ?? null)
const reduced=() => matchMedia('(prefers-reduced-motion: reduce)').matches
let animation: Animation | undefined
const pause=(duration:number) => new Promise<void>(resolve => setTimeout(resolve,reduced()?60:duration))
onIonViewWillEnter(async () => {
  try {
    id.value=String(route.params.id);await store.load();const current=reading.value
    if(!current) throw new Error('这条记录不存在或已删除')
    if(current.stage === 'draft') {router.navigate(readingPath(current),'back','replace');return}
    view.value=current.stage;activeSlot.value=null;error.value=''
  }catch(e){error.value=(e as Error).message}
})
async function run(action:()=>Promise<void>) {
  if(busy.value)return
  busy.value=true;error.value=''
  try{await action()}catch(e){error.value=(e as Error).message}finally{busy.value=false;motion.value=''}
}
const shuffle=() => run(async()=>{motion.value='washing';await pause(1800);await store.shuffle(id.value)})
const gather=() => run(async()=>{motion.value='gathering';await pause(1200);if(!reading.value?.drawn.length)await store.toCut(id.value);view.value='cutting'})
const cut=() => run(async()=>{motion.value='cutting';await pause(1050);await store.cut(id.value)})
const draw=() => run(async()=>{if(reading.value?.stage !== 'revealed')await store.toDraw(id.value);view.value='drawing'})
const reveal=() => run(async()=>{await store.reveal(id.value);view.value='revealed';turning.value=true;await pause(1050);turning.value=false})
async function revise() {
  if(busy.value)return
  const alert=await alertController.create({header:'重新整理问题？',message:'修改后会放下本次未完成的牌组，重新洗牌。原问题和补充背景会带到新草稿中。',buttons:[{text:'保留牌组',role:'cancel'},{text:'修改问题',role:'confirm'}]})
  await alert.present();if((await alert.onDidDismiss()).role!=='confirm')return
  let nextId=''
  await run(async()=>{nextId=(await store.revise(id.value)).id})
  if(nextId)router.navigate(`/tarot/new?id=${nextId}`,'back','replace')
}
function back() {
  if(activeSlot.value){activeSlot.value=null;return}
  if(view.value==='cutting')view.value='shuffling'
  else if(view.value==='drawing')view.value='cutting'
  else if(view.value==='revealed')router.navigate('/tarot','back','pop')
  else if(router.canGoBack())router.back()
  else router.navigate('/tarot','back','replace')
}
const backLabel=computed(()=>view.value==='cutting'?'洗牌':view.value==='drawing'?'切牌':'返回')
function pose(i:number) {
  const fract=(n:number)=>n-Math.floor(n)
  return { '--sx':`${Math.round((fract(Math.sin(i*12.9898+1)*43758.5453)-.5)*216)}px`, '--sy':`${Math.round((fract(Math.sin(i*78.233+7)*19341.713)-.5)*196)}px`, '--sr':`${(i*67)%170-85}deg`, '--i':i }
}
async function choose(card:DeckCard,rect:DOMRect,angle:number) {
  if(busy.value || !activeSlot.value)return
  const positionId=activeSlot.value
  await run(async()=>{
    await store.draw(id.value,positionId,card.originalSlot)
    flyingSlot.value=positionId;activeSlot.value=null;await nextTick()
    const target=board.value?.querySelector(`[data-position="${positionId}"] .t-slot-button`) as HTMLElement|undefined
    if(target){
      const dest=target.getBoundingClientRect(),node=document.createElement('div')
      node.className='t-flying-card';node.textContent='✧';Object.assign(node.style,{left:`${rect.left+rect.width/2-35}px`,top:`${rect.top+rect.height/2-60}px`,width:'70px',height:'120px'})
      document.body.append(node)
      animation=node.animate([{transform:`rotate(${angle}deg)`},{transform:'translateY(-26px) rotate(0deg)',offset:.22},{transform:`translate(${dest.left+dest.width/2-rect.left-rect.width/2}px,${dest.top+dest.height/2-rect.top-rect.height/2}px) scale(${dest.width/70},${dest.height/120}) rotate(0deg)`}],{duration:reduced()?60:680,easing:'cubic-bezier(.22,.7,.2,1)',fill:'forwards'})
      try{await animation.finished}finally{node.remove();animation=undefined}
    }
    flyingSlot.value=null;await nextTick()
    const next=reading.value?.spreadSnapshot.find(p=>!reading.value!.drawn.some(c=>c.positionId===p.id))
    ;(board.value?.querySelector(next?`[data-position="${next.id}"] button`:'button') as HTMLElement|undefined)?.focus()
  })
}
onBeforeRouteLeave(()=>{if(activeSlot.value){activeSlot.value=null;return false}if(detail.value){detail.value=null;return false}return !busy.value})
onBeforeUnmount(()=>animation?.cancel())
</script>
<template>
  <TarotShell :busy="busy" :back-label="backLabel" :on-back="back">
    <div v-if="reading && scenario" class="t-ritual" :class="motion">
      <h1>{{ view === 'shuffling' ? '洗牌' : view === 'cutting' ? '切牌' : view === 'drawing' ? '抽牌' : scenario.name }}</h1>
      <template v-if="view === 'shuffling'">
        <div class="t-deck-stage"><div class="t-scatter" aria-label="78 张完整牌组的散铺示意"><div v-for="i in 32" :key="i" class="t-scatter-card" :style="pose(i)"><TarotCard /></div></div></div>
        <p v-if="reading.drawn.length" class="t-caption">已选定的牌会一直保留，洗牌已锁定。</p>
        <button v-if="reading.stage !== 'revealed'" class="t-text" :disabled="busy" @click="revise">修改问题</button>
        <div class="t-ritual-actions"><button v-if="reading.deckOrder.length" class="t-secondary" :disabled="busy || !!reading.drawn.length || reading.stage === 'revealed'" @click="shuffle">再洗一次</button><button class="t-primary" :disabled="busy" @click="reading.deckOrder.length ? gather() : shuffle()">{{ reading.deckOrder.length ? '去切牌' : '开始洗牌' }}</button></div>
      </template>
      <template v-else-if="view === 'cutting'">
        <div class="t-deck-stage"><button class="t-cut-deck" aria-label="点击牌堆切牌" :disabled="busy || !!reading.drawn.length" @click="cut"><div v-for="pile in 2" :key="pile" class="t-cut-pile"><div v-for="i in 3" :key="i" class="t-stack-card" :style="{ '--i': i }"><TarotCard /></div></div></button></div>
        <p v-if="reading.drawn.length" class="t-caption">已抽牌，切牌已锁定。</p>
        <div class="t-ritual-actions"><button class="t-secondary" :disabled="busy || !!reading.drawn.length" @click="cut">{{ reading.cutIndex ? '再切一次' : '切牌' }}</button><button class="t-primary" :disabled="busy || !reading.cutIndex" @click="draw">去抽牌</button></div>
      </template>
      <template v-else>
        <div ref="board" class="t-board-wrap"><SpreadBoard :reading="reading" :revealed="view === 'revealed'" :flying-slot="flyingSlot" :turning="turning" @select="slot => { if(!busy) activeSlot=slot }" @detail="detail=$event" /></div>
        <p v-if="view === 'drawing'" class="t-draw-count">{{ reading.drawn.length }} / {{ reading.spreadSnapshot.length }}</p>
        <div class="t-ritual-actions"><button v-if="view === 'drawing'" class="t-primary" :disabled="busy || reading.drawn.length !== reading.spreadSnapshot.length" @click="reveal">翻开我的牌</button><button v-else class="t-primary" :disabled="busy" @click="router.navigate(`/tarot/${id}/chat`,'forward','push')">聊聊这组牌　→</button></div>
      </template>
      <p v-if="error" class="t-error" role="alert">{{ error }}</p>
      <FanPicker v-if="activeSlot" :cards="remaining" :label="reading.spreadSnapshot.find(p=>p.id===activeSlot)!.label" :busy="busy" :error="error" @close="activeSlot=null" @select="choose" />
      <CardSheet :card="selectedDetail" :scenario="reading.scenarioId" @close="detail=null" />
    </div>
    <p v-else class="t-page-body t-error" role="alert">{{ error || '正在打开牌桌…' }}</p>
  </TarotShell>
</template>
