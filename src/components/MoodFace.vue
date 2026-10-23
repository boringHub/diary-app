<script setup lang="ts">
import { computed } from 'vue'
import { moodColors, moodLabels, type Mood } from '../types/diary'

const props = withDefaults(defineProps<{ mood: Mood; decorative?: boolean }>(), { decorative: false })

const inks: Record<Mood, string> = {
  calm: '#285447',
  happy: '#775120',
  sad: '#355677',
  tired: '#57476f',
  excited: '#854831',
  loved: '#803d57',
  playful: '#695226',
  proud: '#73512d',
  relaxed: '#33594d',
  touched: '#7b4b3d',
  sleepy: '#454f7e',
  lonely: '#3a576e',
  angry: '#7e3535',
  anxious: '#754870',
  confused: '#525173',
}
const faceStyle = computed(() => ({ '--face-color': moodColors[props.mood], '--face-ink': inks[props.mood] }))
</script>

<template>
  <svg
    class="mood-face"
    :class="`mood-face--${mood}`"
    :style="faceStyle"
    viewBox="0 0 64 64"
    :role="decorative ? undefined : 'img'"
    :aria-label="decorative ? undefined : moodLabels[mood]"
    :aria-hidden="decorative ? true : undefined"
    focusable="false"
  >
    <circle class="mood-face-disc" cx="32" cy="33" r="26" />
    <path class="mood-face-shine" d="M14 25A20 20 0 0 1 34 13" />
    <g class="mood-face-cheeks">
      <ellipse cx="16.5" cy="38" rx="4" ry="2.5" />
      <ellipse cx="47.5" cy="38" rx="4" ry="2.5" />
    </g>
    <g class="mood-face-features">
      <template v-if="mood === 'calm'">
        <path d="M18 29q4 3 8 0m12 0q4 3 8 0" />
        <path d="M25 40q7 6 14 0" />
      </template>
      <template v-else-if="mood === 'happy'">
        <path d="M18 29q4-6 8 0m12 0q4-6 8 0" />
        <path class="mood-face-mouth" d="M21 37q11 3 22 0c-1 8-6 12-11 12s-10-4-11-12Z" />
      </template>
      <template v-else-if="mood === 'sad'">
        <path d="m18 24 7-3m14 0 7 3" />
        <ellipse class="mood-face-eye" cx="23" cy="31" rx="1.7" ry="2.3" />
        <ellipse class="mood-face-eye" cx="41" cy="31" rx="1.7" ry="2.3" />
        <path d="M25 44q7-7 14 0" />
      </template>
      <template v-else-if="mood === 'tired'">
        <path d="M18 24q4 2 8 0m12 0q4 2 8 0M18 31q4 4 8 0m12 0q4 4 8 0" />
        <path d="M27 43q5-2 10 0" />
      </template>
      <template v-else-if="mood === 'excited'">
        <path class="mood-face-eye" d="m22 22 1.8 4.2L28 28l-4.2 1.8L22 34l-1.8-4.2L16 28l4.2-1.8Zm20 0 1.8 4.2L48 28l-4.2 1.8L42 34l-1.8-4.2L36 28l4.2-1.8Z" />
        <path class="mood-face-mouth" d="M23 39q9 2 18 0c-1 6-5 10-9 10s-8-4-9-10Z" />
      </template>
      <template v-else-if="mood === 'loved'">
        <path class="mood-face-eye" d="M22 33s-8-5-8-9c0-5 6-6 8-2 2-4 8-3 8 2 0 4-8 9-8 9Zm20 0s-8-5-8-9c0-5 6-6 8-2 2-4 8-3 8 2 0 4-8 9-8 9Z" />
        <path d="M25 41q7 9 14 0" />
      </template>
      <template v-else-if="mood === 'playful'">
        <ellipse class="mood-face-eye" cx="22" cy="28" rx="1.8" ry="2.5" />
        <path d="m38 25 7 4-7 2M23 39q10 8 20-1" />
        <path class="mood-face-mouth" d="m32 43 8-3v5c0 6-8 6-8 0Z" />
        <path d="M36 43v3" />
      </template>
      <template v-else-if="mood === 'proud'">
        <path class="mood-face-eye" d="M13 25h16l-2 8c-3 4-10 3-12-1Zm22 0h16l-2 7c-2 4-9 5-12 1Z" />
        <path d="M29 27h6M25 43q9 5 16-3" />
      </template>
      <template v-else-if="mood === 'relaxed'">
        <path d="M18 29q4-4 8 0m12 0q4-4 8 0M26 40q6 5 12 0" />
      </template>
      <template v-else-if="mood === 'touched'">
        <path d="M18 29q4-5 8 0m12 0q4-5 8 0M26 41q6 6 12 0" />
        <path class="mood-face-tear" d="M19 33s-3 5-3 7a3 3 0 0 0 6 0c0-2-3-7-3-7Z" />
      </template>
      <template v-else-if="mood === 'sleepy'">
        <path d="M18 31q4 3 8 0m12 0q4 3 8 0m-2-14h6l-6 6h6" />
        <ellipse class="mood-face-mouth" cx="32" cy="43" rx="3.3" ry="4" />
      </template>
      <template v-else-if="mood === 'lonely'">
        <ellipse class="mood-face-eye" cx="23" cy="32" rx="1.7" ry="2.3" />
        <ellipse class="mood-face-eye" cx="41" cy="32" rx="1.7" ry="2.3" />
        <path d="M28 43h8" />
      </template>
      <template v-else-if="mood === 'angry'">
        <path d="m18 23 8 5m12 0 8-5" />
        <circle class="mood-face-eye" cx="23" cy="32" r="1.8" />
        <circle class="mood-face-eye" cx="41" cy="32" r="1.8" />
        <path d="m23 45 3-6 4 5 4-5 4 5 3-5" />
      </template>
      <template v-else-if="mood === 'anxious'">
        <path d="m18 24 7-3m14 0 7 3" />
        <ellipse class="mood-face-eye" cx="23" cy="31" rx="1.7" ry="2.3" />
        <ellipse class="mood-face-eye" cx="41" cy="31" rx="1.7" ry="2.3" />
        <path d="M22 43q3-6 6 0t6 0 6 0" />
      </template>
      <template v-else-if="mood === 'confused'">
        <path d="m18 23 8 2m12-3 8-2" />
        <circle class="mood-face-eye" cx="23" cy="31" r="1.9" />
        <ellipse class="mood-face-eye" cx="41" cy="29" rx="1.8" ry="2.6" />
        <path d="m26 43 12-3" />
      </template>
    </g>
  </svg>
</template>

<style scoped>
.mood-face { display: inline-block; flex: 0 0 auto; width: var(--mood-face-size, 40px); height: var(--mood-face-size, 40px); overflow: visible; vertical-align: middle; }
.mood-face-disc { fill: var(--face-color); stroke: var(--face-ink); stroke-opacity: .24; stroke-width: 1.2; }
.mood-face-shine { fill: none; stroke: #fff; stroke-opacity: .38; stroke-width: 3; stroke-linecap: round; }
.mood-face-cheeks { fill: var(--face-ink); opacity: .13; }
.mood-face-features { fill: none; stroke: var(--face-ink); stroke-width: 2.3; stroke-linecap: round; stroke-linejoin: round; }
.mood-face-eye { fill: var(--face-ink); stroke: none; }
.mood-face-mouth { fill: #fff; fill-opacity: .72; }
.mood-face-tear { fill: #fff; fill-opacity: .8; stroke-width: 1.2; }
</style>
