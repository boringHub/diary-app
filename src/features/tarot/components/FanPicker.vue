<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import type { DeckCard } from '../domain/types'
import TarotCard from './TarotCard.vue'
const props = defineProps<{ cards: DeckCard[]; label: string; busy?: boolean; error?: string }>()
const emit = defineEmits<{ close: []; select: [card: DeckCard, rect: DOMRect, angle: number] }>()
const dialog = ref<HTMLDialogElement>(), stage = ref<HTMLElement>()
let rotation = 0, scale = 1, pan = { x: 0, y: 0 }, frame = 0, suppressedUntil = 0
const pointers = new Map<number,{ x: number; y: number }>()
type Gesture = { kind: 'rotate'; start: {x:number;y:number}; angle: number; time: number; velocity: number; moved: boolean }
  | { kind: 'pinch'; distance: number; scale: number; center: {x:number;y:number}; geometry: ReturnType<typeof geometry>; moved: true }
let gesture: Gesture | null = null
let observer: ResizeObserver | undefined
const remaining = computed(() => `${props.cards.length} 张待选`)
function geometry() {
  const width = stage.value?.clientWidth ?? 390, height = stage.value?.clientHeight ?? 600
  return { x: width*1.04+pan.x, y: height*.53+pan.y, r: width*.81*scale, w: 62*scale, h: 144*scale }
}
function paint() {
  if (!stage.value) return
  rotation = ((rotation%360)+360)%360
  const g = geometry(), total = props.cards.length
  const edge = -Math.atan((g.w/2)/(g.r+g.h/2)), next = edge+Math.PI*2/total
  const clip = `polygon(0 0,${g.w/2+Math.tan(next)*(g.r+g.h/2)}px 0,${g.w/2+Math.tan(next)*(g.r-g.h/2)}px 100%,${g.w/2+Math.tan(edge)*(g.r-g.h/2)}px 100%)`
  Array.from(stage.value.children).forEach((node,i) => {
    const el = node as HTMLElement, angle = -90+i*360/total+rotation, radians = angle*Math.PI/180
    Object.assign(el.style,{ left: `${g.x+Math.cos(radians)*g.r}px`, top: `${g.y+Math.sin(radians)*g.r}px`, width: `${g.w}px`, height: `${g.h}px`, transform: `translate(-50%,-50%) rotate(${angle+90}deg)`, zIndex: String(i+1), clipPath: clip })
    el.dataset.angle = String(angle+90)
  })
}
function point(e: {clientX:number;clientY:number}) { const r = stage.value!.getBoundingClientRect(); return { x: e.clientX-r.left,y: e.clientY-r.top } }
function angle(p: {x:number;y:number}) { const g = geometry(); return Math.atan2(p.y-g.y,p.x-g.x)*180/Math.PI }
function stop() { cancelAnimationFrame(frame); frame = 0 }
function capture(id:number) {
  try { stage.value?.setPointerCapture(id) }
  catch { /* A cancelled or synthetic pointer may no longer be capturable. */ }
}
function start(moved = false) {
  const [a,b] = [...pointers.values()]
  if (b) gesture = { kind: 'pinch',distance: Math.max(1,Math.hypot(a.x-b.x,a.y-b.y)),scale,center:{x:(a.x+b.x)/2,y:(a.y+b.y)/2},geometry:geometry(),moved:true }
  else if (a) gesture = { kind:'rotate',start:a,angle:angle(a),time:performance.now(),velocity:0,moved }
  else gesture = null
}
function down(e: PointerEvent) {
  if (props.busy || (e.pointerType === 'mouse' && e.button !== 0)) return
  stop(); pointers.set(e.pointerId,point(e)); start()
  if (pointers.size > 1) { suppressedUntil = Date.now()+350; for (const id of pointers.keys()) capture(id) }
}
function move(e: PointerEvent) {
  if (!pointers.has(e.pointerId) || !gesture) return
  const p = point(e); pointers.set(e.pointerId,p)
  if (gesture.kind === 'pinch') {
    e.preventDefault()
    const [a,b] = [...pointers.values()]; if (!b) return
    const center = {x:(a.x+b.x)/2,y:(a.y+b.y)/2}
    scale = Math.max(.8,Math.min(1.8,gesture.scale*Math.hypot(a.x-b.x,a.y-b.y)/gesture.distance))
    const ratio = scale/gesture.scale
    pan = { x: center.x+(gesture.geometry.x-gesture.center.x)*ratio-stage.value!.clientWidth*1.04, y: center.y+(gesture.geometry.y-gesture.center.y)*ratio-stage.value!.clientHeight*.53 }
    paint(); return
  }
  if (!gesture.moved && Math.hypot(p.x-gesture.start.x,p.y-gesture.start.y)>7) { gesture.moved = true; capture(e.pointerId) }
  if (gesture.moved) {
    e.preventDefault(); const now = performance.now(), a = angle(p), delta = ((a-gesture.angle+540)%360)-180
    rotation += delta; gesture.velocity = delta/Math.max(8,now-gesture.time)*16; gesture.angle = a; gesture.time = now; paint()
  }
}
function glide(velocity: number) {
  if (matchMedia('(prefers-reduced-motion: reduce)').matches) return
  let previous = performance.now()
  function tick(now: number) {
    if (pointers.size) return
    const dt = Math.min(32,now-previous); previous = now
    rotation += velocity*dt/16; velocity *= Math.pow(.9,dt/16); paint()
    if (Math.abs(velocity)>.015) frame = requestAnimationFrame(tick)
  }
  frame = requestAnimationFrame(tick)
}
function up(e: PointerEvent,cancelled = false) {
  if (!pointers.has(e.pointerId)) return
  const previous = gesture; pointers.delete(e.pointerId)
  if (previous?.moved || cancelled) suppressedUntil = Date.now()+350
  if (pointers.size) { start(true); return }
  gesture = null
  if (!cancelled && previous?.kind === 'rotate' && previous.moved) glide(performance.now()-previous.time<100 ? Math.max(-4,Math.min(4,previous.velocity)) : 0)
}
function zoom(next: number,anchor: {x:number;y:number}) {
  const g = geometry(), clamped = Math.max(.8,Math.min(1.8,next)), ratio = clamped/scale
  pan = {x:anchor.x+(g.x-anchor.x)*ratio-stage.value!.clientWidth*1.04,y:anchor.y+(g.y-anchor.y)*ratio-stage.value!.clientHeight*.53}; scale = clamped; paint()
}
function wheel(e: WheelEvent) {
  if (props.busy) return
  e.preventDefault(); stop(); suppressedUntil = Date.now()+200
  if (e.ctrlKey) zoom(scale*Math.exp(-e.deltaY*.005),point(e))
  else { rotation += (Math.abs(e.deltaX)>Math.abs(e.deltaY) ? e.deltaX : e.deltaY)*.14; paint() }
}
function key(e: KeyboardEvent) {
  if (['ArrowLeft','ArrowRight'].includes(e.key)) { e.preventDefault(); stop(); rotation += (e.key === 'ArrowRight' ? 1 : -1)*360/props.cards.length; paint() }
  if (['+','=','-','0'].includes(e.key)) {
    e.preventDefault(); if(e.key === '0') { scale=1;pan={x:0,y:0};paint() }
    else zoom(scale+(e.key === '-' ? -.1 : .1),{x:stage.value!.clientWidth*.35,y:stage.value!.clientHeight*.5})
  }
}
function choose(card: DeckCard,e: MouseEvent) {
  if (props.busy || (e.detail !== 0 && Date.now()<suppressedUntil) || pointers.size>1) return
  const el = e.currentTarget as HTMLElement
  emit('select',card,el.getBoundingClientRect(),Number(el.dataset.angle))
}
onMounted(async () => {
  dialog.value?.showModal(); await nextTick(); paint(); stage.value?.focus()
  observer = new ResizeObserver(paint); if (stage.value) observer.observe(stage.value)
})
onBeforeUnmount(() => { stop();observer?.disconnect();dialog.value?.close() })
</script>
<template>
  <dialog ref="dialog" class="t-ring-dialog" aria-labelledby="fan-title" @cancel.prevent="!busy && emit('close')">
    <header class="tarot-topbar"><button class="t-text" :disabled="busy" @click="emit('close')">‹ 牌阵</button><span class="t-caption">{{ remaining }}</span><span class="t-balance"></span></header>
    <h2 id="fan-title">{{ label }}</h2><p class="t-caption">滑动选牌 · 双指缩放</p>
    <p v-if="error" class="t-error" role="alert">{{ error }}</p>
    <div ref="stage" class="t-fan-stage" tabindex="0" aria-label="首尾相连的牌组。滑动或方向键旋转，双指或加减键缩放，Tab 选择卡牌" @pointerdown="down" @pointermove="move" @pointerup="up($event)" @pointercancel="up($event,true)" @lostpointercapture="up($event,true)" @wheel="wheel" @keydown="key">
      <button v-for="card in cards" :key="card.originalSlot" class="t-fan-card" :disabled="busy" :aria-label="`选择第 ${card.number} 号牌`" @click="choose(card,$event)"><TarotCard :number="card.number" /></button>
    </div>
  </dialog>
</template>
