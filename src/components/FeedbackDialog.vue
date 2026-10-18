<script setup lang="ts">
import { computed, nextTick, ref, watch } from 'vue'
import { IonContent, IonIcon, IonModal, IonSpinner } from '@ionic/vue'
import { closeOutline, sendOutline } from 'ionicons/icons'
import { diaryRepository } from '../repositories/diaryRepository'
import { FEEDBACK_MAX_LENGTH, isNotificationServiceConfigured } from '../services/notifyApiClient'
import { clearFeedbackDraft, readFeedbackDraft, saveFeedbackDraft } from '../services/feedbackDraft'
import { showAppToast } from '../services/appToast'

const props = defineProps<{ open: boolean }>()
const emit = defineEmits<{ close: [] }>()
const draft = ref(readFeedbackDraft())
const submitting = ref(false)
const errorText = ref('')
const textarea = ref<HTMLTextAreaElement>()
const length = computed(() => Array.from(draft.value.content).length)
const canSubmit = computed(() => !submitting.value && Boolean(draft.value.content.trim()) && length.value <= FEEDBACK_MAX_LENGTH)

watch(() => props.open, (open) => {
  if (open) {
    draft.value = readFeedbackDraft()
    errorText.value = ''
  }
})

function updateContent(event: Event) {
  const content = (event.target as HTMLTextAreaElement).value
  if (content !== draft.value.content) {
    draft.value.feedbackId = `fb_${crypto.randomUUID()}`
  }
  draft.value.content = content
  try {
    saveFeedbackDraft(draft.value)
    errorText.value = ''
  } catch {
    errorText.value = '本机空间不足，草稿暂时没有保存好'
  }
}

async function focusEditor() {
  await nextTick()
  textarea.value?.focus()
}

async function submit() {
  if (!canSubmit.value) return
  if (!isNotificationServiceConfigured()) {
    errorText.value = '当前版本未接入反馈服务，想法可以先留在这里'
    return
  }
  submitting.value = true
  errorText.value = ''
  const input = { ...draft.value }
  // Persist the identifier before the request, so a lost response can be retried safely.
  try {
    saveFeedbackDraft(input)
  } catch {
    errorText.value = '本机暂时无法保存草稿，还没有发送，请稍后再试'
    submitting.value = false
    return
  }
  try {
    await diaryRepository.submitFeedback(input)
  } catch (error) {
    const code = error instanceof Error ? error.message : String(error)
    const messages: Record<string, string> = {
      invalid_feedback: `请填写 1 至 ${FEEDBACK_MAX_LENGTH} 字的想法`,
      feedback_disabled: '反馈服务暂未开启，草稿已经保留',
      notification_service_unconfigured: '当前版本未接入反馈服务，草稿已经保留',
      native_device_required: '请在手机 App 中提交，草稿已经保留',
      request_timeout: '还没有收到提交结果，草稿已保留，可以重试确认',
      invalid_server_response: '还没有确认提交结果，草稿已保留，可以重试确认',
      network_unavailable: '现在连不上服务器，草稿已保留，请联网后重试',
      cloudflare_challenge: '服务暂时无法连接，草稿已保留，请稍后重试',
      rate_limited: '提交有点频繁，草稿已保留，请稍后再试',
      feedback_id_conflict: '反馈编号发生冲突，请修改内容后重新提交',
      feedback_delivery_failed: '这份反馈未能投递，请修改内容后重新提交',
    }
    errorText.value = messages[code] ?? '暂时没有提交成功，内容已保留，请稍后重试'
    submitting.value = false
    return
  }
  // A local cleanup failure must not turn an accepted submission into a failed one.
  try { clearFeedbackDraft() } catch { /* Retaining the accepted ID keeps a retry idempotent. */ }
  draft.value = { feedbackId: `fb_${crypto.randomUUID()}`, content: '' }
  submitting.value = false
  emit('close')
  showAppToast('反馈已经提交啦，谢谢你的想法')
}
</script>

