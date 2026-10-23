import { Capacitor } from '@capacitor/core'
import { getNotifyApiOrigin } from '../../../services/notifyApiClient'
export const CONSENT_VERSION='tarot-ai-v1'
const KEY='shiguangjian.tarot.consent.v1'
export function aiConfiguration() {
  const provider=String(import.meta.env.VITE_TAROT_AI_PROVIDER ?? '').trim()
  const policy=String(import.meta.env.VITE_TAROT_AI_POLICY_URL ?? '').trim()
  let policyUrl=''
  try{const url=new URL(policy);if(url.protocol==='https:'&&!url.username&&!url.password)policyUrl=url.href}catch{/* No unverified provider policy. */}
  return { enabled: import.meta.env.VITE_TAROT_AI_ENABLED==='true'&&!!getNotifyApiOrigin()&&Capacitor.getPlatform()==='android'&&!!provider&&!!policyUrl,provider,policyUrl }
}
export function hasAiConsent() {
  try{const saved=JSON.parse(localStorage.getItem(KEY)??'null');return saved?.version===CONSENT_VERSION&&saved.provider===aiConfiguration().provider&&saved.policyUrl===aiConfiguration().policyUrl}
  catch{return false}
}
export function grantAiConsent() {
  const config=aiConfiguration()
  if(!config.enabled)throw new Error('AI 解读尚未接通，牌面与本地牌义可以照常查看')
  localStorage.setItem(KEY,JSON.stringify({version:CONSENT_VERSION,provider:config.provider,policyUrl:config.policyUrl,at:Date.now()}))
}
export function revokeAiConsent() { localStorage.removeItem(KEY);window.dispatchEvent(new Event('tarot-consent-revoked')) }
