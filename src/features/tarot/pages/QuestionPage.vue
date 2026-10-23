<script setup lang="ts">
import { computed, onBeforeUnmount, ref, toRaw, watch } from 'vue'
import { useRoute, onBeforeRouteLeave } from 'vue-router'
import { onIonViewWillEnter, useIonRouter } from '@ionic/vue'
import TarotShell from '../components/TarotShell.vue'
import { getScenario, scenarios } from '../data/spreads'
import { countText, readingPath } from '../domain/reading'
import type { TarotReading } from '../domain/types'
import { useTarotStore } from '../stores/tarotStore'
const route = useRoute(), router = useIonRouter(), store = useTarotStore()
const form = ref<TarotReading>(), error = ref(''), saving = ref(false), beginning = ref(false), dirty = ref(false)
const scenario = computed(() => form.value ? getScenario(form.value.scenarioId) : null)
let timer: ReturnType<typeof setTimeout> | undefined, loading = false, locked = false, editVersion = 0
let savingPromise: Promise<boolean> | undefined
const saved = ref(false)
onIonViewWillEnter(async () => {
  try {
    loading=true; locked=false; error.value='';await store.load()
    const id = String(route.query.id ?? '')
    let current = store.get(id)
    if (!current) {
      if (id) throw new Error('这条记录不存在或已删除')
      const scenarioId = scenarios.find(s => s.id === route.query.scenario)?.id ?? 'guidance'
      current = await store.create(scenarioId)
      await router.navigate(`/tarot/new?id=${current.id}`,'root','replace')
    }
    if (current.stage !== 'draft') { router.navigate(readingPath(current),'forward','replace');return }
    form.value=structuredClone(toRaw(current));dirty.value=false;saved.value=true
  } catch(e) { error.value=(e as Error).message }
  finally { loading=false }
})
watch(form,() => {
  if (loading || locked) return
  dirty.value=true;saved.value=false;editVersion++;clearTimeout(timer)
  timer=setTimeout(() => { void flush() },400)
},{deep:true,flush:'sync'})
function flush(): Promise<boolean> {
  clearTimeout(timer)
  if (savingPromise) return savingPromise
  savingPromise=(async () => {
    saving.value=true
    try {
      while (dirty.value && form.value && !locked) {
        const input=structuredClone(toRaw(form.value)), version=editVersion
        await store.update(input.id,r => { if(r.stage !== 'draft') throw new Error('问题已经锁定');r.question=input.question;r.context=input.context;r.options=input.options;r.details=input.details })
        if (version === editVersion) dirty.value=false
      }
      error.value='';saved.value=true;return true
    } catch(e) { error.value=`${(e as Error).message}。当前输入尚未保存。`;return false }
  })().finally(() => { saving.value=false;savingPromise=undefined })
  return savingPromise
}
async function begin() {
  if (beginning.value || !form.value) return
  beginning.value=true
  try {
    if (!(await flush())) return
    const next=await store.begin(form.value.id);locked=true;dirty.value=false
    router.navigate(`/tarot/${next.id}/ritual`,'forward','push')
  } catch(e) { error.value=(e as Error).message }
  finally { beginning.value=false }
}
onBeforeRouteLeave(async () => locked || await flush())
onBeforeUnmount(() => clearTimeout(timer))
</script>
<template>
  <TarotShell :busy="beginning">
    <form v-if="form && scenario" class="t-question t-page-body" @submit.prevent="begin" @focusout="flush">
      <div class="t-question-heading"><p class="t-eyebrow">{{ scenario.glyph }}　{{ scenario.name }}</p><h1 id="question-title">你想问些什么？</h1></div>
      <div class="t-question-paper"><textarea v-model="form.question" aria-labelledby="question-title" :placeholder="scenario.example" aria-describedby="question-count" required /><span id="question-count" :class="{ 't-invalid': countText(form.question)>800 }">{{ countText(form.question) }} / 800</span></div>
      <div v-if="form.options" class="t-pair"><label class="t-field">选项 A<input v-model="form.options.a" placeholder="第一种选择" required /><small>{{ countText(form.options.a) }} / 100</small></label><label class="t-field">选项 B<input v-model="form.options.b" placeholder="另一种选择" required /><small>{{ countText(form.options.b) }} / 100</small></label></div>
      <details class="t-disclosure"><summary>补充背景 <small>{{ form.context || Object.values(form.details).some(Boolean) ? '已填写' : '选填' }}</small></summary>
        <label class="t-field">你在意的细节<textarea v-model="form.context" placeholder="补充一些与你的问题有关的信息…" /><small>{{ countText(form.context) }} / 1,200</small></label>
        <template v-if="form.scenarioId === 'shopping'">
          <label class="t-field">想买什么<input v-model="form.details.item" maxlength="200" /></label>
          <div class="t-pair"><label class="t-field">价格（选填）<input v-model="form.details.price" inputmode="decimal" maxlength="200" /></label><label class="t-field">币种<select v-model="form.details.currency"><option value="">请选择</option><option>CNY</option><option>USD</option><option>EUR</option><option>JPY</option><option>HKD</option></select></label></div>
          <label class="t-field">预算感受<input v-model="form.details.budget" placeholder="这笔开销对你的影响" maxlength="200" /></label><label class="t-field">已有替代品<input v-model="form.details.alternative" maxlength="200" /></label>
        </template>
        <label class="t-field">希望关注的时间范围<input v-model="form.details.timeframe" placeholder="例如：接下来两周（仅作背景）" maxlength="200" /></label>
      </details>
      <p class="t-caption">{{ scenario.positions.length }} 张牌 · {{ scenario.positions.map(p => p.label).join(' → ') }}</p>
      <p class="t-save-status" role="status">{{ saving ? '正在保存…' : dirty ? '等待保存' : saved ? '草稿已收好' : '' }}</p>
      <p v-if="error" class="t-error" role="alert">{{ error }} <button type="button" class="t-text" @click="flush">重试保存</button></p>
      <div class="t-question-footer"><button type="submit" class="t-primary" :disabled="beginning">去洗牌　→</button></div>
    </form>
    <div v-else class="t-page-body"><p class="t-error" role="alert">{{ error || '正在打开问题…' }}</p></div>
  </TarotShell>
</template>