<template>
  <IonModal :is-open="open" :can-dismiss="!submitting" @did-dismiss="emit('close')" @did-present="focusEditor">
    <IonContent>
      <section class="feedback-editor">
        <header>
          <h2>反馈建议</h2>
          <button class="feedback-close" type="button" aria-label="关闭反馈" title="关闭反馈" :disabled="submitting" @click="emit('close')"><IonIcon :icon="closeOutline" /></button>
        </header>
        <label for="feedback-content">想和我说的话</label>
        <textarea id="feedback-content" ref="textarea" :value="draft.content" :disabled="submitting" placeholder="希望增加的功能、遇到的小问题，或者一个新想法……" @input="updateContent"></textarea>
        <p class="feedback-counter" :class="{ invalid: length > FEEDBACK_MAX_LENGTH }">{{ length }} / {{ FEEDBACK_MAX_LENGTH }}</p>
        <p v-if="errorText" class="feedback-error" role="alert">{{ errorText }}</p>
        <footer>
          <button type="button" :disabled="submitting" @click="emit('close')">先留着</button>
          <button type="button" class="feedback-submit" :disabled="!canSubmit" @click="submit">
            <IonSpinner v-if="submitting" name="crescent" /><IonIcon v-else :icon="sendOutline" />
            {{ submitting ? '正在提交' : '提交反馈' }}
          </button>
        </footer>
      </section>
    </IonContent>
  </IonModal>
</template>

<style scoped>
.feedback-editor { max-width: 620px; min-height: 100%; margin: 0 auto; padding: calc(20px + var(--app-safe-top, 0px)) 20px calc(24px + var(--app-safe-bottom, 0px)); color: var(--app-theme-text); }
.feedback-editor header { display: flex; align-items: center; justify-content: space-between; gap: 16px; margin-bottom: 24px; }
.feedback-editor h2 { margin: 0; font-size: 22px; }
.feedback-close { display: grid; flex: 0 0 44px; place-items: center; width: 44px; height: 44px; padding: 0; border: 1px solid color-mix(in srgb, var(--app-theme-text) 22%, transparent); border-radius: 8px; background: var(--app-theme-surface); color: inherit; font-size: 22px; }
.feedback-editor label { display: block; margin-bottom: 12px; font-size: 15px; }
.feedback-editor textarea { display: block; width: 100%; min-height: 220px; height: 38dvh; max-height: 420px; padding: 14px; border: 1px solid color-mix(in srgb, var(--app-theme-text) 25%, transparent); border-radius: 8px; background: var(--app-theme-surface); color: inherit; font: inherit; font-size: 16px; line-height: 1.7; resize: vertical; }
.feedback-editor textarea:focus { outline: 2px solid var(--app-theme-primary); outline-offset: 2px; }
.feedback-editor textarea::placeholder { color: color-mix(in srgb, var(--app-theme-text) 55%, transparent); }
.feedback-counter { margin: 10px 0; text-align: right; font-size: 13px; opacity: .75; }
.feedback-error, .feedback-counter.invalid { color: var(--ion-color-danger, #e56f81); opacity: 1; }
.feedback-error { font-size: 14px; line-height: 1.6; overflow-wrap: anywhere; }
.feedback-editor footer { display: flex; justify-content: flex-end; gap: 12px; margin-top: 24px; }
.feedback-editor footer button { display: inline-flex; min-height: 44px; align-items: center; justify-content: center; gap: 8px; padding: 10px 18px; border: 1px solid color-mix(in srgb, var(--app-theme-text) 22%, transparent); border-radius: 8px; background: transparent; color: inherit; font: inherit; font-size: 14px; }
.feedback-editor footer .feedback-submit { border-color: transparent; background: var(--app-theme-primary); color: var(--app-theme-background); }
.feedback-editor button:disabled { opacity: .5; }
.feedback-submit ion-spinner, .feedback-submit ion-icon { width: 18px; height: 18px; flex: 0 0 18px; }
@media (max-height: 580px) { .feedback-editor textarea { min-height: 130px; } }
</style>
