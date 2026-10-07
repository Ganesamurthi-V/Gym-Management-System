import { createElement } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { AsciiBackdrop } from '@/components/ui/AsciiBackdrop'

/**
 * The character-grid animation behind the guided-tour card: the same effect as the login
 * and onboarding pages.
 *
 * Driver.js builds the card as plain DOM, outside React, so the animation is mounted into it
 * as its own small React root. The card is rebuilt or reused between steps depending on the
 * Driver.js version, so mounting is idempotent: calling it again for a card that already has
 * the animation does nothing, and a card that lost it (or a changed theme) gets a fresh one.
 *
 * Reasoning shared with the other uses of the grid, and worth not undoing:
 *   - ink is white on a dark card and black on a light one, at a low opacity (set in
 *     driver-theme.css) so the card's text keeps its contrast over the busiest part;
 *   - AsciiBackdrop already refuses to mount on phones, with reduced motion, or on Data Saver
 *     / 2g, and loads three.js only once those gates pass, so none of that is repeated here;
 *   - deferMs is short because a tour step is short-lived: waiting two seconds for an idle
 *     moment would show the grid just as the owner clicks Next.
 */

const CLASS = 'gf-tour-ascii'

let root: Root | null = null
let mountedOn: HTMLElement | null = null

function isDark(): boolean {
  return document.documentElement.classList.contains('dark')
}

/** Removes the animation, if there is one. Safe to call at any time. */
export function unmountTourAscii(): void {
  const r = root
  const host = mountedOn
  root = null
  mountedOn = null
  if (r) {
    // Unmounting a root while React is mid-render throws a warning; do it on the next tick.
    window.setTimeout(() => r.unmount(), 0)
  }
  host?.remove()
}

export function mountTourAscii(wrapper: HTMLElement): void {
  const dark = isDark()
  const existing = wrapper.querySelector<HTMLElement>(`.${CLASS}`)
  if (existing && existing.dataset.dark === String(dark)) return

  // A stale one: a different theme, or left behind by an earlier card.
  unmountTourAscii()
  existing?.remove()

  const host = document.createElement('div')
  host.className = CLASS
  host.dataset.dark = String(dark)
  host.setAttribute('aria-hidden', 'true')
  // First child, so it paints under everything else in the card.
  wrapper.insertBefore(host, wrapper.firstChild)

  root = createRoot(host)
  mountedOn = host
  root.render(
    createElement(AsciiBackdrop, {
      className: 'pointer-events-none absolute inset-0',
      color: dark ? '#ffffff' : '#000000',
      colorTint: dark ? '#a3a3a3' : '#737373',
      scale: 4,
      intensity: 1.099,
      contrast: 2.501,
      deferMs: 250,
    }),
  )
}
