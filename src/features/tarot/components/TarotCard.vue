<script setup lang="ts">
import { ref } from 'vue'
import type { CardDefinition, Orientation } from '../domain/types'
defineProps<{ card?: CardDefinition; orientation?: Orientation; revealed?: boolean; number?: number }>()
const failed = ref(false)
</script>
<template>
  <div class="t-card" :class="{ 'is-face': revealed, 'is-reversed': orientation === 'reversed' }">
    <template v-if="revealed && card">
      <img v-if="!failed" :src="card.imagePath" alt="" decoding="async" @error="failed = true" />
      <div v-else class="t-card-fallback"><span>✦</span><strong>{{ card.nameZh }}</strong><small>卡面暂时无法显示</small></div>
    </template>
    <template v-else>
      <span v-if="number" class="t-card-number">{{ number }}</span>
      <svg viewBox="0 0 100 150" aria-hidden="true"><g fill="none" stroke="currentColor" stroke-width=".65"><rect x="6" y="6" width="88" height="138" rx="3"/><rect x="10" y="10" width="80" height="130" rx="2"/><circle cx="50" cy="75" r="30"/><ellipse cx="50" cy="75" rx="19" ry="45"/><path d="M50 18v114M16 75h68M25 32l50 86M75 32l-50 86"/></g><path fill="currentColor" d="m50 53 5 17 17 5-17 5-5 17-5-17-17-5 17-5z"/><g fill="currentColor"><circle cx="22" cy="23" r="1.5"/><circle cx="78" cy="127" r="1.5"/><circle cx="78" cy="23" r="1"/><circle cx="22" cy="127" r="1"/></g></svg>
    </template>
  </div>
</template>
