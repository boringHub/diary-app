<script setup lang="ts">
import { computed, onBeforeUnmount, ref, shallowRef, watch } from 'vue'
import { onBeforeRouteLeave, useRoute } from 'vue-router'
import { alertController, IonContent, IonIcon, IonPage, toastController, useIonRouter } from '@ionic/vue'
import { chevronBack, close, imageOutline } from 'ionicons/icons'
import { useDiaryStore } from '../stores/diaryStore'
import { createDiaryPaperExitAnimation, createDiaryToStarAnimation, createEditorSaveAnimation } from '../animations'
import { MAX_DIARY_IMAGES, type DiaryImageInput, type Mood } from '../types/diary'

interface EditorImage {
  key: string
  name: string
  mimeType: string
  data?: Blob
  assetId?: string
  url: string
  width?: number
  height?: number
}

const route = useRoute()
const ionRouter = useIonRouter()
const store = useDiaryStore()
void store.ensureLoaded().catch(() => undefined)

const existing = computed(() => route.params.id ? store.get(String(route.params.id)) : undefined)
const title = ref('')
const body = ref('')
const mood = ref<Mood>('calm')
const images = shallowRef<EditorImage[]>([])
const imageInput = ref<HTMLInputElement>()
const allowLeave = ref(false)
const moods: Mood[] = ['calm', 'happy', 'sad', 'tired', 'excited']
const labels: Record<Mood, string> = { calm: '平静', happy: '开心', sad: '低落', tired: '疲惫', excited: '期待' }
const isDirty = computed(() => title.value !== (existing.value?.title ?? '') || body.value !== (existing.value?.body ?? '') || mood.value !== (existing.value?.mood ?? 'calm') || images.value.map((image) => image.assetId ?? image.key).join(',') !== (existing.value?.assets ?? []).map((asset) => asset.id).join(','))
const canSave = computed(() => Boolean(body.value.trim() || images.value.length) && isDirty.value && !store.saving)

watch([() => route.params.id, () => store.loaded], () => {
  if (route.params.id && !store.loaded) return
  title.value = existing.value?.title ?? ''
  body.value = existing.value?.body ?? ''
  mood.value = existing.value?.mood ?? 'calm'
  images.value = (existing.value?.assets ?? []).map((asset) => ({ key: asset.id, assetId: asset.id, name: asset.id, mimeType: asset.mimeType ?? 'image/*', url: asset.url ?? '' }))
  allowLeave.value = false
}, { immediate: true })

function chooseImages() {
  imageInput.value?.click()
}

async function readImageSize(file: File) {
  const url = URL.createObjectURL(file)
  try {
    const size = await new Promise<{ width?: number; height?: number }>((resolve) => {
      const image = new Image()
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight })
      image.onerror = () => resolve({})
      image.src = url
    })
    return { url, ...size }
  } catch {
    URL.revokeObjectURL(url)
    return { url: URL.createObjectURL(file) }
  }
}

async function onImagesSelected(event: Event) {
  const input = event.target as HTMLInputElement
  const selected = Array.from(input.files ?? [])
  const files = selected.filter((file) => file.type.startsWith('image/'))
  const remaining = Math.max(0, MAX_DIARY_IMAGES - images.value.length)
  for (const file of files.slice(0, remaining)) {
    const preview = await readImageSize(file)
    images.value = [...images.value, { key: crypto.randomUUID(), name: file.name, mimeType: file.type, data: file, url: preview.url, width: preview.width, height: preview.height }]
  }
  input.value = ''
  if (files.length > remaining) {
    const toast = await toastController.create({ message: `每篇日记最多放 ${MAX_DIARY_IMAGES} 张图片哦`, duration: 2000, position: 'top' })
    await toast.present()
  } else if (files.length !== selected.length) {
    const toast = await toastController.create({ message: '这里只能放图片哦', duration: 1800, position: 'top' })
    await toast.present()
  }
}

function removeImage(key: string) {
  const index = images.value.findIndex((image) => image.key === key)
  const image = images.value[index]
  if (!image) return
  if (!image.assetId) URL.revokeObjectURL(image.url)
  images.value = images.value.filter((item) => item.key !== key)
}

