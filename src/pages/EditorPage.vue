<script setup lang="ts">
import { computed, ref, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { alertController, IonContent, IonIcon, IonPage, toastController, useIonRouter } from '@ionic/vue'
import { chevronBack } from 'ionicons/icons'
import { useDiaryStore } from '../stores/diaryStore'
import { createDiaryPaperExitAnimation, createDiaryToStarAnimation, createEditorSaveAnimation } from '../animations'
import type { Mood } from '../types/diary'

const route = useRoute()
const ionRouter = useIonRouter()
const store = useDiaryStore()
void store.ensureLoaded().catch(() => undefined)

const existing = computed(() => route.params.id ? store.get(String(route.params.id)) : undefined)
const title = ref('')
const body = ref('')
const mood = ref<Mood>('calm')
const allowLeave = ref(false)
const moods: Mood[] = ['calm', 'happy', 'sad', 'tired', 'excited']
const labels: Record<Mood, string> = { calm: '平静', happy: '开心', sad: '低落', tired: '疲惫', excited: '期待' }
const isDirty = computed(() => title.value !== (existing.value?.title ?? '') || body.value !== (existing.value?.body ?? '') || mood.value !== (existing.value?.mood ?? 'calm'))

watch([() => route.params.id, () => store.loaded], () => {
  if (route.params.id && !store.loaded) return
  title.value = existing.value?.title ?? ''
  body.value = existing.value?.body ?? ''
  mood.value = existing.value?.mood ?? 'calm'
  allowLeave.value = false
}, { immediate: true })

function closeEditor() {
  allowLeave.value = true
  const target = existing.value ? `/diary/${existing.value.id}` : '/timeline'
  const animation = existing.value ? undefined : createDiaryPaperExitAnimation
  if (ionRouter.canGoBack()) ionRouter.navigate(target, 'back', 'pop', animation)
  else ionRouter.navigate(target, 'back', 'replace', animation)
}

async function confirmDiscard() {
  return new Promise<boolean>(async (resolve) => {
    const alert = await alertController.create({
      header: '放弃这次编辑？',
      message: '尚未保存的内容会丢失。',
      backdropDismiss: false,
      buttons: [
        { text: '继续编辑', role: 'cancel', handler: () => resolve(false) },
        { text: '放弃', role: 'destructive', handler: () => resolve(true) },
      ],
    })
    await alert.present()
  })
}

async function cancel() {
  if (!isDirty.value) return closeEditor()
  if (await confirmDiscard()) closeEditor()
}

onBeforeRouteLeave(async () => {
  if (allowLeave.value || !isDirty.value) return true
  const shouldLeave = await confirmDiscard()
  if (shouldLeave) allowLeave.value = true
  return shouldLeave
})

async function save() {
  if (!body.value.trim() || !isDirty.value || store.saving) return
  const isEditing = Boolean(existing.value)
  try {
    const item = await store.save({ id: existing.value?.id, title: title.value.trim(), body: body.value.trim(), mood: mood.value })
    allowLeave.value = true
    if (isEditing) ionRouter.navigate(`/diary/${item.id}`, 'none', 'replace', createEditorSaveAnimation)
    else {
      sessionStorage.setItem('shiguangjian.newDiaryArrival', item.id)
      if (ionRouter.canGoBack()) ionRouter.navigate('/timeline', 'back', 'pop', createDiaryToStarAnimation)
      else ionRouter.navigate('/timeline', 'none', 'replace', createDiaryToStarAnimation)
    }
  } catch {
    const toast = await toastController.create({ message: '保存失败，请稍后重试', duration: 2000, position: 'top' })
    await toast.present()
  }
}
</script>

<template>
  <IonPage>
    <IonContent>
      <section class="screen editor-screen night-page">
        <div class="page-stars" aria-hidden="true"></div>
        <header class="subbar page-subbar">
          <button class="icon-button" aria-label="返回" @click="cancel"><IonIcon :icon="chevronBack" /></button>
          <div class="page-title"><span class="page-title-kicker">{{ existing ? '回到这颗星' : '写下一颗新星' }}</span><strong>{{ existing ? '编辑日记' : '新建日记' }}</strong></div>
          <button class="save-button" :disabled="!body.trim() || !isDirty || store.saving" @click="save">{{ store.saving ? '保存中' : '保存' }}</button>
        </header>
        <div class="editor-paper">
          <div class="editor-paper-top"><span class="paper-mark"></span><span>一段正在成形的记忆</span><span class="paper-date">{{ new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(Date.now()) }}</span></div>
          <input v-model="title" class="title-input" placeholder="给今天取个标题" maxlength="50" />
          <textarea v-model="body" class="body-input" placeholder="写下此刻的心情、看到的风景，或者一句还没说出口的话……" />
          <div class="editor-footer"><span>{{ body.length }} 字</span><span>仅保存在本设备</span></div>
        </div>
        <div class="mood-section">
          <div class="section-heading"><p class="section-label">今天的心情</p><span>选择一颗属于此刻的颜色</span></div>
          <div class="mood-picker">
            <button v-for="item in moods" :key="item" :class="{ selected: mood === item }" :aria-pressed="mood === item" @click="mood = item">
              <span class="mood-dot" :class="item"></span>{{ labels[item] }}
            </button>
          </div>
        </div>
      </section>
    </IonContent>
  </IonPage>
</template>
