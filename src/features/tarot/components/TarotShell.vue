<script setup lang="ts">
import { IonPage, IonContent, useIonRouter } from '@ionic/vue'
import '../tarot.css'
const props = withDefaults(defineProps<{ title?: string; backPath?: string; backLabel?: string; busy?: boolean; onBack?: () => void }>(), { title: '星语', backPath: '/tarot', backLabel: '返回' })
const ionRouter = useIonRouter()
function back() {
  if (props.busy) return
  if (props.onBack) return props.onBack()
  if (ionRouter.canGoBack()) ionRouter.back()
  else ionRouter.navigate(props.backPath,'back','replace')
}
</script>
<template>
  <IonPage class="tarot-page">
    <IonContent :scroll-y="false">
      <div class="tarot-shell" :aria-busy="busy || undefined">
        <header class="tarot-topbar">
          <button class="t-text" :disabled="busy" @click="back">‹ {{ backLabel }}</button>
          <span class="t-brand">{{ title }}</span>
          <div class="t-top-actions"><slot name="header"><button class="t-text" :disabled="busy" @click="ionRouter.navigate('/tarot/history','forward','push')">历史</button></slot></div>
        </header>
        <main class="tarot-main"><slot /></main>
        <slot name="footer" />
      </div>
    </IonContent>
  </IonPage>
</template>
