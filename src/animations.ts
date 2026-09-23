import { createAnimation } from '@ionic/vue'
import type { AnimationBuilder } from '@ionic/vue'

export type TabSlideDirection = 'forward' | 'back'

function buildTabSlideAnimation(direction: TabSlideDirection, _baseEl: HTMLElement, opts: Parameters<AnimationBuilder>[1] = {}) {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('primary-tab-slide').duration(0)

  const isBack = direction === 'back'
  const enteringFrom = isBack ? '-100%' : '100%'
  const leavingTo = isBack ? '100%' : '-100%'

  const enteringAnimation = createAnimation('primary-tab-enter')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', background: '#07131f' })
    .fromTo('transform', `translate3d(${enteringFrom}, 0, 0)`, 'translate3d(0, 0, 0)')
    .afterClearStyles(['transform'])

  const leavingAnimation = createAnimation('primary-tab-leave')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible', background: '#07131f' })
    .fromTo('transform', 'translate3d(0, 0, 0)', `translate3d(${leavingTo}, 0, 0)`)
    .afterClearStyles(['transform'])

  return createAnimation('primary-tab-slide')
    .addAnimation([enteringAnimation, leavingAnimation])
    .duration(280)
    .easing('cubic-bezier(0.32, 0.72, 0, 1)')
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

  const enteringAnimation = createAnimation('editor-save-enter')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', background: '#07131f' })
    .fromTo('opacity', '0', '1')
    .afterClearStyles(['opacity', 'background'])

  const leavingAnimation = createAnimation('editor-save-leave')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible', background: '#07131f' })
    .fromTo('opacity', '1', '0')
    .afterClearStyles(['opacity', 'background'])

  return createAnimation('editor-save-fade')
    .addAnimation([enteringAnimation, leavingAnimation])
    .duration(220)
    .easing('ease-out')
}

/** Pull the new-diary page upward from the center navigation action like a sheet of paper. */
export const createDiaryPaperEnterAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('diary-paper-enter').duration(0)

  const enteringAnimation = createAnimation('diary-paper-pull')
    .addElement(enteringEl)
    .beforeStyles({
      visibility: 'visible',
      background: '#07131f',
      transformOrigin: '50% calc(100% - 48px)',
      willChange: 'transform, opacity, clip-path',
    })
    .keyframes([
      { offset: 0, opacity: '0', transform: 'translate3d(0, 74%, 0) scale(.22, .08)', clipPath: 'polygon(20% 0, 80% 0, 58% 100%, 42% 100%)' },
      { offset: .58, opacity: '1', transform: 'translate3d(0, 12%, 0) scale(.94, .82)', clipPath: 'polygon(7% 0, 93% 0, 67% 100%, 33% 100%)' },
      { offset: 1, opacity: '1', transform: 'translate3d(0, 0, 0) scale(1)', clipPath: 'polygon(0 0, 100% 0, 100% 100%, 0 100%)' },
    ])
    .afterClearStyles(['transform', 'opacity', 'clip-path', 'transform-origin', 'will-change', 'background'])

  const leavingAnimation = createAnimation('diary-paper-background')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible' })
    .fromTo('transform', 'scale(1)', 'scale(.975)')
    .fromTo('opacity', '1', '.72')
    .afterClearStyles(['transform', 'opacity'])

  return createAnimation('diary-paper-enter')
    .addAnimation([enteringAnimation, leavingAnimation])
    .duration(520)
    .easing('cubic-bezier(0.2, 0.78, 0.18, 1)')
}

/** Collapse a newly saved sheet into a star while revealing the memory planet. */
export const createDiaryToStarAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('diary-to-star').duration(0)
  const paperEl = leavingEl.querySelector('.editor-paper') as HTMLElement | null
  const editorChrome = leavingEl.querySelectorAll('.page-subbar, .mood-section')

  const enteringAnimation = createAnimation('planet-reveal')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', background: '#07131f' })
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
    .beforeStyles({ visibility: 'visible', background: '#07131f' })
    .fromTo('background-color', '#07131f', 'rgba(7, 19, 31, 0)')
    .afterClearStyles(['background', 'background-color'])

  return createAnimation('diary-to-star')
    .addAnimation([enteringAnimation, paperAnimation, chromeAnimation, leavingBackground])
    .duration(620)
    .easing('cubic-bezier(0.32, 0, 0.18, 1)')
}

/** Transition from the focused star into its diary detail page. */
export const createStarEnterAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('star-enter').duration(0)

  const enteringAnimation = createAnimation('star-detail-enter')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', transformOrigin: '50% 48%', background: '#07131f' })
    .fromTo('transform', 'scale(.72)', 'scale(1)')
    .fromTo('opacity', '0', '1')
    .afterClearStyles(['transform', 'opacity', 'transform-origin', 'background'])

  const leavingAnimation = createAnimation('starfield-zoom-away')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible', transformOrigin: '50% 48%' })
    .fromTo('transform', 'scale(1)', 'scale(1.13)')
    .fromTo('opacity', '1', '.2')
    .afterClearStyles(['transform', 'opacity', 'transform-origin'])

  return createAnimation('star-enter')
    .addAnimation([enteringAnimation, leavingAnimation])
    .duration(420)
    .easing('cubic-bezier(0.22, 0.72, 0, 1)')
}

/** Reverse the star zoom when returning from a diary to the planet. */
export const createStarReturnAnimation: AnimationBuilder = (baseEl, opts = {}) => {
  const enteringEl = opts.enteringEl as HTMLElement | undefined
  const leavingEl = opts.leavingEl as HTMLElement | undefined
  if (!enteringEl || !leavingEl) return createAnimation('star-return').duration(0)

  const enteringAnimation = createAnimation('starfield-return')
    .addElement(enteringEl)
    .beforeStyles({ visibility: 'visible', transformOrigin: '50% 48%', background: '#07131f' })
    .fromTo('transform', 'scale(1.13)', 'scale(1)')
    .fromTo('opacity', '.2', '1')
    .afterClearStyles(['transform', 'opacity', 'transform-origin', 'background'])

  const leavingAnimation = createAnimation('star-detail-leave')
    .addElement(leavingEl)
    .beforeStyles({ visibility: 'visible', transformOrigin: '50% 48%', background: '#07131f' })
    .fromTo('transform', 'scale(1)', 'scale(.72)')
    .fromTo('opacity', '1', '0')
    .afterClearStyles(['transform', 'opacity', 'transform-origin', 'background'])

  return createAnimation('star-return')
    .addAnimation([enteringAnimation, leavingAnimation])
    .duration(380)
    .easing('cubic-bezier(0.22, 0.72, 0, 1)')
}
