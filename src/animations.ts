import { createAnimation } from '@ionic/vue'
import type { AnimationBuilder, AnimationKeyFrames } from '@ionic/vue'

export type TabSlideDirection = 'forward' | 'back'

const paperDuration = 680
const starDuration = 1160
const lerp = (from: number, to: number, progress: number) => from + (to - from) * progress
const clamp = (value: number) => Math.max(0, Math.min(1, value))
const transitionBackground = (element: HTMLElement) => getComputedStyle(element).getPropertyValue('--app-shell-background').trim() || '#07131f'
const smooth = (from: number, to: number, value: number) => {
  const progress = clamp((value - from) / (to - from))
  return progress * progress * (3 - 2 * progress)
}

function sampledFrames(frame: (progress: number) => Record<string, string | number>, reverse = false): AnimationKeyFrames {
  return Array.from({ length: 65 }, (_, index) => {
    const offset = index / 64
    return { ...frame(reverse ? 1 - offset : offset), offset }
  })
}

function paperFrames(element: HTMLElement, reverse = false) {
  const rect = element.getBoundingClientRect()
  const button = document.querySelector('.nav-create')?.getBoundingClientRect()
  const width = rect.width || window.innerWidth
  const height = rect.height || window.innerHeight
  const anchorX = button ? button.left + button.width / 2 - rect.left : width / 2
  const anchorY = button ? button.top + button.height / 2 - rect.top : height - 51
  const mouthWidth = button?.width ?? 50

  return sampledFrames((progress) => {
    // Both edges move throughout the pull; delayed phases make page content stall.
    const rise = Math.sin(progress * Math.PI / 2)
    const release = rise * rise
    const topWidth = lerp(mouthWidth * .94, width, rise)
    const bottomWidth = lerp(mouthWidth * .52, width, release)
    const top = lerp(anchorY - 5, 0, rise)
    const bottom = lerp(anchorY + 5, height, rise)
    const center = lerp(anchorX, width / 2, rise)
    const topLeft = center - topWidth / 2
    const bottomLeft = lerp(anchorX, width / 2, release) - bottomWidth / 2
    // A projective matrix maps the entire page onto one solid trapezoid.
    const perspective = topWidth / bottomWidth
    const matrix = [
      topWidth / width, 0, 0, 0,
      (bottomLeft * perspective - topLeft) / height, (bottom * perspective - top) / height, 0, (perspective - 1) / height,
      0, 0, 1, 0,
      topLeft, top, 0, 1,
    ]
    return { transform: `matrix3d(${matrix.join(',')})` }
  }, reverse)
}

function buildDiaryPaperAnimation(baseEl: HTMLElement, opts: Parameters<AnimationBuilder>[1] = {}, reverse = false) {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('diary-paper').duration(0)
  const sheet = reverse ? leavingEl : enteringEl
  const background = reverse ? enteringEl : leavingEl
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const sheetAnimation = createAnimation('diary-paper-sheet')
    .addElement(sheet)
    .beforeStyles({ visibility: 'visible', opacity: '1', 'z-index': '2', 'transform-origin': '0 0', 'will-change': 'transform', 'backface-visibility': 'hidden' })
    .keyframes(reducedMotion
      ? sampledFrames((progress) => ({ opacity: String(smooth(0, 1, progress)) }), reverse)
      : paperFrames(sheet, reverse))
    .afterClearStyles(['visibility', 'opacity', 'z-index', 'transform-origin', 'will-change', 'backface-visibility', 'transform'])

  const backgroundAnimation = createAnimation('diary-paper-background')
    .addElement(background)
    .beforeStyles({ visibility: 'visible', opacity: '1', 'z-index': '1' })
    .keyframes(sampledFrames((progress) => ({
      transform: `scale(${lerp(1, reducedMotion ? 1 : .985, smooth(0, 1, progress))})`,
      opacity: String(lerp(1, .7, smooth(0, 1, progress))),
    }), reverse))
    .afterClearStyles(['visibility', 'z-index', 'transform', 'opacity'])

  return createAnimation('diary-paper')
    .addElement(baseEl)
    .beforeStyles({ overflow: 'hidden' })
    .addAnimation([sheetAnimation, backgroundAnimation])
    .duration(reducedMotion ? 160 : paperDuration)
    .easing('linear')
    .afterClearStyles(['overflow'])
}

