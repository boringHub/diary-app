<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref, watch } from 'vue'
import { useIonRouter } from '@ionic/vue'
import { IonContent, IonIcon, IonPage, onIonViewDidEnter } from '@ionic/vue'
import { calendarOutline, closeOutline, searchOutline, sparklesOutline } from 'ionicons/icons'
import { useDiaryStore } from '../stores/diaryStore'
import { moodLabels } from '../types/diary'
import type { Diary, Mood } from '../types/diary'
import { createStarEnterAnimation } from '../animations'
import {
  identityQuaternion,
  interpolateQuaternions,
  multiplyQuaternions,
  pointOnTrackball,
  quaternionBetweenVectors,
  quaternionFromAxisAngle,
  rotateVector,
  type Quaternion,
  type Vector3,
} from '../utils/trackball'

type Star = { diary?: Diary; x: number; y: number; z: number; size: number; phase: number; color: string; brightness: number; decorative?: boolean }
type ClusterItem = { diary: Diary; color: string; x: number; y: number }

const ionRouter = useIonRouter()
const store = useDiaryStore()
const storeReady = store.ensureLoaded().catch(() => undefined)
const canvas = ref<HTMLCanvasElement | null>(null)
const searchInput = ref<HTMLInputElement | null>(null)
const searchDate = ref('')
const searchOpen = ref(false)
const isSearching = ref(false)
const isDragging = ref(false)
const isSettling = ref(false)
const selectedDiaryId = ref<string | null>(null)
const cluster = ref<ClusterItem[]>([])
const focusVisible = ref(false)
const focusAnchor = ref({ x: 0, y: 0 })
const hint = ref('拖动星球，寻找一段记忆')
const canvasSize = ref({ width: 0, height: 0 })
const arrivingStar = ref<{ diaryId: string; color: string; x: number; y: number; focusX: number; focusY: number; phase: 'falling' | 'settling' } | null>(null)

