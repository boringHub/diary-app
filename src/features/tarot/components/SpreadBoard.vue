<script setup lang="ts">
import type { TarotReading } from '../domain/types'
import TarotCard from './TarotCard.vue'
const props = defineProps<{ reading: TarotReading; revealed?: boolean; flyingSlot?: string | null; turning?: boolean }>()
defineEmits<{ select: [id: string]; detail: [id: string] }>()
const cardAt = (id: string) => props.reading.drawn.find(c => c.positionId === id)
</script>
<template>
  <div class="t-spread" :class="[`t-spread-${reading.spreadSnapshot.length}`, { 't-turning': turning }]">
    <div v-for="(position, index) in reading.spreadSnapshot" :key="position.id" class="t-slot" :data-position="position.id" :style="{ '--order': index }">
      <button class="t-slot-button" :disabled="!revealed && !!cardAt(position.id)" :aria-label="revealed ? `${position.label}，${cardAt(position.id)?.snapshot.nameZh}，${cardAt(position.id)?.orientation === 'reversed' ? '逆位' : '正位'}，查看牌义` : `${position.label}，${cardAt(position.id) ? '已选定' : '选择一张牌'}`" @click="revealed ? $emit('detail', position.id) : $emit('select', position.id)">
        <div v-if="!cardAt(position.id)" class="t-empty-slot"><small>{{ index+1 }}</small><span>＋</span></div>
        <TarotCard v-else :class="{ 't-in-flight': flyingSlot === position.id }" :card="cardAt(position.id)!.snapshot" :orientation="cardAt(position.id)!.orientation" :revealed="revealed" />
      </button>
      <span class="t-position-label">{{ position.label }}</span>
      <small v-if="revealed" class="t-card-label">{{ cardAt(position.id)?.snapshot.nameZh }} · {{ cardAt(position.id)?.orientation === 'reversed' ? '逆位' : '正位' }}</small>
    </div>
  </div>
</template>