function buildTabSlideAnimation(direction: TabSlideDirection, baseEl: HTMLElement, opts: Parameters<AnimationBuilder>[1] = {}) {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('primary-tab-slide').duration(0)

  const isBack = direction === 'back'
  const enteringFrom = isBack ? '-100%' : '100%'
  const leavingTo = isBack ? '100%' : '-100%'
  const backgroundColor = transitionBackground(baseEl)

  const enteringAnimation = createAnimation('primary-tab-enter')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', opacity: '1', zIndex: '2', background: backgroundColor })
    .fromTo('transform', `translate3d(${enteringFrom}, 0, 0)`, 'translate3d(0, 0, 0)')
    .afterClearStyles(['transform', 'opacity', 'visibility', 'z-index', 'background'])

  const leavingAnimation = createAnimation('primary-tab-leave')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible', opacity: '1', zIndex: '1', background: backgroundColor })
    .fromTo('transform', 'translate3d(0, 0, 0)', `translate3d(${leavingTo}, 0, 0)`)
    .afterClearStyles(['transform', 'opacity', 'visibility', 'z-index', 'background'])

  return createAnimation('primary-tab-slide')
    .addElement(baseEl)
    .beforeStyles({ overflow: 'hidden', background: backgroundColor })
    .addAnimation([enteringAnimation, leavingAnimation])
    .duration(280)
    .easing('cubic-bezier(0.32, 0.72, 0, 1)')
    .afterClearStyles(['overflow', 'background'])
}

/** Build a root-navigation animation with an explicit visual direction. */
export const createTabSlideAnimation = (direction: TabSlideDirection): AnimationBuilder => {
  return (baseEl, opts = {}) => buildTabSlideAnimation(direction, baseEl, opts)
}

/** Fade from the editor into the saved diary without adding spatial movement. */
export const createEditorSaveAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('editor-save-fade').duration(0)
  const backgroundColor = transitionBackground(baseEl)

  const enteringAnimation = createAnimation('editor-save-enter')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', background: backgroundColor })
    .fromTo('opacity', '0', '1')
    .afterClearStyles(['opacity', 'background'])

  const leavingAnimation = createAnimation('editor-save-leave')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible', background: backgroundColor })
    .fromTo('opacity', '1', '0')
    .afterClearStyles(['opacity', 'background'])

  return createAnimation('editor-save-fade')
    .addAnimation([enteringAnimation, leavingAnimation])
    .duration(220)
    .easing('ease-out')
}

/** Pull the new-diary page upward from the center navigation action like a sheet of paper. */
export const createDiaryPaperEnterAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  return buildDiaryPaperAnimation(baseEl, opts, opts.direction === 'back')
}

/** Reverse the new-diary sheet back into the bottom-center create action. */
export const createDiaryPaperExitAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  return buildDiaryPaperAnimation(baseEl, opts, true)
}

/** Collapse a newly saved sheet into a star while revealing the memory planet. */
export const createDiaryToStarAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('diary-to-star').duration(0)
  const backgroundColor = transitionBackground(baseEl)
  const paperEl = leavingEl.querySelector('.editor-paper') as HTMLElement | null
  const editorChrome = leavingEl.querySelectorAll('.page-subbar, .mood-section')

  const enteringAnimation = createAnimation('planet-reveal')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', background: backgroundColor })
    .fromTo('opacity', '.35', '1')
    .fromTo('transform', 'scale(.975)', 'scale(1)')
    .afterClearStyles(['transform', 'opacity', 'background'])

  const paperAnimation = createAnimation('paper-collapse-to-star')
    .addElement(paperEl ?? leavingEl)
    .beforeStyles({
      visibility: 'visible',
      transformOrigin: '50% 48%',
      willChange: 'transform, opacity, clip-path, filter',
    })
    .keyframes([
      { offset: 0, opacity: '1', transform: 'translate3d(0, 0, 0) scale(1)', clipPath: 'inset(0 round 0)', filter: 'brightness(1)' },
      { offset: .44, opacity: '1', transform: 'translate3d(0, 2%, 0) scale(.28, .16)', clipPath: 'inset(34% 41% round 26px)', filter: 'brightness(1.5)' },
      { offset: .72, opacity: '.95', transform: 'translate3d(0, -8%, 0) scale(.055)', clipPath: 'circle(50% at 50% 50%)', filter: 'brightness(2.4) drop-shadow(0 0 18px #81d3bd)' },
      { offset: 1, opacity: '0', transform: 'translate3d(0, -30%, 0) scale(.025)', clipPath: 'circle(50% at 50% 50%)', filter: 'brightness(2.8) drop-shadow(0 0 24px #81d3bd)' },
    ])
    .afterClearStyles(['transform', 'opacity', 'clip-path', 'filter', 'transform-origin', 'will-change'])

  const chromeAnimation = createAnimation('editor-chrome-fade')
    .addElement(editorChrome)
    .fromTo('opacity', '1', '0')
    .fromTo('transform', 'translate3d(0, 0, 0)', 'translate3d(0, -12px, 0)')
    .afterClearStyles(['transform', 'opacity'])

  const leavingBackground = createAnimation('editor-background-fade')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible', background: backgroundColor })
    .fromTo('background-color', backgroundColor, 'transparent')
    .afterClearStyles(['background', 'background-color'])

  return createAnimation('diary-to-star')
    .addAnimation([enteringAnimation, paperAnimation, chromeAnimation, leavingBackground])
    .duration(620)
    .easing('cubic-bezier(0.32, 0, 0.18, 1)')
}

