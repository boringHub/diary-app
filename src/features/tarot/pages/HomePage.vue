<script setup lang="ts">
import { computed, ref } from 'vue'
import { onIonViewWillEnter, useIonRouter } from '@ionic/vue'
import TarotShell from '../components/TarotShell.vue'
import { useTarotStore } from '../stores/tarotStore'
import { scenarios, stageLabels } from '../data/spreads'
import { readingPath } from '../domain/reading'
import type { ScenarioId } from '../domain/types'
const store = useTarotStore(), router = useIonRouter()
const error = ref(''), busy = ref(false)
const recent = computed(() => [...store.readings].sort((a,b) => b.updatedAt-a.updatedAt || b.id.localeCompare(a.id)))
const draft = computed(() => recent.value.find(r => r.stage !== 'revealed'))
async function load() { try { error.value='';await store.load(true) } catch(e) { error.value=(e as Error).message } }
onIonViewWillEnter(load)
async function start(id: ScenarioId) {
  if (busy.value) return
  busy.value = true
  try { const reading = await store.create(id); router.navigate(readingPath(reading),'forward','push') }
  catch(e) { error.value=(e as Error).message }
  finally { busy.value=false }
}
</script>
<template>
  <TarotShell back-path="/timeline" back-label="星球" :busy="busy">
    <div class="t-page-body t-home">
      <div class="t-home-hero"><span class="t-constellation" aria-hidden="true">✧</span><p class="t-eyebrow">给自己，一段安静的时间</p><h1>把一个问题<br>放在星光里。</h1><p class="t-muted">换个角度，听听心里的声音。</p></div>
      <p v-if="error" class="t-error" role="alert">{{ error }} <button class="t-text" @click="load">重试</button></p>
      <button v-if="draft" class="t-resume" @click="router.navigate(readingPath(draft),'forward','push')"><span>上次的问题还在，继续看看吧 <b>↗</b></span><small>{{ draft.question || '还没写完的问题' }} · {{ stageLabels[draft.stage] }}</small></button>
      <div class="t-section-label"><span>今天，想聊些什么？</span><small>01 — 06</small></div>
      <div class="t-directions"><button v-for="scenario in scenarios" :key="scenario.id" class="t-direction" :disabled="busy || !store.loaded" @click="start(scenario.id)"><span class="t-glyph" aria-hidden="true">{{ scenario.glyph }}</span><strong>{{ scenario.name }}</strong><span>{{ scenario.description }}</span><small>{{ scenario.positions.length }} 张牌 · {{ scenario.positions.map(p => p.label).join(' → ') }}</small></button></div>
      <div v-if="recent.some(r => r.stage === 'revealed')" class="t-recent"><div class="t-section-label"><span>最近的星语</span><button class="t-text" @click="router.navigate('/tarot/history','forward','push')">全部 →</button></div><button v-for="r in recent.filter(r => r.stage === 'revealed').slice(0,2)" :key="r.id" class="t-history-link" @click="router.navigate(readingPath(r),'forward','push')"><span>{{ r.displayTitle || r.question }}</span><small>{{ new Date(r.createdAt).toLocaleDateString('zh-CN') }}</small></button></div>
      <p class="t-footnote">塔罗提供思考角度，选择仍由你决定。</p>
    </div>
  </TarotShell>
</template>
