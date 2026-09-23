<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { alertController, IonContent, IonIcon, IonPage, IonSpinner, toastController } from '@ionic/vue'
import { chevronForward, cloudDownloadOutline, colorPaletteOutline, mailOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { settingsRepository } from '../repositories/settingsRepository'
import {
  checkForUpdate,
  getCurrentVersion,
  installUpdate,
  type AppVersionInfo,
  type AvailableUpdate,
} from '../services/appUpdateService'

const settings = ref(settingsRepository.get())
const currentVersion = ref<AppVersionInfo>({ versionName: '...' })
const checkingUpdate = ref(false)
const installingUpdate = ref(false)

onMounted(async () => {
  try {
    currentVersion.value = await getCurrentVersion()
  } catch {
    currentVersion.value = { versionName: '未知' }
  }
})

function toggleNotification() {
  settings.value = settingsRepository.update({ notificationEnabled: !settings.value.notificationEnabled })
}

async function editEmail() {
  const alert = await alertController.create({
    header: '接收邮箱',
    message: '用于接收记录提醒，可随时修改。',
    inputs: [{ name: 'email', type: 'email', value: settings.value.notificationEmail, placeholder: 'name@example.com' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '保存',
        handler: (values) => {
          const email = String(values.email ?? '').trim()
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            void toastController.create({ message: '请输入有效的邮箱地址', duration: 1800, position: 'top' }).then((toast) => toast.present())
            return false
          }
          settings.value = settingsRepository.update({ notificationEmail: email })
          return true
        },
      },
    ],
  })
  await alert.present()
}

async function showToast(message: string) {
  const toast = await toastController.create({ message, duration: 2200, position: 'top' })
  await toast.present()
}

function readableSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return '未知大小'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return '操作失败，请稍后重试'
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"]/g, (character) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[character] ?? character)
}

function updateMessage(update: AvailableUpdate) {
  const safety = `安装包 ${readableSize(update.apkSize)}。更新采用覆盖安装，会保留本机日记和设置；请勿先卸载应用。`
  const notes = update.releaseNotes.replace(/\r/g, '').trim().slice(0, 600)
  return notes ? `${escapeHtml(safety)}<br><br>${escapeHtml(notes).replace(/\n/g, '<br>')}` : escapeHtml(safety)
}

async function startInstall(update: AvailableUpdate) {
  installingUpdate.value = true
  try {
    const result = await installUpdate(update)
    if (result.status === 'permission_required') {
      const alert = await alertController.create({
        header: '需要安装权限',
        message: '请在系统设置中允许“安装未知应用”，返回拾光笺后再次点击检查更新并安装。',
        buttons: ['知道了'],
      })
      await alert.present()
    }
  } catch (error) {
    await showToast(errorMessage(error))
  } finally {
    installingUpdate.value = false
  }
}

async function checkUpdate() {
  if (checkingUpdate.value || installingUpdate.value) return
  checkingUpdate.value = true
  try {
    const result = await checkForUpdate()
    currentVersion.value = result.current
    if (!result.updateAvailable) {
      await showToast(`当前 v${result.current.versionName} 已是最新版本`)
      return
    }

    const alert = await alertController.create({
      header: `发现新版本 v${result.latest.versionName}`,
      message: updateMessage(result.latest),
      buttons: [
        { text: '稍后', role: 'cancel' },
        { text: '下载并安装', handler: () => void startInstall(result.latest) },
      ],
    })
    await alert.present()
  } catch (error) {
    await showToast(errorMessage(error))
  } finally {
    checkingUpdate.value = false
  }
}
</script>

<template>
  <IonPage>
    <IonContent>
      <section class="screen settings-screen night-page">
        <div class="page-stars" aria-hidden="true"></div>
        <header class="topbar settings-heading"><div><p class="eyebrow">星球控制台</p><h1>设置</h1><p class="page-lead">让这片私人星空保持合适的节奏。</p></div></header>
        <div class="settings-group">
          <p class="section-label">外观</p>
          <div class="settings-card">
            <div class="setting-row setting-disabled" aria-disabled="true">
              <span class="setting-icon"><IonIcon :icon="colorPaletteOutline" /></span>
              <div><strong>外观与主题</strong><p>{{ settings.themeName }} · 沉浸夜色</p></div>
              <span class="setting-badge">准备中</span>
            </div>
          </div>
        </div>
        <div class="settings-group">
          <p class="section-label">提醒</p>
          <div class="settings-card">
            <div class="setting-row">
              <span class="setting-icon"><IonIcon :icon="mailOutline" /></span>
              <div><strong>邮件提醒</strong><p>记录完成后发送轻量提醒</p></div>
              <button class="switch" :class="{ on: settings.notificationEnabled }" :aria-label="settings.notificationEnabled ? '关闭邮件提醒' : '开启邮件提醒'" :aria-pressed="settings.notificationEnabled" @click="toggleNotification"><span></span></button>
            </div>
            <button class="setting-row setting-button" @click="editEmail">
              <span class="setting-icon muted"><span>@</span></span>
              <div><strong>接收邮箱</strong><p>{{ settings.notificationEmail || '尚未设置邮箱地址' }}</p></div>
              <IonIcon class="row-chevron" :icon="chevronForward" />
            </button>
          </div>
        </div>
        <div class="settings-group">
          <p class="section-label">数据与隐私</p>
          <div class="settings-card">
            <div class="setting-row"><span class="setting-icon"><IonIcon :icon="shieldCheckmarkOutline" /></span><div><strong>本地优先</strong><p>日记正文和图片只保存在本设备</p></div><span class="status-dot"></span></div>
          </div>
        </div>
        <div class="settings-group">
          <p class="section-label">应用更新</p>
          <div class="settings-card">
            <button class="setting-row setting-button update-row" :disabled="checkingUpdate || installingUpdate" @click="checkUpdate">
              <span class="setting-icon"><IonIcon :icon="cloudDownloadOutline" /></span>
              <div><strong>检查更新</strong><p>当前 v{{ currentVersion.versionName }} · 覆盖安装保留本机日记</p></div>
              <IonSpinner v-if="checkingUpdate || installingUpdate" class="update-spinner" name="crescent" />
              <IonIcon v-else class="row-chevron" :icon="chevronForward" />
            </button>
          </div>
          <p class="update-safety-note">更新时不要卸载应用。签名、包名或版本异常的安装包会被自动拦截。</p>
        </div>
      </section>
    </IonContent>
  </IonPage>
</template>
