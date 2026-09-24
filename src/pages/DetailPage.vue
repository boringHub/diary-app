<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { alertController, IonContent, IonIcon, IonPage, useIonRouter } from '@ionic/vue'
import { chevronBack, createOutline, heart, heartOutline } from 'ionicons/icons'
import { useDiaryStore } from '../stores/diaryStore'
import { moodLabels } from '../types/diary'
import { createStarReturnAnimation } from '../animations'
const route = useRoute(); const ionRouter = useIonRouter(); const store = useDiaryStore()
void store.ensureLoaded().catch(() => undefined)
const diary = computed(() => store.get(String(route.params.id)))
function backToTimeline() {
  if (ionRouter.canGoBack()) ionRouter.navigate('/timeline', 'back', 'pop', createStarReturnAnimation)
  else ionRouter.navigate('/timeline', 'none', 'replace')
}
async function remove() {
  if (!diary.value) return
  const id = diary.value.id
  const alert = await alertController.create({
    header: '真的要删掉这篇吗？',
    message: '删掉后，它就会从星球上离开啦。',
    buttons: [
      { text: '取消', role: 'cancel' },
      { text: '删掉', role: 'destructive', handler: async () => { await store.remove(id); ionRouter.navigate('/timeline', 'none', 'replace') } },
    ],
  })
  await alert.present()
}
</script>

<template>
  <IonPage>
    <IonContent>
      <section v-if="diary" class="screen detail-screen night-page">
        <div class="page-stars" aria-hidden="true"></div>
        <header class="subbar page-subbar">
          <button class="icon-button" aria-label="返回时间线" @click="backToTimeline"><IonIcon :icon="chevronBack" /></button>
          <div class="page-title"><span class="page-title-kicker">记忆星球 · 这颗星</span><strong>{{ moodLabels[diary.mood] }}</strong></div>
          <div class="actions"><button class="icon-button" :class="{ 'favorite-active': diary.isFavorite }" :aria-label="diary.isFavorite ? '取消收藏' : '收藏'" @click="void store.toggleFavorite(diary.id)"><IonIcon :icon="diary.isFavorite ? heart : heartOutline" /></button><button class="icon-button" aria-label="编辑日记" @click="ionRouter.navigate(`/diary/${diary.id}/edit`, 'forward', 'push')"><IonIcon :icon="createOutline" /></button></div>
        </header>
        <article class="detail-paper">
          <div class="detail-orbit"><span class="orbit-dot"></span><span>{{ moodLabels[diary.mood] }} · {{ diary.isFavorite ? '已收藏' : '一段日常' }}</span></div>
          <p class="detail-date">{{ new Intl.DateTimeFormat('zh-CN', { dateStyle: 'full' }).format(diary.updatedAt) }}</p>
          <h1>{{ diary.title || '还没取名字' }}</h1>
          <div class="detail-rule"></div>
          <p class="detail-body">{{ diary.body }}</p>
        </article>
        <button class="delete-button" @click="remove">删掉这篇日记</button>
      </section>
      <section v-else-if="store.loading || !store.loaded" class="empty-state"><h2>正在把这颗星找回来…</h2></section>
      <section v-else class="empty-state"><h2>这颗星暂时找不到啦</h2><button class="primary-button" @click="ionRouter.navigate('/timeline', 'none', 'replace')">回星球</button></section>
    </IonContent>
  </IonPage>
</template>