export type StarTransitionOrigin = {
  diaryId: string
  x: number
  y: number
  size: number
  color: string
  width: number
  height: number
}

let lastStarOrigin: StarTransitionOrigin | undefined

function buildStarAnimation(baseEl: HTMLElement, opts: Parameters<AnimationBuilder>[1] = {}, origin: StarTransitionOrigin | undefined, reverse: boolean) {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('memory-star').duration(0)
  const planet = reverse ? enteringEl : leavingEl
  const detail = reverse ? leavingEl : enteringEl
  const canvas = planet.querySelector('canvas')
  if (canvas && origin) {
    canvas.dataset.transitionStarId = origin.diaryId
    canvas.dispatchEvent(new CustomEvent('memory-transition-update', { detail: reverse ? origin : undefined }))
  }
  const rect = baseEl.getBoundingClientRect()
  const detailRect = detail.getBoundingClientRect()
  const width = rect.width || window.innerWidth
  const height = rect.height || window.innerHeight
  const backButton = detail.querySelector('.page-subbar .icon-button')?.getBoundingClientRect()
  const target = {
    x: backButton ? backButton.left + backButton.width / 2 - rect.left : Math.min(64, width * .18),
    y: backButton ? backButton.top + backButton.height / 2 - rect.top : 72,
  }
  const source = {
    x: origin ? origin.x / origin.width * width - rect.left : width / 2,
    y: origin ? origin.y / origin.height * height - rect.top : height * .48,
  }
  const radius = Math.ceil(Math.max(
    Math.hypot(target.x, target.y), Math.hypot(width - target.x, target.y),
    Math.hypot(target.x, height - target.y), Math.hypot(width - target.x, height - target.y),
  ) + 8)
  const revealX = target.x + rect.left - detailRect.left
  const revealY = target.y + rect.top - detailRect.top
  const color = origin?.color ?? '#81d3bd'
  const size = Math.max(4, (origin?.size ?? 3) * 2)
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches

  const overlay = document.createElement('div')
  overlay.className = 'memory-transition'
  overlay.setAttribute('aria-hidden', 'true')
  overlay.style.setProperty('--memory-color', color)
  const meteor = document.createElement('div')
  meteor.className = 'memory-flight-star'
  meteor.style.width = `${size}px`
  meteor.style.height = `${size}px`
  const trail = document.createElement('span')
  trail.className = 'memory-flight-trail'
  meteor.append(trail)
  const halo = document.createElement('div')
  halo.className = 'memory-reveal-halo'
  const ripple = document.createElement('div')
  ripple.className = 'memory-reveal-ripple'
  for (const element of [halo, ripple]) {
    element.style.left = `${target.x}px`
    element.style.top = `${target.y}px`
  }
  ripple.style.width = `${radius * 2}px`
  ripple.style.height = `${radius * 2}px`
  overlay.append(meteor, halo, ripple)
  baseEl.append(overlay)

  const planetAnimation = createAnimation('memory-planet')
    .addElement(planet)
    .beforeStyles({ visibility: 'visible', 'z-index': '1' })
    .fromTo('opacity', '1', '1')
    .afterClearStyles(['visibility', 'opacity', 'z-index'])
  const detailAnimation = createAnimation('memory-reveal')
    .addElement(detail)
    .beforeStyles({ visibility: 'visible', opacity: '1', 'z-index': '2', 'will-change': 'clip-path' })
    .keyframes(sampledFrames((progress) => ({
      opacity: reducedMotion ? String(smooth(0, 1, progress)) : '1',
      clipPath: reducedMotion ? 'none' : `circle(${radius * smooth(.56, 1, progress)}px at ${revealX}px ${revealY}px)`,
    }), reverse))
    .afterClearStyles(['clip-path', 'will-change', 'visibility', 'opacity', 'z-index'])

  const starField = planet.querySelectorAll('canvas, .starfield-header, .starfield-hint, .memory-bubble, .arriving-memory-star')
  const starsAnimation = createAnimation('memory-other-stars')
    .addElement(starField)
    .keyframes(sampledFrames((progress) => ({ opacity: String(1 - smooth(.02, .38, progress)) }), reverse))
    .afterClearStyles(['opacity'])

  const meteorAnimation = createAnimation('memory-meteor')
    .addElement(meteor)
    .keyframes(sampledFrames((progress) => {
      const flight = reducedMotion ? 1 : smooth(.16, .57, progress)
      const bend = Math.sin(flight * Math.PI)
      const x = lerp(source.x, target.x, flight) - bend * Math.min(54, Math.abs(source.x - target.x) * .18)
      const y = lerp(source.y, target.y, flight) - bend * Math.min(50, Math.abs(source.y - target.y) * .16)
      const scale = 1 + smooth(0, .13, progress) * 1.25 - smooth(.4, .58, progress) * .65
      return {
        transform: `translate3d(${x - size / 2}px, ${y - size / 2}px, 0) scale(${scale})`,
        opacity: reducedMotion ? '0' : String(1 - smooth(.57, .72, progress)),
      }
    }, reverse))
  // The tail always stays behind the flight direction. On return the meteor
  // travels from the detail header back to the planet, so its tail reverses
  // independently instead of simply replaying the entry orientation.
  const flightAngle = Math.atan2(source.y - target.y, source.x - target.x) * 180 / Math.PI
  const angle = reverse ? flightAngle + 180 : flightAngle
  const trailAnimation = createAnimation('memory-meteor-trail')
    .addElement(trail)
    .keyframes(sampledFrames((progress) => {
      const strength = reducedMotion ? 0 : smooth(.16, .29, progress) * (1 - smooth(.43, .59, progress))
      return { opacity: String(strength * .85), transform: `rotate(${angle}deg) scaleX(${strength})` }
    }, reverse))
  const haloAnimation = createAnimation('memory-halo')
    .addElement(halo)
    .keyframes(sampledFrames((progress) => ({
      transform: `translate(-50%, -50%) scale(${lerp(.12, 3.8, smooth(.48, .85, progress))})`,
      opacity: reducedMotion ? '0' : String(smooth(.42, .57, progress) * (1 - smooth(.59, .86, progress))),
    }), reverse))
  const rippleAnimation = createAnimation('memory-ripple')
    .addElement(ripple)
    .keyframes(sampledFrames((progress) => ({
      transform: `translate(-50%, -50%) scale(${Math.max(.001, smooth(.56, 1, progress))})`,
      opacity: reducedMotion ? '0' : String(smooth(.52, .59, progress) * (1 - smooth(.67, 1, progress)) * .65),
    }), reverse))

  return createAnimation('memory-star')
    .addAnimation([planetAnimation, detailAnimation, starsAnimation, meteorAnimation, trailAnimation, haloAnimation, rippleAnimation])
    .duration(reducedMotion ? 180 : starDuration)
    .easing('linear')
    .onFinish(() => {
      overlay.remove()
      if (canvas) {
        delete canvas.dataset.transitionStarId
        canvas.dispatchEvent(new Event('memory-transition-update'))
      }
    }, { oneTimeCallback: true })
}

/** Reuse the same timeline for toolbar, browser, hardware, and gesture back. */
export function createStarEnterAnimation(origin: StarTransitionOrigin): AnimationBuilder {
  return (baseEl, opts = {}) => {
    lastStarOrigin = origin
    return buildStarAnimation(baseEl, opts, origin, opts.direction === 'back')
  }
}

/** Collapse the diary into its halo, then fly the star home. */
export const createStarReturnAnimation: AnimationBuilder = (baseEl, opts = {}) => buildStarAnimation(baseEl, opts, lastStarOrigin, true)
