<script setup lang="ts">
import { ref } from 'vue'
import { IonIcon, IonModal } from '@ionic/vue'
import { closeOutline } from 'ionicons/icons'
import { moodColors, moodLabels, moodOptions, type Mood } from '../types/diary'
import MoodFace from './MoodFace.vue'

const props = defineProps<{ open: boolean; modelValue: Mood | null }>()
const emit = defineEmits<{ 'update:modelValue': [mood: Mood]; close: [] }>()
const optionButtons = ref<HTMLButtonElement[]>([])

function choose(mood: Mood) {
  emit('update:modelValue', mood)
  emit('close')
}

function focusSelection() {
  const index = props.modelValue ? moodOptions.indexOf(props.modelValue) : 0
  optionButtons.value[index]?.focus({ preventScroll: true })
}

function moveFocus(event: KeyboardEvent, index: number) {
  const offsets: Record<string, number> = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -5, ArrowDown: 5 }
  let next = index
  if (event.key === 'Home') next = 0
  else if (event.key === 'End') next = moodOptions.length - 1
  else if (event.key in offsets) next = (index + offsets[event.key]! + moodOptions.length) % moodOptions.length
  else return
  event.preventDefault()
  optionButtons.value[next]?.focus()
}
</script>

<template>
  <IonModal class="mood-sheet" :is-open="open" aria-labelledby="mood-dialog-title" @did-dismiss="emit('close')" @did-present="focusSelection">
    <section class="mood-dialog">
      <span class="mood-sheet-handle" aria-hidden="true"></span>
      <header class="mood-dialog-header">
        <div><h2 id="mood-dialog-title">此刻，是什么心情？</h2><p>每一种心情，都值得被记住</p></div>
        <button type="button" class="mood-dialog-close" aria-label="关闭心情选择" @click="emit('close')"><IonIcon :icon="closeOutline" /></button>
      </header>
      <div class="mood-picker" role="group" aria-label="选择日记心情">
        <button v-for="(item, index) in moodOptions" :key="item" ref="optionButtons" type="button" :class="{ selected: modelValue === item }" :style="{ '--mood-color': moodColors[item] }" :aria-label="moodLabels[item]" :aria-pressed="modelValue === item" @click="choose(item)" @keydown="moveFocus($event, index)">
          <span class="mood-option-face"><MoodFace :mood="item" decorative /><span class="mood-selected-mark" aria-hidden="true"></span></span>
          <span class="mood-option-label">{{ moodLabels[item] }}</span>
        </button>
      </div>
    </section>
  </IonModal>
</template>

<style>
ion-modal.mood-sheet { --width: min(100%, 480px); --height: auto; --max-height: 90%; --border-radius: 28px 28px 0 0; --background: var(--app-theme-surface, #102b3a); --backdrop-opacity: .48; align-items: flex-end; }
.mood-dialog { width: 100%; max-height: 85vh; max-height: 85dvh; overflow-y: auto; padding: 10px max(18px, var(--app-safe-right)) calc(24px + var(--app-safe-bottom)) max(18px, var(--app-safe-left)); background: var(--app-theme-surface, #102b3a); color: var(--app-theme-text, #effaf6); }
.mood-sheet-handle { display: block; width: 32px; height: 4px; margin: 0 auto 22px; border-radius: 4px; background: color-mix(in srgb, var(--app-theme-text, #effaf6) 20%, transparent); }
.mood-dialog-header { display: flex; align-items: center; justify-content: space-between; gap: 12px; margin-bottom: 20px; }
.mood-dialog-header h2 { margin: 0; font-size: 20px; line-height: 1.5; font-weight: 650; letter-spacing: .02em; }
.mood-dialog-header p { margin: 6px 0 0; color: color-mix(in srgb, var(--app-theme-text, #effaf6) 55%, transparent); font-size: 12px; }
.mood-dialog-close { display: grid; place-items: center; flex: 0 0 44px; width: 44px; height: 44px; padding: 0; border: 0; border-radius: 50%; background: color-mix(in srgb, var(--app-theme-text, #effaf6) 6%, transparent); color: inherit; font-size: 22px; }
.mood-dialog .mood-picker { max-width: none; margin: 0; row-gap: 10px; }
.mood-dialog .mood-picker button { min-height: 92px; padding-top: 10px; padding-bottom: 8px; }
.mood-dialog .mood-option-face { --mood-face-size: clamp(44px, 13vw, 54px); }
.mood-dialog .mood-selected-mark { border-color: var(--app-theme-surface, #102b3a); }
.mood-dialog-close:focus-visible { outline: 2px solid var(--app-theme-primary, #81d3bd); outline-offset: 3px; }
@media (max-height: 560px) { .mood-dialog { max-height: 90dvh; }.mood-sheet-handle { margin-bottom: 12px; }.mood-dialog-header { margin-bottom: 12px; } }
</style>
