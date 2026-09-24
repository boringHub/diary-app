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

function closeUpdateDialog() {
  if (!installingUpdate.value) pendingUpdate.value = null
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
      header: '升级验证通过',
      message: `当前版本 v${version.versionName}，本机数据库可正常读取，现有日记 ${diaries.length} 篇。`,
      buttons: ['知道了'],
    })
    await alert.present()
  } catch (error) {
    await showToast(`升级验证失败：${errorMessage(error)}`)
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
            <button class="setting-row setting-button update-row" @click="verifyUpgrade">
              <span class="setting-icon"><IonIcon :icon="checkmarkCircleOutline" /></span>
              <div><strong>升级验证</strong><p>确认新版本运行并读取本机日记</p></div>
              <IonIcon class="row-chevron" :icon="chevronForward" />
            </button>
          </div>
          <p class="update-safety-note">更新时不要卸载应用。签名、包名或版本异常的安装包会被自动拦截。</p>
        </div>
      </section>

      <Teleport to="body">
        <div v-if="pendingUpdate" class="update-dialog-backdrop" role="presentation" @click.self="closeUpdateDialog">
          <section class="update-dialog" role="dialog" aria-modal="true" aria-labelledby="update-dialog-title">
          <div class="update-dialog-topline">
            <span class="update-dialog-kicker"><IonIcon :icon="sparklesOutline" /> 拾光笺 · 新版本</span>
            <button class="update-dialog-close" aria-label="关闭更新弹窗" @click="closeUpdateDialog"><IonIcon :icon="closeOutline" /></button>
          </div>
          <div class="update-dialog-icon" aria-hidden="true"><IonIcon :icon="cloudDownloadOutline" /></div>
          <p class="update-dialog-label">一颗新的星星抵达了</p>
          <h2 id="update-dialog-title">发现新版本 <span>v{{ pendingUpdate.versionName }}</span></h2>
          <div class="update-dialog-meta">
            <span><IonIcon :icon="cloudDownloadOutline" /> {{ readableSize(pendingUpdate.apkSize) }}</span>
            <span><IonIcon :icon="shieldCheckmarkOutline" /> 安全覆盖安装</span>
          </div>

          <div class="update-dialog-notes">
            <div class="update-dialog-section-title"><span>本次更新</span><i></i></div>
            <p v-if="formatReleaseNoteLines(pendingUpdate.releaseNotes).length === 0" class="update-dialog-empty">这次更新带来了更细腻的体验。</p>
            <ul v-else>
              <li v-for="(line, index) in formatReleaseNoteLines(pendingUpdate.releaseNotes)" :key="`${index}-${line}`">{{ line }}</li>
            </ul>
          </div>

          <div class="update-dialog-safety">
            <IonIcon :icon="shieldCheckmarkOutline" />
            <span>会保留本机日记和设置，请勿先卸载应用。</span>
          </div>
          <div class="update-dialog-actions">
            <button class="update-dialog-later" :disabled="installingUpdate" @click="closeUpdateDialog">稍后再说</button>
            <button class="update-dialog-install" :disabled="installingUpdate" @click="installPendingUpdate">
              <IonSpinner v-if="installingUpdate" name="crescent" />
              <IonIcon v-else :icon="cloudDownloadOutline" />
              {{ installingUpdate ? '准备安装' : '下载并安装' }}
            </button>
          </div>
          </section>
        </div>
      </Teleport>
    </IonContent>
  </IonPage>
</template>
