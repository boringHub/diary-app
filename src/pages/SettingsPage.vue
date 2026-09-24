<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { alertController, IonContent, IonIcon, IonPage, IonSpinner, toastController } from '@ionic/vue'
import { checkmarkCircleOutline, chevronForward, cloudDownloadOutline, closeOutline, colorPaletteOutline, mailOutline, shieldCheckmarkOutline, sparklesOutline } from 'ionicons/icons'
import { diaryRepository } from '../repositories/diaryRepository'
import { settingsRepository } from '../repositories/settingsRepository'
import {
  checkForUpdate,
  formatReleaseNoteLines,
  getCurrentVersion,
  installUpdate,
  type AppVersionInfo,
  type AvailableUpdate,
} from '../services/appUpdateService'

const settings = ref(settingsRepository.get())
const currentVersion = ref<AppVersionInfo>({ versionName: '...' })
const checkingUpdate = ref(false)
const installingUpdate = ref(false)
const pendingUpdate = ref<AvailableUpdate | null>(null)

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
    header: '收件邮箱',
    message: '想接收日记提醒的话，写在这里就好啦~',
    inputs: [{ name: 'email', type: 'email', value: settings.value.notificationEmail, placeholder: 'name@example.com' }],
    buttons: [
      { text: '取消', role: 'cancel' },
      {
        text: '收好',
        handler: (values) => {
          const email = String(values.email ?? '').trim()
          if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
            void toastController.create({ message: '这个邮箱地址好像不太对哦，再检查一下吧', duration: 1800, position: 'top' }).then((toast) => toast.present())
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
  if (!Number.isFinite(bytes) || bytes <= 0) return '大小未知'
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`
}

function errorMessage(error: unknown) {
  if (error instanceof Error && error.message) return error.message
  if (typeof error === 'object' && error && 'message' in error) return String(error.message)
  return '这次没成功，再试一次哦'
}

function closeUpdateDialog() {
  if (!installingUpdate.value) pendingUpdate.value = null
}

async function startInstall(update: AvailableUpdate) {
  installingUpdate.value = true
  try {
    const result = await installUpdate(update)
    if (result.status === 'permission_required') {
      const alert = await alertController.create({
        header: '需要一点安装权限',
        message: '请在系统设置里允许“安装未知应用”，再回到拾光笺点一次更新就好啦。',
        buttons: ['好哒'],
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
      await showToast(`当前 v${result.current.versionName} 已经是最新版本啦~`)
      return
    }

    pendingUpdate.value = result.latest
  } catch (error) {
    await showToast(errorMessage(error))
  } finally {
    checkingUpdate.value = false
  }
}

async function installPendingUpdate() {
  const update = pendingUpdate.value
  if (!update || installingUpdate.value) return
  await startInstall(update)
  pendingUpdate.value = null
}

async function verifyUpgrade() {
  try {
    const [version, diaries] = await Promise.all([getCurrentVersion(), diaryRepository.list()])
    currentVersion.value = version
    const alert = await alertController.create({
      header: '升级验证通过啦',
      message: `当前版本 v${version.versionName}，日记都能正常读到哦，一共有 ${diaries.length} 篇。`,
      buttons: ['好哒'],
    })
    await alert.present()
  } catch (error) {
    await showToast(`升级验证没通过：${errorMessage(error)}`)
  }
}
</script>

<template>
  <IonPage>
    <IonContent>
      <section class="screen settings-screen night-page">
        <div class="page-stars" aria-hidden="true"></div>
        <header class="topbar settings-heading"><div><p class="eyebrow">星球小管家</p><h1>小设置</h1><p class="page-lead">把这片私人星空调成你喜欢的样子~</p></div></header>
        <div class="settings-group">
          <p class="section-label">看起来</p>
          <div class="settings-card">
            <div class="setting-row setting-disabled" aria-disabled="true">
              <span class="setting-icon"><IonIcon :icon="colorPaletteOutline" /></span>
              <div><strong>主题和样子</strong><p>{{ settings.themeName }} · 沉浸夜色</p></div>
              <span class="setting-badge">还在准备中</span>
            </div>
          </div>
        </div>
        <div class="settings-group">
          <p class="section-label">小提醒</p>
          <div class="settings-card">
            <div class="setting-row">
              <span class="setting-icon"><IonIcon :icon="mailOutline" /></span>
              <div><strong>邮件小提醒</strong><p>记下日记后，发一封轻轻的提醒</p></div>
              <button class="switch" :class="{ on: settings.notificationEnabled }" :aria-label="settings.notificationEnabled ? '关闭邮件提醒' : '开启邮件提醒'" :aria-pressed="settings.notificationEnabled" @click="toggleNotification"><span></span></button>
            </div>
            <button class="setting-row setting-button" @click="editEmail">
              <span class="setting-icon muted"><span>@</span></span>
              <div><strong>收件邮箱</strong><p>{{ settings.notificationEmail || '还没有设置邮箱哦' }}</p></div>
              <IonIcon class="row-chevron" :icon="chevronForward" />
            </button>
          </div>
        </div>
        <div class="settings-group">
          <p class="section-label">放心收好</p>
          <div class="settings-card">
            <div class="setting-row"><span class="setting-icon"><IonIcon :icon="shieldCheckmarkOutline" /></span><div><strong>只放在本地</strong><p>日记正文和图片只留在这台设备里</p></div><span class="status-dot"></span></div>
          </div>
        </div>
        <div class="settings-group">
          <p class="section-label">应用更新</p>
          <div class="settings-card">
            <button class="setting-row setting-button update-row" :disabled="checkingUpdate || installingUpdate" @click="checkUpdate">
              <span class="setting-icon"><IonIcon :icon="cloudDownloadOutline" /></span>
              <div><strong>看看有没有新版本</strong><p>当前 v{{ currentVersion.versionName }} · 会保留本机日记</p></div>
              <IonSpinner v-if="checkingUpdate || installingUpdate" class="update-spinner" name="crescent" />
              <IonIcon v-else class="row-chevron" :icon="chevronForward" />
            </button>
            <button class="setting-row setting-button update-row" @click="verifyUpgrade">
              <span class="setting-icon"><IonIcon :icon="checkmarkCircleOutline" /></span>
              <div><strong>确认升级没问题</strong><p>看看新版本能不能正常读到日记</p></div>
              <IonIcon class="row-chevron" :icon="chevronForward" />
            </button>
          </div>
          <p class="update-safety-note">更新时别卸载应用哦。签名、包名或版本不对的安装包会被自动拦住。</p>
        </div>
      </section>

      <Teleport to="body">
        <div v-if="pendingUpdate" class="update-dialog-backdrop" role="presentation" @click.self="closeUpdateDialog">
          <section class="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
          <div class="update-dialog-topline">
            <span class="update-dialog-kicker"><IonIcon :icon="sparklesOutline" /> 拾光笺 · 有新版本啦</span>
            <button class="update-dialog-close" aria-label="关闭更新弹窗" @click="closeUpdateDialog"><IonIcon :icon="closeOutline" /></button>
          </div>
          <div class="update-dialog-icon" aria-hidden="true"><IonIcon :icon="cloudDownloadOutline" /></div>
          <p class="update-dialog-label">有一颗新的星星到啦</p>
          <h2 id="update-dialog-title">发现新版本 <span>v{{ pendingUpdate.versionName }}</span></h2>
          <div class="update-dialog-meta">
            <span><IonIcon :icon="cloudDownloadOutline" /> {{ readableSize(pendingUpdate.apkSize) }}</span>
            <span><IonIcon :icon="shieldCheckmarkOutline" /> 安心覆盖安装</span>
          </div>

          <div class="update-dialog-notes">
            <div class="update-dialog-section-title"><span>这次更新了什么</span><i></i></div>
            <p v-if="formatReleaseNoteLines(pendingUpdate.releaseNotes).length === 0" class="update-dialog-empty">这次更新带来了更细腻的体验~</p>
            <ul v-else>
              <li v-for="(line, index) in formatReleaseNoteLines(pendingUpdate.releaseNotes)" :key="`${index}-${line}`">{{ line }}</li>
            </ul>
          </div>

          <div class="update-dialog-safety">
            <IonIcon :icon="shieldCheckmarkOutline" />
            <span>会保留本机日记和设置，先别卸载应用哦。</span>
          </div>
          <div class="update-dialog-actions">
            <button class="update-dialog-later" :disabled="installingUpdate" @click="closeUpdateDialog">晚点再说</button>
            <button class="update-dialog-install" :disabled="installingUpdate" @click="installPendingUpdate">
              <IonSpinner v-if="installingUpdate" name="crescent" />
              <IonIcon v-else :icon="cloudDownloadOutline" />
              {{ installingUpdate ? '准备安装中' : '下载并安装' }}
            </button>
          </div>
          </section>
        </div>
      </Teleport>
    </IonContent>
  </IonPage>
</template>
