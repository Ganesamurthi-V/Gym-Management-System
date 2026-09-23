'use client'

import Image from 'next/image'
import { AsciiBackdrop } from '@/components/ui/AsciiBackdrop'

/**
 * The shell every /auth page sits in: a single centred column on a white surface, with
 * the character grid running full-bleed behind it.
 *
 * This replaced a split layout that had been copy-pasted across three pages — a 55%
 * (45% on setup-password) dark navy panel carrying a logo, a gradient headline, three
 * feature cards and two chips, with the form in the remaining width. GridBackground and
 * FeatureCard existed twice verbatim and setup-password had its own drifted third copy,
 * so the same edit had to be made in three places and reliably wasn't.
 *
 * One column rather than two, and nothing decorative between the visitor and the form.
 * The marketing panel was selling to someone who had already decided to sign in.
 *
 * ── Monochrome, and what that does and does not extend to ────────────────────────────
 * Surface is white, type is the neutral ramp, the primary action is near-black. The
 * brand blue is gone from every decorative use: focus rings, links, the agreements
 * panel, the notice banner. It is deliberately NOT gone from the semantic states —
 * errors stay red, confirmations stay emerald, the digit counter stays amber. Colour is
 * carrying meaning there, and draining it would cost real information to satisfy a
 * stylistic rule. Each of those also pairs colour with an icon and text, so colour is
 * never the only cue.
 *
 * ── Why the type floor is neutral-700 ───────────────────────────────────────────────
 * The grid runs behind the copy rather than around it, so a full mark sets the worst
 * backdrop any text has to clear. Black ink at opacity a leaves it at 255(1 - a), and at
 * the 0.26 used here that is rgb(189). Measured against it: neutral-700 is 5.52,
 * neutral-600 is 4.16 and fails the 4.5 floor. So neutral-700 is the lightest grey
 * allowed on the surface, and anything lighter has to sit on an opaque fill instead —
 * which is where the placeholders and the inactive tab label live.
 */

const LOGO = '/logo_only.png'

export interface AuthShellProps {
  children: React.ReactNode
  /** Column width. The wider forms (create-account) need more than the sign-in form. */
  maxWidth?: number
  /**
   * Rendered under the column, outside the measure. Used for the "already have an
   * account" line and the security note.
   */
  footer?: React.ReactNode
}

export function AuthShell({ children, maxWidth = 400, footer }: AuthShellProps) {
  return (
    /*
      `isolate` is load-bearing, not decoration. The grid needs to sit above this white
      surface but below the column, and the obvious way to say that — a negative z-index
      on the grid — does not work here: `position: fixed` with `z-index: -10` and no
      ancestor stacking context puts the canvas in the ROOT stacking context, where the
      body's own opaque background paints straight over it. The grid rendered, reported a
      canvas, and was invisible; measuring the surface came back pure white everywhere,
      which is how it was caught.

      isolation: isolate makes this element a stacking context, so the z-indices below are
      scoped to it: surface first, grid at z-0, column at z-10.
    */
    <div className="relative isolate min-h-screen bg-white">
      {/*
        fixed rather than absolute, so a form long enough to scroll (create-account) keeps
        the grid still underneath it instead of dragging a 10px lattice up the screen.

        opacity-[0.26] is a contrast ceiling, not a preference; see the note above.
      */}
      <AsciiBackdrop
        className="pointer-events-none fixed inset-0 z-0 opacity-[0.26]"
        color="#000000"
        /* Monochrome: the faint end is grey rather than the brand blue the landing hero
           uses, so nothing on the page carries a hue except the semantic states. */
        colorTint="#737373"
        scale={4}
        intensity={1.099}
        contrast={2.501}
      />

      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="px-5 pt-7 sm:px-8">
          <a
            href="/"
            className="inline-flex items-center gap-2.5 rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2"
          >
            <Image src={LOGO} alt="" width={28} height={28} className="object-contain" aria-hidden />
            <span className="text-[15px] font-bold tracking-tight text-neutral-950">gymflow</span>
          </a>
        </header>

        <main className="flex flex-1 items-center justify-center px-5 py-10 sm:px-8">
          <div className="w-full" style={{ maxWidth }}>
            {children}
          </div>
        </main>

        <footer className="px-5 pb-8 sm:px-8">
          <div className="mx-auto w-full text-center" style={{ maxWidth }}>
            {footer}
          </div>
        </footer>
      </div>
    </div>
  )
}

export default AuthShell
