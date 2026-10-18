<script setup lang="ts">
import { computed, ref } from 'vue'
import { useRoute } from 'vue-router'
import { alertController, IonContent, IonIcon, IonPage, IonSpinner, onIonViewWillEnter, useIonRouter } from '@ionic/vue'
import { checkmarkDoneOutline, chevronBack, createOutline, heart, heartOutline, imageOutline, refreshOutline, shareSocialOutline, timeOutline } from 'ionicons/icons'
import { useDiaryStore } from '../stores/diaryStore'
import type { DiaryBlock } from '../types/diary'
import { moodLabels } from '../types/diary'
import { createStarReturnAnimation } from '../animations'
import { diaryShareSyncState, refreshDiaryShareStatus } from '../services/notificationSync'
import { showAppToast } from '../services/appToast'
const route = useRoute(); const ionRouter = useIonRouter(); const store = useDiaryStore()
const shareLoading = ref(false)
const diaryId = ref(String(route.params.id))
onIonViewWillEnter(() => {
  if (typeof route.params.id === 'string') diaryId.value = route.params.id
  void store.refresh().catch(() => undefined)
})
void store.ensureLoaded().catch(() => undefined)
const diary = computed(() => store.get(diaryId.value))
const awaitingReceipt = computed(() => ['queued', 'processing', 'sent'].includes(diary.value?.shareStatus ?? ''))
const canRefreshShareStatus = computed(() => ['pending', 'queued', 'processing', 'sent'].includes(diary.value?.shareStatus ?? ''))
const receiptErrorText = computed(() => {
  if (!awaitingReceipt.value || !diaryShareSyncState.error) return ''
  switch (diaryShareSyncState.error) {
    case 'cloudflare_challenge': return '状态未更新：请求被 Cloudflare 验证拦截'
    case 'network_unavailable': return '状态未更新：暂时无法连接服务器'
    case 'request_timeout': return '状态未更新：连接超时，稍后会继续确认'
    case 'invalid_server_response': return '状态未更新：服务器响应异常'
    case 'local_sync_failed': return '状态未更新：本机回执保存失败'
    default: return '状态未更新：服务器暂时无法提供回执'
  }
})
const shareStatusText = computed(() => {
  switch (diary.value?.shareStatus) {
    case 'pending': return diary.value?.shareError === 'request_timeout' || diary.value?.shareError === 'invalid_server_response'
      ? '请求已保留，正在确认发送状态'
      : diary.value?.shareError === 'cloudflare_challenge'
        ? '正在确认发送状态'
        : diary.value?.shareError === 'network_unavailable' ? '等待联网后发送' : '等待发送'
    case 'queued':
    case 'processing': return '已提交，等待发送结果'
    case 'sent': return '已发送，等待对方确认'
    case 'read': return '对方已看到'
    case 'failed': return '发送失败，可以重试'
    case 'cancelled': return '分享已取消'
    case 'expired': return '已发送，回执链接已过期'
    default: return '这篇日记还没有分享'
  }
})
const shareStatusIcon = computed(() => diary.value?.shareStatus === 'read'
  ? checkmarkDoneOutline
  : diary.value?.shareStatus === 'failed' ? refreshOutline : diary.value?.shareStatus === 'none' ? shareSocialOutline : timeOutline)
function textFor(block: DiaryBlock) {
  return 'text' in block.content ? block.content.text : ''
}
function imageAsset(block: DiaryBlock) {
  if (!('assetId' in block.content) || !diary.value) return undefined
  const assetId = block.content.assetId
  return diary.value.assets.find((asset) => asset.id === assetId)
}
function imageCaption(block: DiaryBlock) {
  return 'assetId' in block.content ? block.content.caption : undefined
}
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

async function share() {
  const current = diary.value
  if (!current || shareLoading.value) return
  shareLoading.value = true
  try {
    if (current.shareStatus === 'failed') {
      await store.retryDiaryShare(current.id)
      showAppToast('已经重新提交发送')
      return
    }
    const alert = await alertController.create({
      header: '分享这篇日记？',
      message: '这篇日记的标题和纯文本正文会发送到已配置的固定分享邮箱。图片不会发送。',
      buttons: [{ text: '先不分享', role: 'cancel' }, { text: '确认分享', role: 'confirm' }],
    })
    await alert.present()
    const result = await alert.onDidDismiss()
    if (result.role !== 'confirm') return
    await store.shareDiary(current.id)
    showAppToast('日记已经提交发送')
  } catch (error) {
    await store.refresh().catch(() => undefined)
    showAppToast(shareErrorMessage(error))
  } finally {
    shareLoading.value = false
  }
}

