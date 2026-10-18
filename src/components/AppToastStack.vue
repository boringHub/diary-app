<script setup lang="ts">
import { close } from 'ionicons/icons'
import { IonIcon } from '@ionic/vue'
import { appToasts, dismissAppToast } from '../services/appToast'
</script>

<template>
  <div class="app-toast-stack" aria-live="polite" aria-atomic="false">
    <div v-for="toast in appToasts" :key="toast.id" class="app-toast" role="status">
      <span>{{ toast.message }}</span>
      <button type="button" aria-label="关闭提示" title="关闭提示" @click="dismissAppToast(toast.id)">
        <IonIcon :icon="close" />
      </button>
    </div>
  </div>
</template>

<style scoped>
.app-toast-stack {
  position: fixed;
  z-index: 3000;
  top: calc(12px + var(--app-safe-top));
  left: 50%;
  display: flex;
  width: min(calc(100% - 24px - var(--app-safe-left) - var(--app-safe-right)), 420px);
  max-height: min(50dvh, 420px);
  flex-direction: column;
  gap: 8px;
  overflow-y: auto;
  transform: translateX(-50%);
  pointer-events: none;
}

.app-toast {
  display: flex;
  flex: 0 0 auto;
  align-items: flex-start;
  gap: 10px;
  width: 100%;
  padding: 11px 12px 11px 14px;
  border: 1px solid color-mix(in srgb, var(--app-theme-primary, #72b8aa) 30%, transparent);
  border-radius: 12px;
  background: color-mix(in srgb, var(--app-theme-surface, #102b3a) 94%, transparent);
  box-shadow: 0 10px 28px color-mix(in srgb, var(--app-theme-background, #07131f) 48%, transparent), inset 0 1px color-mix(in srgb, white 14%, transparent);
  color: var(--app-theme-text, #eaf8f3);
  font-size: 13px;
  line-height: 1.45;
  pointer-events: auto;
}

.app-toast span {
  min-width: 0;
  flex: 1;
  overflow-wrap: anywhere;
}

.app-toast button {
  display: grid;
  flex: 0 0 auto;
  place-items: center;
  width: 24px;
  height: 24px;
  margin: -2px -3px 0 0;
  padding: 0;
  border: 0;
  border-radius: 50%;
  background: transparent;
  color: color-mix(in srgb, var(--app-theme-text, #eaf8f3) 62%, transparent);
  font-size: 17px;
}

.app-toast button:active {
  transform: scale(.9);
}
</style>
