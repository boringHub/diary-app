<script setup lang="ts">
import { computed, ref } from 'vue'
import { alertController,onIonViewWillEnter,useIonRouter } from '@ionic/vue'
import TarotShell from '../components/TarotShell.vue'
import { scenarios,stageLabels,getScenario } from '../data/spreads'
import { readingPath } from '../domain/reading'
import { useTarotStore } from '../stores/tarotStore'
import { useTarotChatStore } from '../stores/tarotChatStore'
import { flushTarotCleanup } from '../services/tarotAiClient'
const store=useTarotStore(),chat=useTarotChatStore(),router=useIonRouter()
const query=ref(''),filter=ref('all'),direction=ref('all'),limit=ref(20),error=ref(''),busy=ref(false)
const filtered=computed(()=>[...store.readings].filter(r=>(filter.value!=='favorite'||r.isFavorite)&&(filter.value!=='draft'||r.stage!=='revealed')&&(direction.value==='all'||r.scenarioId===direction.value)&&[r.displayTitle,r.question,r.options?.a,r.options?.b,r.note].join(' ').toLocaleLowerCase().includes(query.value.toLocaleLowerCase())).sort((a,b)=>b.updatedAt-a.updatedAt||b.id.localeCompare(a.id)))
onIonViewWillEnter(async()=>{try{await store.load(true);error.value=''}catch(e){error.value=(e as Error).message}})
async function confirmDelete(ids:string[]){
  const alert=await alertController.create({header:ids.length===1?'删除这条星语？':'清空全部星语记录？',message:'问题、牌面、对话和个人笔记将从本机删除。服务器恢复缓存最长 24 小时有效；联网后会尝试清理。删除无法撤销。',buttons:[{text:'保留',role:'cancel'},{text:'删除',role:'destructive'}]})
  await alert.present();if((await alert.onDidDismiss()).role!=='destructive')return
  busy.value=true
  try{for(const id of ids){await chat.stopAndWait(id);await store.remove(id)}void flushTarotCleanup().catch(()=>undefined)}
  catch(e){error.value=(e as Error).message}finally{busy.value=false}
}
async function favorite(id:string){try{await store.update(id,r=>{r.isFavorite=!r.isFavorite})}catch(e){error.value=(e as Error).message}}
</script>
<template>
  <TarotShell :busy="busy"><template #header><button class="t-text" @click="router.navigate('/tarot/settings','forward','push')">管理</button></template>
    <div class="t-page-body t-history"><p class="t-eyebrow">留在这片星光里</p><h1>问过的问题，<br>都好好收着。</h1><p class="t-muted">只保存在这台设备，打开与搜索不会联网。</p>
      <input v-model="query" class="t-search" aria-label="搜索星语问题、选项或个人笔记" placeholder="找一个问题、选项或笔记" @input="limit=20" />
      <div class="t-filters"><button v-for="option in [{id:'all',label:'全部'},{id:'favorite',label:'收藏'},{id:'draft',label:'未完成'}]" :key="option.id" :aria-pressed="filter===option.id" @click="filter=option.id;limit=20">{{ option.label }}</button><select v-model="direction" aria-label="按方向筛选" @change="limit=20"><option value="all">所有方向</option><option v-for="s in scenarios" :key="s.id" :value="s.id">{{ s.name }}</option></select></div>
      <p v-if="error" class="t-error" role="alert">{{ error }}</p>
      <article v-for="r in filtered.slice(0,limit)" :key="r.id" class="t-history-card"><button class="t-history-main" @click="router.navigate(readingPath(r),'forward','push')"><div class="t-history-meta"><span>{{ getScenario(r.scenarioId).name }}</span><time :datetime="new Date(r.createdAt).toISOString()">{{ new Date(r.createdAt).toLocaleDateString('zh-CN') }}</time></div><h2>{{ r.displayTitle || r.question || '还没写完的问题' }}</h2><small>{{ r.stage === 'revealed' ? r.spreadSnapshot.map(p=>r.drawn.find(c=>c.positionId===p.id)?.snapshot.nameZh).join(' · ') : `未完成 · ${stageLabels[r.stage]}` }}</small></button><div class="t-history-bottom"><button class="t-text" :aria-pressed="r.isFavorite" :aria-label="r.isFavorite ? '取消收藏' : '收藏这条星语'" @click="favorite(r.id)">{{ r.isFavorite ? '★ 已收藏' : '☆ 收藏' }}</button><button class="t-text" :disabled="busy" @click="confirmDelete([r.id])">删除</button></div></article>
      <div v-if="!filtered.length" class="t-empty-history"><span>✧</span><p>{{ store.readings.length ? '没有找到符合条件的星语。' : '这里会收好你问过的每一个问题。' }}</p><button class="t-text" @click="router.navigate('/tarot','back','pop')">去问一个问题 ↗</button></div>
      <button v-if="filtered.length>limit" class="t-secondary" @click="limit+=20">再看 20 条</button>
      <p class="t-footnote">记录没有云端备份。卸载应用或清除本机数据会丢失星语记录。</p>
      <button v-if="store.readings.length" class="t-text t-clear" :disabled="busy" @click="confirmDelete(store.readings.map(r=>r.id))">清空全部星语记录</button>
    </div>
  </TarotShell>
</template>
