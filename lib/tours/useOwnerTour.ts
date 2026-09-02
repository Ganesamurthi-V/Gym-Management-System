'use client'

import { useCallback, useEffect, useRef } from 'react'
import { useRouter } from 'next/navigation'
import type { Config, DriveStep, Driver, PopoverDOM } from 'driver.js'
import { api } from '@/lib/api/client'
import { at, atWithin, type TourAnchorKey } from './anchors'
import {
  TOUR_CHAPTERS,
  isStepInViewport,
  type TourStep,
  type TourStepSide,
} from './definitions'
import type { TourChapterId, TourStatus } from './progress'
import { requestTourNav, setTourActive } from './tour-state'

/**
 * lib/tours/useOwnerTour.ts
 * ─────────────────────────
 * The tour engine. Owns the Driver.js instance, cross-page navigation, viewport
 * filtering, progress persistence and teardown.
 *
 * ONE INSTANCE, KEPT ALIVE ACROSS NAVIGATION
 * ------------------------------------------
 * `TourLauncher` is mounted inside `ShellGuard`, which lives in
 * `app/owner/layout.tsx`. App Router does not remount a layout when navigating
 * between pages that share it, so a single `driver()` instance survives every
 * `/owner/*` soft navigation. That is what makes a nine-page tour feel
 * continuous instead of flashing and restarting at each boundary.
 *
 * Progress is still written to the server as the owner advances, so closing the
 * tab or a hard refresh resumes rather than restarts.
 *
 * WE OWN NAVIGATION
 * -----------------
 * Overriding `onNextClick` / `onPrevClick` means Driver.js stops advancing by
 * itself and we must call `moveTo()`. That is deliberate: it is the only place we
 * can push a route before the next step's element is expected to exist.
 * `waitForElement` then bridges the gap while the new page renders.
 */

/** Tailwind's `md` breakpoint — the width at which the sidebar appears. */
const DESKTOP_MEDIA_QUERY = '(min-width: 768px)'

/**
 * How long to wait for a step's element. Generous, because it has to cover a
 * route change plus a Server Component render on a cold cache. Steps whose
 * element may legitimately be missing are marked `optional` and skipped up front
 * instead of waiting this out.
 */
const ELEMENT_WAIT_MS = 8_000

/** Progress writes are debounced so walking quickly does not spam the API. */
const PROGRESS_DEBOUNCE_MS = 800

type FlatStep = {
  chapterId: TourChapterId
  chapterLabel: string
  route: string
  /** Index within this chapter AFTER viewport filtering. */
  stepIndexInChapter: number
  step: TourStep
  /** Resolved CSS selector, or undefined for a centred step. */
  selector?: string
  /**
   * Popover side, resolved for this viewport. Nav steps need different placement
   * on each: the sidebar is a tall column on the left, the mobile drawer is a
   * bottom sheet, so the same side value cannot serve both.
   */
  side?: TourStepSide
  /**
   * True for a step that spotlights a navigation item. Those point at the menu
   * from wherever the owner already is, so they must not trigger a route change.
   */
  isNav: boolean
}

export type TourResumePoint = {
  chapterId: TourChapterId
  stepIndex: number
}

export type StartTourOptions = {
  /** Resume here instead of starting from the beginning. */
  from?: TourResumePoint
  /** Delay before the first popover, so page transitions can settle. */
  delayMs?: number
}

/**
 * Flatten the chapters into the linear list Driver.js drives.
 *
 * Selectors are resolved here, once, because a navigation item's selector depends
 * on the viewport: `NAV_ITEMS` renders in both the desktop sidebar and the mobile
 * drawer with the same `data-tour` value, so it has to be scoped to whichever
 * container that width actually shows.
 */
function buildFlatSteps(isDesktop: boolean): FlatStep[] {
  const flat: FlatStep[] = []
  const navContainer: TourAnchorKey = isDesktop ? 'sidebar' : 'mobileNavPanel'

  for (const chapter of TOUR_CHAPTERS) {
    const visible = chapter.steps.filter(step => isStepInViewport(step, isDesktop))
    visible.forEach((step, indexInChapter) => {
      const isNav = Boolean(step.navTarget)
      const selector = step.navTarget
        ? atWithin(navContainer, step.navTarget)
        : step.anchor
          ? at(step.anchor)
          : undefined

      // Nav steps point out of the sidebar to the right on desktop, and up out of
      // the bottom-sheet drawer on mobile. Other steps may declare their own
      // mobile override where the layout changes axis.
      const side: TourStepSide | undefined = isNav
        ? isDesktop ? 'right' : 'top'
        : !isDesktop && step.mobileSide
          ? step.mobileSide
          : step.side

      flat.push({
        chapterId: chapter.id,
        chapterLabel: chapter.label,
        route: chapter.route,
        stepIndexInChapter: indexInChapter,
        step,
        selector,
        side,
        isNav,
      })
    })
  }
  return flat
}

