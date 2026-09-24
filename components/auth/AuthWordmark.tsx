import Image from 'next/image'

/**
 * The gymflow lockup as a link home, for the /auth pages.
 *
 * It exists as its own component because it is rendered in two places that are never both
 * visible: inside AuthAside at the top of the left column, and in AuthShell's header for the
 * layouts where that column is not on screen. See AuthShell for which applies when. One
 * definition means the two placements cannot drift apart in size, alt text or focus
 * treatment — which is exactly what happened to the old dark panel's logo across three
 * pages.
 *
 * ── The asset ───────────────────────────────────────────────────────────────────────
 * This is the landscape lockup, carrying the mark and the wordmark as one image. It replaced
 * a square mark plus a hand-set "gymflow" span sitting beside it, so the spacing, weight and
 * letterforms are now the brand's rather than whatever Tailwind classes approximated them.
 *
 * The .png rather than the .webp of the same lockup that landing-page-1 uses. Next's image
 * optimizer is on — there is no `images` block in next.config.mjs, so `formats` defaults to
 * WebP — which means this is delivered to the browser as WebP whatever the source format is.
 * The extension here only decides what the optimizer reads, and on that the PNG wins twice:
 * it is already in this app's public/ and already used by ShellGuard, and at 750x333 it has
 * nearly twice the resolution of the 400x178 webp to optimize down from. Copying the webp in
 * would add a second copy of one logo to keep in sync and save nothing over the wire.
 *
 * ── Size ────────────────────────────────────────────────────────────────────────────
 * Intrinsic 750x333. The width/height props are 180x80, which holds that ratio to within
 * 0.1% and is the largest size this renders at; CSS then drives the real height from
 * --auth-logo-h and lets the width follow, so the props serve as the aspect ratio and the
 * upper bound for the srcset Next generates.
 *
 * The size has been up three times, and the reason it kept looking small is worth recording.
 * It first matched the 28px height of the square mark it replaced, which left the brand name
 * smaller than the 15px text that used to sit beside it — the lockup sets its wordmark small
 * relative to its own full height, so matching heights with a square mark undersells it.
 * Then it matched that old mark-plus-text footprint at 99x44, which suited a corner of the
 * page but read as undersized once it moved into the left column with a 38px headline beneath
 * it. 144x64 was closer. At 180x80 it reads as the column's masthead, which is what it is
 * now that it is no longer tucked in a page corner.
 *
 * It is in the rhythm rather than fixed because at full size this is the largest single block
 * in the column, and on its own it was enough to put login at 1280x720 and setup-password at
 * 1024x600 back into a scroll. It holds 80px from roughly 900px tall upward and tapers below
 * that — see the two stops in globals.css and why one clamp could not cover both.
 *
 * The blue is the one hue left anywhere on these pages. Everything decorative was drained to
 * greyscale, but a logo is not decoration — it is the brand's own artwork, and recolouring it
 * to fit a page style is not a call a stylesheet gets to make.
 */

const LOGO = '/logo_landspace_without_bg.png'

export function AuthWordmark({ className }: { className?: string }) {
  return (
    <a
      href="/"
      className={`inline-flex rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-neutral-900 focus-visible:ring-offset-2 ${className ?? ''}`}
    >
      {/*
        alt carries the brand name rather than being empty: the image is the only thing inside
        the link, so its alt becomes the link's accessible name — "go to gymflow". The previous
        markup could use an empty alt on a decorative mark because an adjacent span supplied
        the text, and that span is gone.

        priority because it is above the fold on every /auth page and weighs a couple of KB
        once optimized; lazy-loading it only buys a visible pop-in on the brand.
      */}
      <Image
        src={LOGO}
        alt="gymflow"
        width={324}
        height={144}
        priority
        /*
          Height from the token, width derived from the 180x80 ratio above. Both dimensions
          are accounted for, so the image cannot be stretched and Next raises no
          aspect-ratio warning.

          It has to be a token and not a plain utility. This briefly read `h-19`, which is
          not a class Tailwind generates — the default spacing scale goes 16 then 20, with
          no 18 or 19 — so no rule was emitted, the height silently fell back to the height
          attribute, and the responsive taper was gone with it. Worth remembering that a
          class name appearing in the markup is not evidence that any CSS exists for it.
        */
        className="h-[var(--auth-logo-h)] w-auto"
      />
    </a>
  )
}

export default AuthWordmark
