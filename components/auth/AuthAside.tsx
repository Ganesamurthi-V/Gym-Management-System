import type { LucideIcon } from 'lucide-react'
import { AuthWordmark } from '@/components/auth/AuthWordmark'

/**
 * The left column of the split /auth layout: what the product is, for someone who has
 * landed on sign-in without having read the marketing site.
 *
 * This is a deliberate partial return of something that was removed. The pages used to
 * carry a 55% dark navy panel with a gradient headline and three feature cards, and it
 * was cut because it was selling to someone who had already decided to sign in, and
 * because the markup was copy-pasted across three pages and had drifted between them.
 *
 * What comes back is the content, not the panel. Same surface as the form, same neutral
 * ramp, no border and no edge — it reads as page copy rather than an advertisement bolted
 * to the side. And it is one data-driven component, so the drift that made the old version
 * expensive cannot happen again: adding a feature is an array entry on the page that
 * wants it.
 *
 * Hidden below lg by AuthShell. On a phone the form is the whole job.
 *
 * ── The scrim, and why the type is not bigger instead ────────────────────────────────
 * This column first shipped with the type sitting directly on the grid at the documented
 * contrast floor — 13px neutral-700, which measures 5.52 against the worst backdrop a
 * full grid mark produces — and it was reported as not visible.
 *
 * It was never a contrast-ratio problem. 5.52 clears the 4.5 requirement comfortably. A
 * ratio is computed against a flat backdrop, and this backdrop is not flat: it is a field
 * of small marks and they cross the glyphs. At 13px and regular weight the strokes are
 * about as thin as the marks, so letterforms break up into the texture and the whole block
 * reads as washed out. Passing WCAG and reading well are different questions once there is
 * a pattern behind the type.
 *
 * The first attempt at fixing it went after the type: darker, larger, heavier. That works
 * on paper and was the wrong trade — it inflated the column, weakened the size contrast
 * against the headline, and made a marketing aside shout louder than the form it sits next
 * to. The type scale here is not the problem and should not pay for the background.
 *
 * So the backdrop gets fixed instead, and the type keeps the scale it was designed at. The
 * scrim below is a radial white wash, opaque where the copy sits and falling off to nothing
 * before it reaches any edge: the grid goes quiet under the text and carries on
 * uninterrupted around it. A gradient rather than a filled box on purpose — no border, no
 * corner, no boundary to read as the panel these pages had removed.
 *
 * Measured on the rendered page, sampling the backdrop with the copy hidden over the whole
 * 334,880px column:
 *
 *              darkest pixel   % below 250   neutral-700 at worst pixel
 *   scrim off       191            2.95%              5.64
 *   scrim on        249            0%                 9.85
 *
 * Off, it bottoms out at 191, which is the predicted rgb(189) worst case and confirms the
 * model the floor is derived from. On, nothing in the column falls below 250, so the copy
 * reads as it would on an empty page. Both the shorter member variant and create-account
 * measure the same way.
 *
 * The icons keep their opaque tile regardless. A 1.75px stroke is the thinnest thing on
 * the page and the tiles sit at the column's left edge, where the wash is already falling
 * off.
 */

export interface AuthAsideFeature {
  icon: LucideIcon
  label: string
  desc: string
}

export interface AuthAsideProps {
  heading: string
  sub: string
  features: readonly AuthAsideFeature[]
  /** Optional line under a rule at the bottom. Used for the trial terms. */
  note?: string
}

/**
 * Radial white wash: opaque where the copy is, gone before it reaches an edge. Sized in
 * percentages of the scrim box and centred slightly left of the text block, because the
 * copy is ragged-right and its mass sits left.
 *
 * ── An inline style, not a Tailwind arbitrary value ─────────────────────────────────
 * This started life as bg-[radial-gradient(...)] assembled from a few concatenated string
 * literals, to keep the stop list readable. It silently did nothing. Tailwind generates
 * utilities by scanning source text for complete class names; it does not evaluate
 * expressions, so a class built with `+` is never seen and no rule is emitted. The element
 * rendered, reported the class in its className, and computed background-image: none.
 *
 * It was worse than a no-op, because the grid animates. Screenshots taken to check the
 * scrim differed from each other — marks fell in different places from frame to frame —
 * and that variation read convincingly as the scrim working, then not working, then
 * working. Three rounds of tuning were adjusting a gradient that was never applied. What
 * caught it was asserting on computed background-image rather than looking at the result.
 *
 * An inline style is the right tool here regardless: this is one long computed value used
 * once, it needs no variants, and it cannot be broken by how the string is formatted.
 *
 * ── Geometry ────────────────────────────────────────────────────────────────────────
 * The plateau is fully opaque and reaches past the text block; the falloff happens outside
 * it, in the gutter between the columns and above and below the copy, where there is
 * nothing to read. Two things drive the numbers:
 *
 *   - A stop is placed by NORMALISED ELLIPTICAL distance, sqrt((dx/rx)² + (dy/ry)²), not
 *     per axis. The bottom-right corner of the copy sits ~46% of the way out horizontally
 *     and ~50% vertically, which looks comfortably inside a 55% plateau but combines to
 *     ~68%. Anything short of that leaves the far corner of the lower descriptions in the
 *     fade.
 *   - The plateau is 1.0 rather than 0.97. Mark density at a given point changes as the
 *     grid animates, and a few percent of a dark mark is still visible behind 13px type on
 *     the frames where a mark lands there. At 1.0 the backdrop under the copy is white on
 *     every frame, which is also why the type needs no compensation of its own and the
 *     original scale could be restored.
 */
