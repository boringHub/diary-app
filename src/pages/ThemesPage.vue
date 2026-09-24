<script setup lang="ts">
import { ref } from 'vue'
import { IonContent, IonIcon, IonPage, toastController, useIonRouter } from '@ionic/vue'
import { chevronBack, chevronForward, cloudUploadOutline } from 'ionicons/icons'
import { listThemeManifests, selectTheme } from '../services/themeService'
import { installThemePackage } from '../services/themePackageService'
import { settingsRepository } from '../repositories/settingsRepository'

const current = ref(settingsRepository.get())
const themes = ref(listThemeManifests())
const ionRouter = useIonRouter()
const manifestInput = ref<HTMLInputElement>()
const importing = ref(false)

function goBack() {
  if (ionRouter.canGoBack()) ionRouter.back()
  else ionRouter.navigate('/settings', 'back', 'replace')
}

async function chooseTheme(theme: (typeof themes.value)[number]) {
  selectTheme(theme.id, theme.version)
  current.value = settingsRepository.get()
  const toast = await toastController.create({ message: `已切换为 ${theme.name}，整个界面会立即更新`, duration: 1800, position: 'top' })
  await toast.present()
}

function chooseManifest() {
  manifestInput.value?.click()
}

async function importManifest(event: Event) {
  const input = event.target as HTMLInputElement
  const file = input.files?.[0]
  input.value = ''
  if (!file) return
  importing.value = true
  try {
    const manifest = await installThemePackage(file)
    themes.value = listThemeManifests()
    const toast = await toastController.create({ message: `${manifest.name} ${manifest.version} 已收好啦`, duration: 2200, position: 'top' })
    await toast.present()
  } catch (error) {
    const message = error instanceof Error ? error.message : '主题清单格式不对哦'
    const toast = await toastController.create({ message, duration: 2200, position: 'top' })
    await toast.present()
  } finally {
    importing.value = false
  }
}
</script>
<template>
  <IonPage><IonContent><section class="screen themes-screen night-page"><div class="page-stars" aria-hidden="true"></div><header class="subbar page-subbar"><button class="icon-button" aria-label="返回设置" @click="goBack"><IonIcon :icon="chevronBack" /></button><div class="page-title"><span class="page-title-kicker">星球小管家</span><strong>全局界面主题</strong></div><span class="subbar-spacer" aria-hidden="true"></span></header><p class="page-description">选择后会立即改变整个 App 的颜色和界面样式。</p><div class="theme-list"><button v-for="theme in themes" :key="`${theme.id}-${theme.version}`" class="theme-card" :class="{ active: current.themeId === theme.id && current.themeVersion === theme.version }" @click="chooseTheme(theme)"><span class="theme-preview" :style="{ backgroundColor: theme.colors.background }"><span class="theme-preview-board" :style="{ backgroundColor: theme.colors.surface, borderColor: theme.colors.primary, color: theme.colors.text }"><i :style="{ backgroundColor: theme.colors.primary }"></i>拾光<br />笺</span></span><span class="theme-info"><strong>{{ theme.name }}<em v-if="current.themeId === theme.id && current.themeVersion === theme.version">现在用着</em></strong><small>{{ theme.description }}</small></span><IonIcon class="theme-arrow" :icon="chevronForward" /></button><button class="theme-import-button" :disabled="importing" @click="chooseManifest"><span class="theme-import-icon"><IonIcon :icon="cloudUploadOutline" /></span><span><strong>{{ importing ? '正在收好主题~' : '导入界面主题' }}</strong><small>选择 ZIP 包，导入一套全局界面配色</small></span><IonIcon class="theme-arrow" :icon="chevronForward" /></button><input ref="manifestInput" class="visually-hidden" type="file" accept="application/zip,.zip" @change="importManifest" /></div></section></IonContent></IonPage>
</template>