const moodColors: Record<Mood, string> = { calm: '#81d3bd', happy: '#ffd27d', sad: '#8bb8e8', tired: '#b6a8d6', excited: '#ff9e82' }
const shortDateFormatter = new Intl.DateTimeFormat('zh-CN', { month: 'short', day: 'numeric' })
const dateKey = (value: number) => { const date = new Date(value); return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}` }
const formatShortDate = (value: number) => shortDateFormatter.format(value)
const focusedDiary = computed(() => store.diaries.find((diary) => diary.id === selectedDiaryId.value) ?? null)
const focusedMood = computed(() => focusedDiary.value ? moodLabels[focusedDiary.value.mood] : '')
const clusterMode = computed(() => cluster.value.length > 1)
const bubbleStyle = computed(() => ({
  left: `${clusterMode.value ? canvasSize.value.width / 2 : focusAnchor.value.x}px`,
  top: `${clusterMode.value ? canvasSize.value.height * .48 - 44 : focusAnchor.value.y}px`,
}))

let context: CanvasRenderingContext2D | null = null
let stars: Star[] = []
let orientation = identityQuaternion()
let targetOrientation = identityQuaternion()
let dragStartOrientation = identityQuaternion()
let dragStartVector: Vector3 | null = null
let animationFrame = 0
let lastTime = 0
let pointerDown = false
let moved = false
let pointerStart = { x: 0, y: 0 }
let settleToken = 0
let resizeObserver: ResizeObserver | null = null
let arrivalTimer = 0

function seededUnit(index: number, salt: number) {
  const value = Math.sin((index + 1) * (9283.17 + salt * 71.11)) * 43758.5453
  return value - Math.floor(value)
}

function createStars() {
  const realStars: Star[] = store.diaries.map((diary, index) => {
    const total = Math.max(store.diaries.length, 1)
    const phi = Math.acos(1 - 2 * ((index + 0.5) / total))
    const theta = Math.PI * (3 - Math.sqrt(5)) * index + 0.45
    return { diary, x: Math.sin(phi) * Math.cos(theta), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(theta), size: (diary.isFavorite ? 3.5 : 2.7) + seededUnit(index, 2) * 1.3, phase: index * 0.73, color: moodColors[diary.mood], brightness: .72 + seededUnit(index, 3) * .28 }
  })
  const decorativeColors = ['#b6e8ee', '#d4e7ff', '#a8c6db', '#f7ddba']
  const decorative: Star[] = Array.from({ length: Math.max(110, store.diaries.length * 10) }, (_, index) => {
    const unit = seededUnit(index, 5)
    const phi = Math.acos(1 - 2 * unit)
    const theta = Math.PI * 2 * seededUnit(index, 7)
    return { x: Math.sin(phi) * Math.cos(theta), y: Math.cos(phi), z: Math.sin(phi) * Math.sin(theta), size: 0.55 + seededUnit(index, 8) * 1.55, phase: index * 1.17, color: decorativeColors[index % decorativeColors.length], brightness: .48 + seededUnit(index, 9) * .52, decorative: true }
  })
  stars = [...realStars, ...decorative]
}

function resizeCanvas() {
  const element = canvas.value
  if (!element) return
  const rect = element.getBoundingClientRect()
  if (rect.width < 1 || rect.height < 1) return
  const dpr = Math.min(window.devicePixelRatio || 1, 2)
  element.width = Math.round(rect.width * dpr)
  element.height = Math.round(rect.height * dpr)
  context = element.getContext('2d')
  context?.setTransform(dpr, 0, 0, dpr, 0, 0)
  canvasSize.value = { width: rect.width, height: rect.height }
}

function rotatePoint(star: Star) { return rotateVector(star, orientation) }

function project(star: Star, index: number, now: number) {
  const point = rotatePoint(star)
  const width = canvasSize.value.width, height = canvasSize.value.height
  const radius = Math.min(width, height) * (width < 560 ? 0.39 : 0.34)
  const depth = (point.z + 1) / 2
  const scale = 0.78 + depth * 0.45
  return { x: width / 2 + point.x * radius * scale, y: height * 0.48 + point.y * radius * scale, z: point.z, size: star.size * scale * (1 + Math.sin(now * 0.0012 + star.phase) * 0.08), opacity: star.decorative ? 0.18 + depth * 0.36 : 0.36 + depth * 0.64, index }
}

function draw(now: number) {
  if (!context) return
  const width = canvasSize.value.width, height = canvasSize.value.height
  context.clearRect(0, 0, width, height)
  const centerX = width / 2, centerY = height * 0.48, radius = Math.min(width, height) * (width < 560 ? 0.39 : 0.34)
  const glow = context.createRadialGradient(centerX, centerY, radius * 0.22, centerX, centerY, radius * 1.16)
  glow.addColorStop(0, 'rgba(45, 91, 107, .1)'); glow.addColorStop(.68, 'rgba(21, 53, 70, .07)'); glow.addColorStop(1, 'rgba(8, 17, 32, 0)')
  context.fillStyle = glow; context.beginPath(); context.arc(centerX, centerY, radius * 1.18, 0, Math.PI * 2); context.fill()
  const equatorAxis = rotateVector({ x: 1, y: 0, z: 0 }, orientation)
  const orbitAngle = Math.atan2(equatorAxis.y, equatorAxis.x)
  context.strokeStyle = 'rgba(137, 193, 205, .09)'; context.lineWidth = 1
  for (const scale of [1, .78, .55]) { context.beginPath(); context.ellipse(centerX, centerY, radius * scale, radius * scale * .29, orbitAngle, 0, Math.PI * 2); context.stroke() }
  const projected = stars.map((star, index) => ({ star, point: project(star, index, now) })).sort((a, b) => a.point.z - b.point.z)
  for (const { star, point } of projected) {
    if (star.decorative && point.z < -0.35) continue
    if (star.diary && star.diary.id === arrivingStar.value?.diaryId) continue
    if (clusterMode.value && star.diary && cluster.value.some((item) => item.diary.id === star.diary?.id)) continue
    const selected = star.diary?.id === selectedDiaryId.value
    context.globalAlpha = point.opacity * star.brightness * (selected ? .42 : .16); context.fillStyle = star.color; context.beginPath(); context.arc(point.x, point.y, point.size * (selected ? 8 : 4), 0, Math.PI * 2); context.fill()
    context.globalAlpha = point.opacity * star.brightness; context.beginPath(); context.arc(point.x, point.y, point.size * (selected ? 1.35 : 1), 0, Math.PI * 2); context.fill()
    if (star.diary?.isFavorite) { context.globalAlpha = point.opacity * star.brightness * .58; context.strokeStyle = star.color; context.beginPath(); context.arc(point.x, point.y, point.size * 3, 0, Math.PI * 2); context.stroke() }
  }
  if (clusterMode.value) {
    for (const item of cluster.value) {
      const x = centerX + item.x
      const y = centerY + item.y
      context.globalAlpha = .18
      context.fillStyle = item.color
      context.beginPath()
      context.arc(x, y, 30, 0, Math.PI * 2)
      context.fill()
      context.globalAlpha = 1
      context.beginPath()
      context.arc(x, y, 4.5, 0, Math.PI * 2)
      context.fill()
    }
  }
  context.globalAlpha = 1
}

function getProjectedRealStars(now = performance.now()) { return stars.map((star, index) => ({ star, point: project(star, index, now) })).filter((item) => item.star.diary) }

function updateFocusedStar() {
  if (!canvasSize.value.width || clusterMode.value) return
  const centerX = canvasSize.value.width / 2, centerY = canvasSize.value.height * .48
  const radius = Math.min(canvasSize.value.width, canvasSize.value.height) * (canvasSize.value.width < 560 ? .39 : .34)
  const focusDistance = Math.max(30, radius * .19)
  const nearest = getProjectedRealStars().sort((a, b) => Math.hypot(a.point.x - centerX, a.point.y - centerY) - Math.hypot(b.point.x - centerX, b.point.y - centerY))[0]
  const distance = nearest ? Math.hypot(nearest.point.x - centerX, nearest.point.y - centerY) : Infinity
  const isInFocusRange = Boolean(nearest?.star.diary && nearest.point.z > -.12 && distance <= focusDistance)
  if (isInFocusRange && nearest?.star.diary) {
    selectedDiaryId.value = nearest.star.diary.id
    focusVisible.value = true
    focusAnchor.value = { x: nearest.point.x, y: nearest.point.y }
  } else {
    selectedDiaryId.value = null
    focusVisible.value = false
  }
}

function loop(now: number) {
  const delta = Math.min((now - lastTime) / 1000 || 0, .05); lastTime = now
  if (!pointerDown && !isSettling.value && !selectedDiaryId.value) {
    targetOrientation = multiplyQuaternions(quaternionFromAxisAngle({ x: 0, y: 1, z: 0 }, delta * .035), targetOrientation)
  }
  orientation = interpolateQuaternions(orientation, targetOrientation, Math.min(delta * 8, 1))
  draw(now); if (!clusterMode.value && !isSearching.value && !isSettling.value && !pointerDown) updateFocusedStar(); animationFrame = requestAnimationFrame(loop)
}

function setFocusForDiary(diary: Diary) {
  const star = stars.find((item) => item.diary?.id === diary.id)
  if (!star) return
  const currentPoint = rotateVector(star, targetOrientation)
  const focusRotation = quaternionBetweenVectors(currentPoint, { x: 0, y: 0, z: 1 })
  targetOrientation = multiplyQuaternions(focusRotation, targetOrientation)
  selectedDiaryId.value = null; focusVisible.value = false; cluster.value = []; isSettling.value = true
  const token = ++settleToken; window.setTimeout(() => { if (token === settleToken) isSettling.value = false }, 700)
}

async function playNewDiaryArrival() {
  await storeReady
  const diaryId = sessionStorage.getItem('shiguangjian.newDiaryArrival')
  if (!diaryId) return
  sessionStorage.removeItem('shiguangjian.newDiaryArrival')
  const diary = store.get(diaryId)
  if (!diary) return

  await nextTick()
  createStars()
  resizeCanvas()
  const star = stars.find((item) => item.diary?.id === diary.id)
  if (!star) return

  const target = project(star, stars.indexOf(star), performance.now())
  selectedDiaryId.value = diary.id
  focusVisible.value = false
  cluster.value = []
  isSettling.value = true
  hint.value = '一颗新的记忆正在落入星球'
  arrivingStar.value = {
    diaryId: diary.id,
    color: moodColors[diary.mood],
    x: target.x,
    y: target.y,
    focusX: canvasSize.value.width / 2,
    focusY: canvasSize.value.height * .48,
    phase: 'falling',
  }

  window.clearTimeout(arrivalTimer)
  arrivalTimer = window.setTimeout(() => {
    if (!arrivingStar.value) return
    arrivingStar.value = { ...arrivingStar.value, phase: 'settling' }
    setFocusForDiary(diary)
    hint.value = '新记忆已回到它的位置'
    arrivalTimer = window.setTimeout(() => { arrivingStar.value = null }, 760)
  }, 760)
}

function focusCluster(items: Diary[]) {
  cluster.value = items.map((diary, index) => {
    const angle = Math.PI * 2 * index / items.length - Math.PI / 2
    const distance = items.length === 2 ? 38 : 52
    return { diary, color: moodColors[diary.mood], x: Math.cos(angle) * distance, y: Math.sin(angle) * distance }
  })
  selectedDiaryId.value = items[0]?.id ?? null; focusVisible.value = true; hint.value = `${formatShortDate(items[0].createdAt)} · ${items.length} 段记忆聚集于此`
}

function selectClusterDiary(diary: Diary) {
  selectedDiaryId.value = diary.id
  focusVisible.value = true
  hint.value = `已选中：${diary.title || '无题'}`
}

function searchByDate() {
  if (!searchDate.value) return
  isSearching.value = true
  const matches = store.diaries.filter((diary) => dateKey(diary.createdAt) === searchDate.value)
  if (matches.length === 1) { setFocusForDiary(matches[0]); hint.value = '已找到这一天的记忆' }
  else if (matches.length > 1) focusCluster(matches)
  else { selectedDiaryId.value = null; focusVisible.value = false; cluster.value = []; hint.value = '这一天还没有星星' }
  window.setTimeout(() => { isSearching.value = false }, 560)
}

function randomFocus() {
  const diary = store.diaries[Math.floor(Math.random() * store.diaries.length)]
  if (!diary) return
  searchDate.value = ''; setFocusForDiary(diary); hint.value = '随机回望一段记忆'
}
function openDiary(diary: Diary) { ionRouter.navigate(`/diary/${diary.id}`, 'forward', 'push', createStarEnterAnimation) }
function toggleSearch() {
  searchOpen.value = !searchOpen.value
  if (searchOpen.value) nextTick(() => searchInput.value?.showPicker?.())
}

function pointerTrackballPosition(event: PointerEvent) {
  const rect = canvas.value?.getBoundingClientRect()
  if (!rect) return null
  const radius = Math.min(rect.width, rect.height) * (rect.width < 560 ? .39 : .34)
  return pointOnTrackball(event.clientX - rect.left - rect.width / 2, event.clientY - rect.top - rect.height * .48, radius)
}

function onPointerDown(event: PointerEvent) {
  pointerDown = true; moved = false; isDragging.value = false
  pointerStart = { x: event.clientX, y: event.clientY }
  targetOrientation = orientation
  dragStartOrientation = orientation
  dragStartVector = pointerTrackballPosition(event)
  canvas.value?.setPointerCapture(event.pointerId)
}
function onPointerMove(event: PointerEvent) {
  if (!pointerDown) return
  const total = Math.hypot(event.clientX - pointerStart.x, event.clientY - pointerStart.y)
  if (total > 6) { moved = true; isDragging.value = true; selectedDiaryId.value = null; focusVisible.value = false; cluster.value = []; hint.value = '松开，让最近的星星停在中心' }
  const currentVector = pointerTrackballPosition(event)
  if (dragStartVector && currentVector) {
    const dragRotation = quaternionBetweenVectors(dragStartVector, currentVector)
    targetOrientation = multiplyQuaternions(dragRotation, dragStartOrientation)
    orientation = targetOrientation
  }
}
function onPointerUp(event: PointerEvent) {
  if (!pointerDown) return
  pointerDown = false; isDragging.value = false; dragStartVector = null; canvas.value?.releasePointerCapture(event.pointerId)
  if (moved) { isSettling.value = true; const token = ++settleToken; window.setTimeout(() => { if (token === settleToken) isSettling.value = false }, 320); return }
  const rect = canvas.value?.getBoundingClientRect(); if (!rect) return
  const x = event.clientX - rect.left, y = event.clientY - rect.top
  if (clusterMode.value) {
    const centerX = canvasSize.value.width / 2, centerY = canvasSize.value.height * .48
    const clusterHit = cluster.value.find((item) => Math.hypot(centerX + item.x - x, centerY + item.y - y) < 24)
    if (clusterHit) {
      if (clusterHit.diary.id === selectedDiaryId.value) openDiary(clusterHit.diary)
      else selectClusterDiary(clusterHit.diary)
      return
    }
  }
  const hit = getProjectedRealStars().sort((a, b) => b.point.z - a.point.z).find(({ point }) => Math.hypot(point.x - x, point.y - y) < Math.max(14, point.size * 4))
  if (hit?.star.diary) hit.star.diary.id === selectedDiaryId.value && focusVisible.value ? openDiary(hit.star.diary) : setFocusForDiary(hit.star.diary)
}
function onResize() { resizeCanvas() }

watch(() => store.diaries, async () => { await nextTick(); createStars(); resizeCanvas(); if (!selectedDiaryId.value && store.diaries[0]) randomFocus() }, { deep: true })
onIonViewDidEnter(async () => {
  await storeReady
  await nextTick()
  resizeCanvas()
  draw(performance.now())
  if (sessionStorage.getItem('shiguangjian.newDiaryArrival')) await playNewDiaryArrival()
  else if (!selectedDiaryId.value && store.diaries.length) randomFocus()
})
onMounted(async () => {
  await storeReady
  await nextTick()
  createStars()
  resizeCanvas()
  window.addEventListener('resize', onResize)
  resizeObserver = new ResizeObserver(() => resizeCanvas())
  if (canvas.value) resizeObserver.observe(canvas.value)
  if (store.diaries.length) randomFocus()
  animationFrame = requestAnimationFrame(loop)
})
onBeforeUnmount(() => {
  cancelAnimationFrame(animationFrame)
  window.removeEventListener('resize', onResize)
  resizeObserver?.disconnect()
  resizeObserver = null
  window.clearTimeout(arrivalTimer)
})
</script>

<template>
  <IonPage>
    <IonContent>
      <section class="starfield-screen">
        <div class="starfield-noise" aria-hidden="true"></div>
        <header class="starfield-header">
          <div class="starfield-tools">
            <div v-if="searchOpen" class="starfield-search" role="search">
              <IonIcon :icon="searchOutline" aria-hidden="true" />
              <input ref="searchInput" v-model="searchDate" type="date" aria-label="按日期搜索日记" @keydown.enter="searchByDate" @change="searchByDate" />
              <button :disabled="!searchDate || isSearching" aria-label="搜索日期" title="搜索日期" @click="searchByDate"><IonIcon :icon="calendarOutline" /></button>
            </div>
            <button class="starfield-tool" :class="{ active: searchOpen }" :aria-label="searchOpen ? '关闭日期搜索' : '按日期搜索'" :title="searchOpen ? '关闭日期搜索' : '按日期搜索'" @click="toggleSearch"><IonIcon :icon="searchOpen ? closeOutline : searchOutline" /></button>
            <button class="starfield-tool" aria-label="随机回望" title="随机回望" @click="randomFocus"><IonIcon :icon="sparklesOutline" /></button>
          </div>
        </header>
        <div class="starfield-stage" :class="{ dragging: isDragging, settling: isSettling }">
          <canvas ref="canvas" aria-label="可拖动的记忆星球" @pointerdown="onPointerDown" @pointermove="onPointerMove" @pointerup="onPointerUp" @pointercancel="onPointerUp"></canvas>
          <span
            v-if="arrivingStar"
            class="arriving-memory-star"
            :class="`is-${arrivingStar.phase}`"
            :style="{ '--arrival-x': `${arrivingStar.x}px`, '--arrival-y': `${arrivingStar.y}px`, '--focus-x': `${arrivingStar.focusX}px`, '--focus-y': `${arrivingStar.focusY}px`, '--arrival-color': arrivingStar.color }"
            aria-hidden="true"
          ></span>
          <div v-if="focusedDiary && focusVisible" class="memory-bubble mood-bubble" :style="bubbleStyle" aria-live="polite">
            <span class="bubble-tail"></span>
            <span class="bubble-mood"><i :style="{ background: moodColors[focusedDiary.mood] }"></i>{{ focusedMood }}</span>
            <span class="bubble-date">{{ formatShortDate(focusedDiary.createdAt) }}</span>
          </div>
        </div>
        <p class="starfield-hint"><span class="hint-dot"></span>{{ hint }}</p>
      </section>
    </IonContent>
  </IonPage>
</template>