onBeforeUnmount(() => {
  for (const image of images.value) {
    if (!image.assetId) URL.revokeObjectURL(image.url)
  }
})

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
      header: '要先放一放吗？',
      message: '还没保存的内容会不见哦。',
      backdropDismiss: false,
      buttons: [
        { text: '继续写', role: 'cancel', handler: () => resolve(false) },
        { text: '先放弃', role: 'destructive', handler: () => resolve(true) },
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
  if (!canSave.value) return
  const isEditing = Boolean(existing.value)
  try {
    const imageInputs: DiaryImageInput[] = []
    for (const image of images.value) {
      if (image.assetId) imageInputs.push({ assetId: image.assetId })
      else if (image.data) imageInputs.push({ name: image.name, mimeType: image.mimeType, data: image.data, width: image.width, height: image.height })
    }
    const item = await store.save({ id: existing.value?.id, title: title.value.trim(), body: body.value.trim(), mood: mood.value, images: imageInputs })
    allowLeave.value = true
    if (isEditing) ionRouter.navigate(`/diary/${item.id}`, 'none', 'replace', createEditorSaveAnimation)
    else {
      sessionStorage.setItem('shiguangjian.newDiaryArrival', item.id)
      if (ionRouter.canGoBack()) ionRouter.navigate('/timeline', 'back', 'pop', createDiaryToStarAnimation)
      else ionRouter.navigate('/timeline', 'none', 'replace', createDiaryToStarAnimation)
    }
  } catch (error) {
    const message = error instanceof Error && error.message ? error.message : '没保存好，再试一次哦'
    const toast = await toastController.create({ message, duration: 2000, position: 'top' })
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
          <div class="page-title"><span class="page-title-kicker">{{ existing ? '回到这颗星' : '写下一颗新星' }}</span><strong>{{ existing ? '改改日记' : '写篇新日记' }}</strong></div>
          <button class="save-button" :disabled="!canSave" @click="save">{{ store.saving ? '保存中' : '保存' }}</button>
        </header>
        <div class="editor-paper">
          <div class="editor-paper-top"><span class="paper-mark"></span><span>一段正在长出来的记忆</span><span class="paper-date">{{ new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' }).format(Date.now()) }}</span></div>
          <input v-model="title" class="title-input" placeholder="给今天取个标题呀" maxlength="50" />
          <textarea v-model="body" class="body-input" placeholder="写下此刻的心情、看到的风景，或者一句还没说出口的话呀……" />
          <div v-if="images.length" class="image-preview-grid editor-image-preview-grid">
            <div v-for="image in images" :key="image.key" class="image-preview-item">
              <img v-if="image.url" :src="image.url" :alt="image.name" />
              <span v-else class="missing-image"><IonIcon :icon="imageOutline" />图片暂时找不到</span>
              <button type="button" aria-label="移除这张图片" @click="removeImage(image.key)"><IonIcon :icon="close" /></button>
            </div>
          </div>
          <div class="editor-footer">
            <button
              type="button"
              class="editor-image-button"
              :disabled="images.length >= MAX_DIARY_IMAGES"
              :aria-label="images.length >= MAX_DIARY_IMAGES ? `已添加 ${MAX_DIARY_IMAGES} 张图片` : '添加图片'"
              :title="images.length >= MAX_DIARY_IMAGES ? `最多 ${MAX_DIARY_IMAGES} 张图片` : '添加图片'"
              @click="chooseImages"
            >
              <IonIcon :icon="imageOutline" />
              <span v-if="images.length" class="editor-image-count">{{ images.length }}</span>
            </button>
            <span>{{ body.length }} 字</span>
            <span class="editor-local-note">只留在这台设备里</span>
          </div>
          <input ref="imageInput" class="visually-hidden" type="file" accept="image/*" multiple @change="onImagesSelected" />
        </div>
        <div class="mood-section">
          <div class="section-heading"><p class="section-label">今天是什么心情呀</p><span>挑一个最像现在的颜色~</span></div>
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
