<script setup lang="ts">
import { computed,ref } from 'vue'
import { useIonRouter } from '@ionic/vue'
import TarotShell from '../components/TarotShell.vue'
import { aiConfiguration,hasAiConsent,revokeAiConsent } from '../services/tarotConsent'
import { useTarotChatStore } from '../stores/tarotChatStore'
import { flushTarotCleanup } from '../services/tarotAiClient'
import { getTarotRepository } from '../repositories/tarotRepository'
import { useTarotStore } from '../stores/tarotStore'
const router=useIonRouter(),chat=useTarotChatStore(),store=useTarotStore(),config=aiConfiguration(),consent=ref(hasAiConsent()),status=ref('')
const consentLabel=computed(()=>consent.value?'已同意当前数据说明':'尚未同意上传')
async function revoke(){await chat.stopAndWait();revokeAiConsent();consent.value=false;status.value='已撤回同意，后续问题和聊天不会上传。已有本机历史会保留。'}
async function clearCache(){
  try{
    await chat.stopAndWait();await store.load()
    const repository=await getTarotRepository()
    // Cache purge is explicit and independent of local history deletion.
    const candidates=store.readings.filter(r=>r.requests.length)
    if(!candidates.length){status.value='没有发送过 AI 的记录，无需清理服务器缓存。';return}
    const entries=await repository.cleanup()
    // Individual records retain their immutable question/cards; use a cleanup entry without deleting them.
    for(const reading of candidates)if(!entries.some(e=>e.readingId===reading.id))await repository.enqueueCleanup(reading.id)
    await flushTarotCleanup()
    status.value=(await repository.cleanup()).length?'清理请求已留在本机，联网后会再尝试；恢复缓存最长 24 小时有效。':'已提交服务器恢复缓存清理。本机历史仍保留。'
  }catch(e){status.value=(e as Error).message}
}
</script>
<template>
  <TarotShell title="星语设置"><template #header><span></span></template><div class="t-page-body t-settings"><p class="t-eyebrow">AI 解读与数据</p><h1>安心地，问自己。</h1><section><h2>在线解读</h2><p>{{ config.enabled ? `模型服务：${config.provider}` : 'AI 解读尚未接通；抽牌、本地牌义与历史记录可离线使用。' }}</p><p>{{ consentLabel }}</p><p>使用 AI 时，本次问题、背景、牌阵和必要对话经拾光笺服务器发送至外部模型。模型与密钥由服务器管理。</p><p>个人笔记、其他日记、图片和通知邮箱不进入塔罗 AI 请求。</p><a v-if="config.policyUrl" :href="config.policyUrl" target="_blank" rel="noopener noreferrer">服务商数据处理政策 ↗</a><button v-if="consent" class="t-secondary" @click="revoke">撤回 AI 同意</button></section><section><h2>恢复缓存</h2><p>服务器加密缓存完整回复，最长 24 小时有效，用于用户主动取回断线结果。平台备份可能保留更久的加密副本；模型方的留存以其政策为准。</p><button class="t-secondary" @click="clearCache">清理服务器恢复缓存</button></section><section><h2>本机历史</h2><p>草稿、牌面、聊天、收藏和个人笔记保存在本机。没有云端备份，卸载或清除数据会丢失记录。</p><button class="t-secondary" @click="router.navigate('/tarot/history','forward','push')">管理星语记录</button></section><section><h2>这副牌的来处</h2><p>RWS 1909 · Roses &amp; Lilies，78 张完整卡面。画作：Pamela Colman Smith；扫描：Saskia Jansen；来自 Wikimedia Commons 的公有领域文件。所有卡面随应用打包。</p><p>中文牌义为本项目编写的象征参考文字。塔罗提供思考角度，选择仍由你决定。</p></section><p v-if="status" class="t-caption" role="status">{{ status }}</p></div></TarotShell>
</template>