/**
 * Map a saved (chapter, step) pair back onto a flat index.
 *
 * Clamped rather than exact: the saved index is relative to the viewport the
 * owner was using, so resuming a desktop tour on a phone can land on a chapter
 * that now has fewer steps. Clamping keeps that in range instead of failing.
 */
function resolveResumeIndex(flat: FlatStep[], from: TourResumePoint): number {
  const first = flat.findIndex(entry => entry.chapterId === from.chapterId)
  if (first === -1) return 0
  const count = flat.filter(entry => entry.chapterId === from.chapterId).length
  const offset = Math.min(Math.max(from.stepIndex, 0), count - 1)
  return first + offset
}

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-reduced-motion: reduce)').matches
}

export function useOwnerTour(options?: { onEnd?: () => void }) {
  const router = useRouter()

  const driverRef = useRef<Driver | null>(null)
  const flatRef = useRef<FlatStep[]>([])
  const lastIndexRef = useRef(0)

  /** A terminal status has already been written; do not write another. */
  const finishedRef = useRef(false)
  /** Teardown we initiated — persist nothing and do not fire `onEnd`. */
  const silentRef = useRef(false)
  /** Guards against overlapping `startTour` calls. */
  const startingRef = useRef(false)
  /** Whether the tour currently has the navigation menu held open. */
  const navOpenRef = useRef(false)

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const startTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  const routerRef = useRef(router)
  routerRef.current = router
  const onEndRef = useRef(options?.onEnd)
  onEndRef.current = options?.onEnd

  // ── Progress persistence ──────────────────────────────────────────────────
  // Failures are swallowed: losing a progress write is a much smaller problem
  // than an error toast on top of a tour, and the tour still works without it.
  const postProgress = useCallback(
    (status: TourStatus, chapterId: TourChapterId | null, stepIndex: number) => {
      void api.post('/api/tours', { status, chapterId, stepIndex }).catch(() => {})
    },
    [],
  )

  const clearSaveTimer = useCallback(() => {
    if (saveTimerRef.current) {
      clearTimeout(saveTimerRef.current)
      saveTimerRef.current = null
    }
  }, [])

  const queueProgress = useCallback(
    (chapterId: TourChapterId, stepIndex: number) => {
      clearSaveTimer()
      saveTimerRef.current = setTimeout(() => {
        saveTimerRef.current = null
        postProgress('in_progress', chapterId, stepIndex)
      }, PROGRESS_DEBOUNCE_MS)
    },
    [clearSaveTimer, postProgress],
  )

  const flushProgress = useCallback(
    (status: TourStatus) => {
      clearSaveTimer()
      const entry = flatRef.current[lastIndexRef.current]
      postProgress(status, entry?.chapterId ?? null, entry?.stepIndexInChapter ?? 0)
    },
    [clearSaveTimer, postProgress],
  )

  /** End the tour and record why. */
  const finish = useCallback(
    (status: Extract<TourStatus, 'completed' | 'dismissed'>) => {
      if (finishedRef.current) {
        driverRef.current?.destroy()
        return
      }
      finishedRef.current = true
      flushProgress(status)
      driverRef.current?.destroy()
    },
    [flushProgress],
  )

  /** Tear down without recording anything (unmount, or replacing the instance). */
  const teardownSilently = useCallback(() => {
    clearSaveTimer()
    if (startTimerRef.current) {
      clearTimeout(startTimerRef.current)
      startTimerRef.current = null
    }
    // Restore the navigation menu before tearing down, so leaving the owner
    // section cannot strand an open drawer or a sidebar the tour expanded.
    if (navOpenRef.current) {
      navOpenRef.current = false
      requestTourNav('close')
    }
    if (driverRef.current) {
      silentRef.current = true
      driverRef.current.destroy()
      driverRef.current = null
    }
    setTourActive(false)
  }, [clearSaveTimer])

  // ── Navigation ────────────────────────────────────────────────────────────
  /**
   * Find the next step to show, skipping `optional` steps whose element is
   * genuinely absent.
   *
   * The absence check only runs when we are already on the step's own route. On
   * any other route the element is expected to be missing simply because we have
   * not navigated there yet, so it must be waited for, not skipped.
   */
  const resolveTarget = useCallback((from: number, direction: 1 | -1): number => {
    const flat = flatRef.current
    let target = from + direction

    while (target >= 0 && target < flat.length) {
      const entry = flat[target]
      const sameRoute =
        typeof window !== 'undefined' && window.location.pathname === entry.route

      if (entry.step.optional && entry.selector && sameRoute && !document.querySelector(entry.selector)) {
        target += direction
        continue
      }
      return target
    }
    return -1
  }, [])

  /**
   * Open or restore the navigation menu for the step we are about to show.
   *
   * Must run BEFORE `moveTo`/`drive`. Driver.js resolves a step's element — and
   * spends its `waitForElement` budget — before firing any hook, so opening the
   * drawer from `onHighlightStarted` would be too late: the element would already
   * have been judged missing. Doing it here means the drawer is on its way in
   * while `waitForElement` bridges the render.
   *
   * Restoring is automatic: any step that does not ask for the menu closes it,
   * so a chapter cannot leave the drawer covering the screen behind it.
   */
  const applyNavIntent = useCallback((target: number) => {
    const entry = flatRef.current[target]
    // A nav step spotlights an item inside the menu, so it always needs it open.
    const wantOpen = Boolean(entry?.isNav || entry?.step.openNav)
    if (wantOpen === navOpenRef.current) return
    navOpenRef.current = wantOpen
    requestTourNav(wantOpen ? 'open' : 'close')
  }, [])

  const goToIndex = useCallback((target: number) => {
    const instance = driverRef.current
    const flat = flatRef.current
    if (!instance || target < 0 || target >= flat.length) return

    applyNavIntent(target)

    const entry = flat[target]
    // Nav steps deliberately stay put: they show where a page lives, from
    // wherever the owner currently is. The step after each one performs the
    // actual navigation.
    if (
      !entry.isNav &&
      typeof window !== 'undefined' &&
      window.location.pathname !== entry.route
    ) {
      // Push first, then move. Driver.js waits for the element via
      // `waitForElement` while the new page renders, keeping the current step
      // highlighted in the meantime.
      routerRef.current.push(entry.route)
    }
    instance.moveTo(target)
  }, [applyNavIntent])

  const step = useCallback(
    (direction: 1 | -1) => {
      const instance = driverRef.current
      if (!instance) return
      const current = instance.getActiveIndex() ?? lastIndexRef.current
      const target = resolveTarget(current, direction)

      if (target === -1) {
        // Ran off the end going forwards — treat as finishing the tour.
        if (direction === 1) finish('completed')
        return
      }
      goToIndex(target)
    },
    [finish, goToIndex, resolveTarget],
  )

  // ── Popover chrome ────────────────────────────────────────────────────────
  const renderPopover = useCallback(
    (popover: PopoverDOM, index: number | undefined) => {
      const flat = flatRef.current
      const position = index ?? lastIndexRef.current
      const entry = flat[position]
      if (!entry) return

      // Progress rail down the card's left edge, filling downward. Driver's own
      // "N of M" text stays in the footer, but across 27 steps a filling rail is
      // what actually tells the owner how much is left. Vertical, so the height
      // carries the value — see .gf-tour-progress in driver-theme.css.
      const track = document.createElement('div')
      track.className = 'gf-tour-progress'
      const fill = document.createElement('span')
      fill.className = 'gf-tour-progress-fill'
      const pct = flat.length > 0 ? ((position + 1) / flat.length) * 100 : 0
      fill.style.height = `${Math.min(100, Math.max(0, pct))}%`
      track.appendChild(fill)
      popover.wrapper.appendChild(track)

      // Chapter label above the title, so the owner always knows which part of
      // the app they are being shown.
      const label = document.createElement('span')
      label.className = 'gf-tour-chapter'
      label.textContent = entry.chapterLabel
      popover.title.parentElement?.insertBefore(label, popover.title)

      // A skip affordance on every step except the last, where "Finish" already
      // does the job.
      const isLast = (index ?? 0) >= flat.length - 1
      if (!isLast) {
        const skip = document.createElement('button')
        skip.type = 'button'
        skip.className = 'gf-tour-skip'
        skip.textContent = 'Skip tour'
        skip.addEventListener('click', () => finish('dismissed'))
        popover.footer.insertBefore(skip, popover.footerButtons)
      }
    },
    [finish],
  )

  // ── Config ────────────────────────────────────────────────────────────────
  const buildDriveSteps = useCallback((flat: FlatStep[]): DriveStep[] => {
    return flat.map(entry => {
      const { step: source } = entry
      const driveStep: DriveStep = {
        popover: {
          title: source.title,
          description: source.description,
          side: entry.side,
          align: source.align,
        },
      }
      if (entry.selector) {
        driveStep.element = entry.selector
        driveStep.waitForElement = ELEMENT_WAIT_MS
      }

      if (entry.isNav) {
        // Clicking the highlighted menu entry is the natural instinct, and the
        // Link navigates on its own. Advancing on click keeps the tour in step
        // with that instead of leaving the popover pointing at a stale element.
        driveStep.advanceOnClick = true
      }

      return driveStep
    })
  }, [])

  const buildConfig = useCallback(
    (flat: FlatStep[]): Config => ({
      steps: buildDriveSteps(flat),
      animate: !prefersReducedMotion(),
      duration: 380,
      smoothScroll: true,
      allowClose: true,
      allowKeyboardControl: true,
      overlayColor: '#0f172a',
      overlayOpacity: 0.6,
      stagePadding: 8,
      stageRadius: 12,
      popoverClass: 'gymflow-tour-popover',
      popoverOffset: 12,
      showProgress: true,
      progressText: '{{current}} of {{total}}',
      nextBtnText: 'Next',
      prevBtnText: 'Back',
      doneBtnText: 'Finish',

      // Absence is handled by `resolveTarget` for the steps where it is
      // expected. Leaving this off means an unexpected missing element degrades
      // to a centred popover rather than silently skipping content.
      skipMissingElement: false,

      // A stray click on the dimmed background should not throw away a tour the
      // owner is halfway through. The close button, Skip and Esc still exit.
      overlayClickBehavior: () => {},

      onNextClick: () => step(1),
      onPrevClick: () => step(-1),
      onDoneClick: () => finish('completed'),
      onCloseClick: () => finish('dismissed'),

      onHighlighted: (_element, _driveStep, opts) => {
        const index = opts.index ?? 0
        lastIndexRef.current = index
        const entry = flatRef.current[index]
        if (entry) queueProgress(entry.chapterId, entry.stepIndexInChapter)
      },

      onPopoverRender: (popover, opts) => renderPopover(popover, opts.index),

      onDestroyed: () => {
        setTourActive(false)

        // Hand the navigation menu back to the owner's own preference — a drawer
        // left open, or a sidebar we expanded, must not outlive the tour.
        if (navOpenRef.current) {
          navOpenRef.current = false
          requestTourNav('close')
        }

        if (silentRef.current) {
          silentRef.current = false
          return
        }

        // Reached when the owner presses Esc, which Driver.js handles itself.
        // Treat it as a deliberate exit so they are not prompted again.
        if (!finishedRef.current) {
          finishedRef.current = true
          flushProgress('dismissed')
        }

        // Background refreshes were suppressed for the duration of the tour, so
        // pull fresh data now that it is over.
        onEndRef.current?.()
      },
    }),
    [buildDriveSteps, finish, flushProgress, queueProgress, renderPopover, step],
  )

  // ── Public API ────────────────────────────────────────────────────────────
  const startTour = useCallback(
    async (opts?: StartTourOptions) => {
      if (typeof window === 'undefined' || startingRef.current) return
      startingRef.current = true

      try {
        teardownSilently()

        const isDesktop = window.matchMedia(DESKTOP_MEDIA_QUERY).matches
        const flat = buildFlatSteps(isDesktop)
        if (flat.length === 0) return
        flatRef.current = flat

        const startIndex = opts?.from ? resolveResumeIndex(flat, opts.from) : 0
        const entry = flat[startIndex]
        if (!entry) return

        // Load the library only when a tour actually runs, so owners who never
        // see one never download it.
        const { driver } = await import('driver.js')

        finishedRef.current = false
        silentRef.current = false
        navOpenRef.current = false
        lastIndexRef.current = startIndex

        const instance = driver(buildConfig(flat))
        driverRef.current = instance

        if (window.location.pathname !== entry.route) {
          routerRef.current.push(entry.route)
        }

        const begin = () => {
          startTimerRef.current = null
          if (driverRef.current !== instance) return
          setTourActive(true)
          // Same ordering requirement as goToIndex: open the menu before the
          // first step resolves its element.
          applyNavIntent(startIndex)
          instance.drive(startIndex)
        }

        if (opts?.delayMs && opts.delayMs > 0) {
          startTimerRef.current = setTimeout(begin, opts.delayMs)
        } else {
          begin()
        }
      } finally {
        startingRef.current = false
      }
    },
    [buildConfig, teardownSilently],
  )

  const stopTour = useCallback(() => finish('dismissed'), [finish])

  const isTourRunning = useCallback(() => driverRef.current?.isActive() ?? false, [])

  // Leaving the owner section unmounts the shell. Tear down quietly so the last
  // debounced 'in_progress' write survives and the tour resumes next time.
  useEffect(() => teardownSilently, [teardownSilently])

  return { startTour, stopTour, isTourRunning }
}
