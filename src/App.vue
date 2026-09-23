<script setup lang="ts">
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useDiaryStore } from './stores/diaryStore'
import { IonApp, IonIcon, IonRouterOutlet, useIonRouter } from '@ionic/vue'
import { add, planetOutline, settingsOutline } from 'ionicons/icons'
import { createDiaryPaperEnterAnimation, createTabSlideAnimation } from './animations'

const route = useRoute()
const ionRouter = useIonRouter()
const store = useDiaryStore()
store.ensureLoaded()

const nav = [
  { path: '/timeline', label: '星球', icon: planetOutline },
  { path: '/settings', label: '设置', icon: settingsOutline },
]

const showTabBar = computed(() => !route.path.startsWith('/diary/'))

function switchRoot(path: '/timeline' | '/settings') {
  if (route.path === path) return
  const direction = path === '/settings' ? 'forward' : 'back'

  if (path === '/timeline' && ionRouter.canGoBack()) {
    // Use Ionic's real back operation so the settings page remains mounted
    // as the leaving page for the reverse slide.
    ionRouter.back(createTabSlideAnimation(direction))
    return
  }

  // A direct load of /settings has no root-page history. Keep the visual
  // direction tied to the tab position even in that case.
  ionRouter.navigate(path, 'forward', 'push', createTabSlideAnimation(direction))
}

function createDiary() {
  ionRouter.navigate('/diary/new', 'forward', 'push', createDiaryPaperEnterAnimation)
}
</script>

<template>
  <IonApp>
    <IonRouterOutlet />
    <nav v-if="showTabBar" class="floating-nav" :class="{ 'floating-nav-night': route.path !== '/timeline' }" aria-label="主导航">
      <button class="nav-action" :class="{ active: route.path.startsWith(nav[0].path) }" @click="switchRoot('/timeline')">
        <IonIcon :icon="nav[0].icon" />
        <span>{{ nav[0].label }}</span>
      </button>
      <button class="nav-create" aria-label="新建日记" @click="createDiary">
        <IonIcon :icon="add" />
      </button>
      <button class="nav-action" :class="{ active: route.path.startsWith(nav[1].path) }" @click="switchRoot('/settings')">
        <IonIcon :icon="nav[1].icon" />
        <span>{{ nav[1].label }}</span>
      </button>
    </nav>
  </IonApp>
</template>
