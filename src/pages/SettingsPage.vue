<script setup lang="ts">
import { ref } from 'vue'
import { alertController, IonContent, IonIcon, IonPage, toastController } from '@ionic/vue'
import { chevronForward, colorPaletteOutline, mailOutline, shieldCheckmarkOutline } from 'ionicons/icons'
import { settingsRepository } from '../repositories/settingsRepository'

const settings = ref(settingsRepository.get())

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
            <div class="setting-row"><div><strong>版本</strong><p>拾光笺 V1 · Ionic Vue 开发版</p></div></div>
          </div>
        </div>
      </section>
    </IonContent>
  </IonPage>
</template>
