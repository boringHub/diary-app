<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import type { DrawnCard, ScenarioId } from '../domain/types'
import TarotCard from './TarotCard.vue'
const props = defineProps<{ card: DrawnCard | null; scenario: ScenarioId }>()
const emit = defineEmits<{ close: [] }>()
const dialog = ref<HTMLDialogElement>()
const keywords = computed(() => props.card ? (props.card.orientation === 'reversed' ? props.card.snapshot.reversed : props.card.snapshot.upright) : [])
const prompts = {
  shopping: '结合需要、使用频率、预算和替代品，哪一点有现实证据支持？',
  choice: '把两条路都放在同一标准下看，它们各自的价值和代价是什么？',
  self: '什么感受反复出现？你能为自己提供哪一种具体照顾？',
  relationship: '只从你观察到的互动出发，哪些边界和表达可以由你调整？',
  growth: '有哪些可用资源？把目标缩小到今天可以验证的一步。',
  guidance: '把这个象征当作观察提示，今天可以做哪一件小事？',
}
watch(() => props.card,async card => { await nextTick(); if (card && !dialog.value?.open) dialog.value?.showModal(); else if (!card) dialog.value?.close() },{ immediate: true })
</script>
<template>
  <dialog ref="dialog" class="t-dialog t-card-sheet" aria-labelledby="card-sheet-title" @cancel.prevent="emit('close')" @click="e => { if (e.target === dialog) emit('close') }">
    <template v-if="card">
      <button class="t-sheet-close t-text" aria-label="关闭牌义" autofocus @click="emit('close')">×</button>
      <div class="t-detail-image"><TarotCard :card="card.snapshot" :orientation="card.orientation" revealed /></div>
      <h2 id="card-sheet-title">{{ card.snapshot.nameZh }} <small>· {{ card.orientation === 'reversed' ? '逆位' : '正位' }}</small></h2>
      <p class="t-muted">{{ card.snapshot.positionLabel }} / {{ keywords.join(' · ') }}</p>
      <section><h3>这张牌在说什么</h3><p>{{ card.snapshot.meaning }}</p></section>
      <section v-if="card.orientation === 'reversed'"><h3>逆位的理解角度</h3><p>{{ card.snapshot.reversedMeaning }}</p></section>
      <section><h3>回到「{{ card.snapshot.positionLabel }}」</h3><p>{{ prompts[scenario] }}</p><p>把「{{ keywords[0] }}」放进这个牌位：哪些符合你的经历，哪些仍需要现实信息确认？</p></section>
      <p class="t-caption">本地象征牌义，供自我探索参考。逆位不自动代表坏结果。</p>
      <button class="t-primary" @click="emit('close')">回到牌阵</button>
    </template>
  </dialog>
</template>