/*
  The colour comes from --c-grid-scrim rather than a literal white so it follows the theme.
  Hardcoded it bleached this entire column on a dark page and took the headings with it — an
  inline gradient is invisible to Tailwind, so no utility could have corrected it.
*/
const SCRIM_GRADIENT =
  'radial-gradient(85% 75% at 42% 50%, ' +
  'rgb(var(--c-grid-scrim) / 1) 0%, ' +
  'rgb(var(--c-grid-scrim) / 1) 72%, ' +
  'rgb(var(--c-grid-scrim) / 0.6) 88%, ' +
  'rgb(var(--c-grid-scrim) / 0) 100%)'

export function AuthAside({ heading, sub, features, note }: AuthAsideProps) {
  return (
    <div className="relative max-w-[30rem]">
      {/*
        Inset negatively so the falloff starts outside the text rather than across it, and
        painted before the copy in source order — no negative z-index needed, which avoids
        the stacking-context trap documented in AuthShell.
      */}
      <div
        aria-hidden="true"
        className="pointer-events-none absolute -inset-x-24 -inset-y-28"
        style={{ backgroundImage: SCRIM_GRADIENT }}
      />

      <div className="relative">
        {/*
          The logo sits inside the scrimmed wrapper rather than above it, so the wash clears
          the grid behind the lockup too. Its strokes are solid enough to survive the marks,
          but leaving the one branded element as the only thing on a live texture would look
          like an oversight.

          gap-sm rather than gap-lg to the headline: the headline is the start of the column's
          content and the logo reads as a label on it, not a separate block. The tight gap also
          helps pay for the height the lockup adds, which matters because the shell's header is
          standing down at this breakpoint to make room for it.

          AuthShell renders the same component in the page header below lg, where this whole
          column is hidden.
        */}
        <AuthWordmark className="mb-[var(--auth-gap-sm)]" />

        {/*
          balance keeps the two- or three-word tail of a headline from stranding on its own
          line, which at this size is the difference between composed and unfinished. It is
          progressive — browsers without it fall back to normal wrapping.
        */}
        <h2 className="text-[length:var(--auth-aside-h2)] font-bold leading-[1.12] tracking-tight text-neutral-950 [text-wrap:balance]">
          {heading}
        </h2>

        <p className="mt-[var(--auth-gap-sm)] max-w-[34rem] text-[0.9375rem] leading-relaxed text-neutral-700">
          {sub}
        </p>

        <ul className="mt-[var(--auth-gap-lg)] space-y-[var(--auth-gap-md)]">
          {features.map(({ icon: Icon, label, desc }) => (
            <li key={label} className="flex gap-4">
              {/*
                The tile stays opaque even with the scrim behind it. These strokes are the
                thinnest marks in the column and the tiles sit at its left edge, where the
                wash is already falling off.
              */}
              <span
                aria-hidden="true"
                className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-neutral-200 bg-surface shadow-sm"
              >
                <Icon className="h-[1.125rem] w-[1.125rem] text-neutral-800" strokeWidth={1.75} />
              </span>
              <div className="pt-0.5">
                <h3 className="text-sm font-semibold text-neutral-900">{label}</h3>
                <p className="mt-1 text-[0.8125rem] leading-relaxed text-neutral-700">{desc}</p>
              </div>
            </li>
          ))}
        </ul>

        {note && (
          /*
            Dropped entirely under 680px of viewport height. Fluid spacing closes the gaps
            but cannot remove content, and below that height the column still does not fit;
            the trial terms are the one line here that carries no information the visitor
            needs to sign in, so they are what goes. The same wording is on the landing page
            and, for someone actually signing up, in the create-account form itself.
          */
          <p className="mt-[var(--auth-gap-lg)] border-t border-neutral-200 pt-[var(--auth-gap-md)] text-xs font-medium text-neutral-700 [@media(max-height:680px)]:hidden">
            {note}
          </p>
        )}
      </div>
    </div>
  )
}

export default AuthAside