function shareErrorMessage(error: unknown) {
  const code = error instanceof Error ? error.message : String(error)
  const messages: Record<string, string> = {
    share_disabled: '日记分享服务暂未开启',
    share_authorization_required: '当前设备的分享权限已被停用，请联系维护者',
    diary_already_shared: '这篇日记已经分享过了',
    share_id_conflict: '分享内容与首次提交不一致，请联系维护者',
    invalid_diary_share: '标题或正文不符合分享要求',
    rate_limited: '分享操作有点频繁，请稍后再试',
    request_timeout: '请求已保留，正在确认发送状态',
    network_unavailable: '邮件已保存在本机，联网后会继续发送',
    cloudflare_challenge: '邮件请求已保留，正在确认发送状态',
    invalid_server_response: '邮件可能已经提交，正在确认发送状态',
    notification_service_unconfigured: '当前版本未接入分享服务',
  }
  return messages[code] ?? '这次没有发送成功，稍后可以重试'
}

async function refreshShareStatus() {
  const previousCheck = diaryShareSyncState.checkedAt
  await refreshDiaryShareStatus()
  await store.refresh().catch(() => undefined)
  if (diaryShareSyncState.checkedAt !== previousCheck) {
    showAppToast('分享状态已更新')
  } else if (receiptErrorText.value) {
    showAppToast(receiptErrorText.value)
  } else if (diaryShareSyncState.nextCheckAt && diaryShareSyncState.nextCheckAt > Date.now()) {
    const time = new Intl.DateTimeFormat('zh-CN', { hour: '2-digit', minute: '2-digit' }).format(diaryShareSyncState.nextCheckAt)
    showAppToast(`下次状态查询时间：${time}`)
  } else {
    showAppToast('已显示本机最新状态，稍后自动查询回执')
  }
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
          <div class="detail-blocks">
            <template v-for="block in diary.blocks" :key="block.id">
              <p v-if="block.blockType === 'text'" class="detail-body">{{ textFor(block) }}</p>
              <figure v-else class="detail-image-block">
                <img v-if="imageAsset(block)?.url" :src="imageAsset(block)?.url" alt="日记里的照片" />
                <span v-else class="missing-image detail-missing-image"><IonIcon :icon="imageOutline" />这张图片暂时找不到</span>
                <figcaption v-if="imageCaption(block)">{{ imageCaption(block) }}</figcaption>
              </figure>
            </template>
          </div>
        </article>
        <section class="diary-share-panel" aria-live="polite">
          <span class="diary-share-icon"><IonIcon :icon="shareStatusIcon" /></span>
          <div><strong>日记分享</strong><p>{{ shareStatusText }}</p><p v-if="receiptErrorText" role="status">{{ receiptErrorText }}</p></div>
          <button v-if="canRefreshShareStatus" class="icon-button" aria-label="更新分享状态" title="更新分享状态" :disabled="diaryShareSyncState.checking" @click="refreshShareStatus">
            <IonSpinner v-if="diaryShareSyncState.checking" name="crescent" />
            <IonIcon v-else :icon="refreshOutline" />
          </button>
          <button v-if="diary.shareStatus === 'none' || diary.shareStatus === 'failed'" class="diary-share-action" :disabled="shareLoading" @click="share">
            <IonSpinner v-if="shareLoading" name="crescent" />
            <IonIcon v-else :icon="diary.shareStatus === 'failed' ? refreshOutline : shareSocialOutline" />
            <span>{{ diary.shareStatus === 'failed' ? '重试' : '分享' }}</span>
          </button>
        </section>
        <button class="delete-button" @click="remove">删掉这篇日记</button>
      </section>
      <section v-else-if="store.loading || !store.loaded" class="empty-state"><h2>正在把这颗星找回来…</h2></section>
      <section v-else class="empty-state"><h2>这颗星暂时找不到啦</h2><button class="primary-button" @click="ionRouter.navigate('/timeline', 'none', 'replace')">回星球</button></section>
    </IonContent>
  </IonPage>
</template>
