'use client'

import { AsciiBackdrop } from '@/components/ui/AsciiBackdrop'
import { AuthWordmark } from '@/components/auth/AuthWordmark'

/**
 * The shell every /auth page sits in: a white surface with the character grid running
 * full-bleed behind it, holding either one centred column or two.
 *
 * Pass `aside` and the page splits — product copy left, form right. Leave it out and the
 * form sits alone in the middle, with no logo. Both layouts collapse to the same single
 * centred form below lg, and the form is in a card either way.
 *
 * This replaced a split layout that had been copy-pasted across three pages — a 55%
 * (45% on setup-password) dark navy panel carrying a logo, a gradient headline, three
 * feature cards and two chips, with the form in the remaining width. GridBackground and
 * FeatureCard existed twice verbatim and setup-password had its own drifted third copy,
 * so the same edit had to be made in three places and reliably wasn't.
 *
 * The split here is not that panel returning. The left column shares the page surface
 * instead of sitting on a dark slab, carries no duplicated markup — it is one
 * data-driven component, AuthAside — and is opt-in per page rather than imposed on all
 * three. What was wrong with the original was the cost of maintaining it and the weight
 * it put between the visitor and the form, not the idea of saying what the product is.
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

export interface AuthShellProps {
  children: React.ReactNode
  /** Column width. The wider forms (create-account) need more than the sign-in form. */
  maxWidth?: number
  /**
   * Rendered under the form, centred to it — inside the column but outside the card, so
   * in the split layout it tracks the form rather than the page. Used for the security
   * note.
   */
  footer?: React.ReactNode
  /**
   * Product copy for the left column — see AuthAside. Passing it switches the page from
   * one centred column to two, with this on the left and the form on the right, and puts
   * the form in a card so the two columns read as context and task rather than as two
   * equal blocks of text.
   *
   * Omitted on setup-password, which is opened from an email by someone already partway
   * through signing up. Selling to them there would be noise, and the page already has a
   * step indicator holding the top of its column. Leaving it out also drops the header
   * logo, since the header only exists as the small-screen fallback for this column.
   */
  aside?: React.ReactNode
}

/**
 * Horizontal padding inside the form card, added back onto `maxWidth` so the fields keep
 * the same measure whether or not they are in a card. The number a page passes stays the
 * width of the form itself, which is the thing that was tuned — the card grows around it.
 *
 * Fixed at 32px rather than fluid like the vertical spacing below, precisely so this sum
 * stays correct. Vertical padding is free to shrink; horizontal is not.
 */
const CARD_PADDING_X = 32

/**
 * ── Vertical rhythm ─────────────────────────────────────────────────────────────────
 * The --auth-* spacing tokens this shell, AuthAside and the three forms all read come from
 * the .auth-rhythm class in globals.css, not from here. They are clamp(min, vh, max) with a
 * height-conditional override under 700px, and the reasoning for both halves is documented
 * at that rule.
 *
 * They are not an inline style object on this element for one concrete reason: the override
 * is a media query, and inline styles cannot carry one.
 */

export function AuthShell({ children, maxWidth = 400, footer, aside }: AuthShellProps) {
  const split = Boolean(aside)
  // Every layout is carded now, so the padding is always added back on.
  const columnWidth = maxWidth + CARD_PADDING_X * 2

  const column = (
    /*
      relative so the column paints after the aside's scrim. Both are positioned with
      z-index auto, so source order decides, and the column comes second — without this the
      scrim's opaque white can reach across the gutter and wash out the card's left edge at
      narrower widths where the two overlap.
    */
    <div className="relative mx-auto w-full" style={{ maxWidth: columnWidth }}>
      <div
        /*
          An opaque fill, a hairline and a shadow that is mostly a wide soft spread — enough
          to lift the form off the grid without reading as a floating dialog.

          On every layout, not just the split one. It was originally split-only on the
          reasoning that a form alone in the middle of the page is already the obvious
          target, which is true, but it left the centred pages sitting their fields straight
          on the live grid while the split pages had an opaque base. The card is also what
          lets the placeholders and the inactive tab label sit below the neutral-700 floor,
          so applying it everywhere makes that exemption uniform instead of per-layout.

          Horizontal padding is fixed and vertical is fluid: the first has to stay in step
          with CARD_PADDING_X, the second is free to give room back on a short window.
        */
        className="rounded-2xl border border-neutral-200 bg-white px-8 py-[var(--auth-card-pad-y)] shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.13)]"
      >
        {children}
      </div>

      {footer && <div className="mt-[var(--auth-gap-md)] text-center">{footer}</div>}
    </div>
  )

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
    <div className="auth-rhythm relative isolate min-h-screen bg-white">
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
        {/*
          The header exists only to carry the logo on the split layouts below lg, where the
          left column that normally holds it is hidden. At lg and up the logo is in that
          column, and the centred layout (setup-password) shows none at all — it is opened
          from an email by someone already partway through signing up, who does not need to
          be told whose product this is a third time.

          So: rendered only when there is an aside to fall back from, and hidden at lg where
          that aside takes over. Between them the lockup is never on screen twice and never
          absent from a page that wants it. `lg:hidden` also drops it out of the accessibility
          tree rather than just hiding it, so there is only ever one home link.

          relative z-20 is a bug fix, not polish. The scrim behind the aside is a positioned
          element inside main; this header is in-flow and non-positioned, and CSS paints
          in-flow block content before positioned descendants regardless of source order. So
          the scrim's opaque white painted straight over the logo — measured at the wordmark's
          own box, the region came back 255 with 0% ink present, against 10 and 23.75% with
          the scrim removed. Hit testing did not catch it because the scrim is
          pointer-events:none, so elementFromPoint still reported the wordmark on top.
        */}
        {split && (
          <header className="relative z-20 px-5 pt-[var(--auth-pad-head)] sm:px-8 lg:hidden">
            <AuthWordmark />
          </header>
        )}

        <main className="flex flex-1 items-center justify-center px-5 py-[var(--auth-pad-y)] sm:px-8">
          {split ? (
            <div className="w-full max-w-[70rem] lg:grid lg:grid-cols-2 lg:items-center lg:gap-14 xl:gap-20">
              {/*
                Source order is aside then form, which is also the visual order at lg, so
                nothing needs reversing and tab order matches what is on screen. Below lg
                it is display:none rather than reordered — the aside is context, and a
                phone reaching this page wants the form, not four features to scroll past
                first. `hidden` also keeps it out of the accessibility tree there, which
                is correct: it is not content the form depends on.
              */}
              <aside className="hidden lg:block">{aside}</aside>
              {column}
            </div>
          ) : (
            column
          )}
        </main>
      </div>
    </div>
  )
}

export default AuthShell
