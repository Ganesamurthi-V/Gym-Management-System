/**
 * Shared class strings for the /auth forms.
 *
 * These exist because the previous pages each carried their own copy of the same long
 * Tailwind string for every input, and the three copies had already drifted: two used
 * `text-sm`, one used `text-base sm:text-sm`, and the focus ring differed between them.
 * One definition each means a restyle is one edit rather than three.
 *
 * Every greyscale value here is chosen against the character grid behind the surface. A
 * full mark leaves the backdrop at rgb(189) at the grid's 0.26 opacity, and measured
 * against that neutral-700 is 5.52 while neutral-600 is 4.16 — so neutral-700 is the
 * lightest text allowed directly on the surface. Anything lighter must sit on an opaque
 * fill, which is why the placeholder and the inactive tab label are the only things below
 * it.
 */

/** Section heading. Large enough to answer to 3:1, but neutral-950 clears 4.5 anyway. */
export const authHeading = 'text-[26px] font-bold tracking-tight text-neutral-950 sm:text-[30px]'

/** Supporting line under a heading. neutral-700 is the floor over the grid. */
export const authSub = 'mt-2 text-sm text-neutral-700'

/** Field label. */
export const authLabel = 'mb-2 block text-[13px] font-semibold text-neutral-800'

/**
 * Text input.
 *
 * text-base below sm so iOS does not zoom the viewport on focus, which it does for
 * anything under 16px. The white fill is opaque, so the grid never sits behind the value
 * or the placeholder.
 *
 * The focus treatment is a near-black border plus a soft ring rather than the brand blue
 * it replaced. A 2px border at rest means focus changes colour, not geometry, so nothing
 * reflows.
 */
export const authInput =
  'h-12 w-full rounded-xl border-2 border-neutral-200 bg-white px-4 text-base font-medium ' +
  'text-neutral-900 transition-colors duration-150 placeholder:text-neutral-400 ' +
  'focus:border-neutral-900 focus:outline-none focus:ring-4 focus:ring-neutral-900/10 sm:text-sm'

/** Primary action. Near-black rather than the previous #0F172A navy. */
export const authPrimaryButton =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl bg-neutral-950 text-sm ' +
  'font-semibold text-white transition-colors duration-150 hover:bg-neutral-800 ' +
  'focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 ' +
  'focus-visible:ring-offset-2 active:scale-[0.99] disabled:cursor-not-allowed ' +
  'disabled:opacity-50'

/** Secondary action, for the pages that offer two. */
export const authSecondaryButton =
  'flex h-12 w-full items-center justify-center gap-2 rounded-xl border-2 border-neutral-200 ' +
  'bg-white text-sm font-semibold text-neutral-900 transition-colors duration-150 ' +
  'hover:border-neutral-300 hover:bg-neutral-50 focus:outline-none focus-visible:ring-2 ' +
  'focus-visible:ring-neutral-900 focus-visible:ring-offset-2'

/**
 * Inline link.
 *
 * Underlined, and that is the point: with the brand blue gone these are the same colour
 * as the text around them, so the underline is the only thing marking them as links.
 * Removing it would leave colour as no cue at all rather than the sole cue.
 */
export const authLink =
  'font-semibold text-neutral-950 underline decoration-neutral-300 decoration-2 ' +
  'underline-offset-2 transition-colors hover:decoration-neutral-900 focus:outline-none ' +
  'focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 rounded'

/** Panel for grouped secondary content: agreements, notes, the member advisory. */
export const authPanel = 'rounded-xl border border-neutral-200 bg-neutral-50 p-4'

/**
 * The "Or" label between the form and the alternate action.
 *
 * neutral-700, not the neutral-600 it started as. This sits directly on the surface with
 * the grid behind it, where neutral-600 measured 4.25:1 against a 4.5 floor. It read as
 * passing on create-account and failing on login purely because of where the field
 * happened to be at capture, which is the kind of thing a single shared definition stops
 * from drifting back.
 */
export const authDividerLabel =
  'text-[11px] font-semibold uppercase tracking-widest text-neutral-700'
