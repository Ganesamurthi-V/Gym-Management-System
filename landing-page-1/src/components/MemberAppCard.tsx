import { useEffect, useRef } from 'react';
import { Check } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ACCENT_GLOW } from '../lib/borderGlowPresets';
import { prefersReducedMotion } from '../lib/useReveal';
import BorderGlow from './BorderGlow';

// Idempotent, and stated here rather than relying on useReveal's module-level
// call having run first — that would make this component depend on import order.
gsap.registerPlugin(ScrollTrigger);

/** How far the phone runs past the card's bottom edge, in px. */
const BLEED = 72;

/**
 * Scroll parallax for the phone, in px, from its resting position.
 *
 * Both bounds are pinned by the composition rather than picked for feel:
 *
 * RISE_TO is capped by the 28px gap above the phone well (the well's mt-7).
 * Lift the phone further than that and its top slides under the paragraph,
 * which paints over the text — the phone comes later in the flow. 20 leaves 8px
 * of clearance.
 *
 * RISE_FROM is bounded by BLEED. Pushing the phone *down* only buries more of
 * it in the crop, so this is free to be the larger of the two; the pair gives
 * 60px of travel, enough to read as movement without either end breaking.
 */
const RISE_FROM = 40;
const RISE_TO = -20;

/**
 * Member app bento card: centred copy with the phone below it, cropped by the
 * card's bottom edge.
 *
 * Spans both grid rows from md up, so it reads as a tall portrait column beside
 * the shorter cards — the proportion the phone composition needs. A wide card
 * would leave the phone stranded in empty blue.
 */
export function MemberAppCard() {
  const wellRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Bail rather than scrub a zero-distance tween. No transform means the phone
    // sits at its resting position, which is the correct static composition.
    if (prefersReducedMotion()) return;

    const well = wellRef.current;
    if (!well) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        well,
        { y: RISE_FROM },
        {
          y: RISE_TO,
          // Linear: the scroll position *is* the timeline, so an ease would make
          // the phone lag or run ahead of the pointer instead of tracking it.
          ease: 'none',
          scrollTrigger: {
            trigger: well,
            start: 'top bottom',
            // Settled by the time the card reaches the middle of the screen, so
            // the phone is at its highest while the card is actually being read
            // rather than still drifting as it leaves.
            end: 'center center',
            scrub: true,
          },
        }
      );
    });

    return () => ctx.revert();
  }, []);

  return (
    <div className="reveal grid md:row-span-2">
      {/* overflow-hidden is load-bearing: it crops the phone against the card's
          rounded bottom edge so the mock bleeds off rather than floating. No
          bottom padding, so the phone well runs to the card's edge.

          It rides on contentClassName rather than the card itself. BorderGlow's
          halo is a child inset by -40px, so clipping the host would swallow the
          bloom that every other card in the grid has. The content wrapper
          already carries rounded-[inherit], so the crop still follows the
          card's corner radius.

          A BorderGlow rather than a plain article so the hover matches the white
          cards: the rim tracks the pointer instead of the border swapping whole. */}
      <BorderGlow
        as="article"
        className="glow-card-accent"
        contentClassName="items-center overflow-hidden px-5 pt-7 text-center"
        {...ACCENT_GLOW}
      >
        <h3 className="text-[26px] font-medium leading-[1.1] tracking-tight text-accent-ink">
          Your members get
          <br />
          their own app.
        </h3>

        {/* Trimmed from three clauses to two. The old copy listed membership,
            attendance and the gym card — all three of which the phone below is
            already showing. */}
        <p className="mt-3 max-w-[280px] text-[13px] leading-relaxed text-accent-ink/80">
          A digital gym card on their own phone. No app store.
        </p>

        {/* Phone well. The frame inside is sized BLEED taller than this box, so the
            crop stays constant however tall the grid makes the card — no fixed
            phone height to keep in sync with the row heights.

            No overflow-hidden here, deliberately. It used to do the bottom crop,
            but it clips both axes, so the moment the parallax lifts this box the
            phone's top bezel and notch would be sheared off against the well's
            top edge. The card's own overflow-hidden already crops at the same
            line — and against the rounded corner rather than a square one — so
            dropping it changes nothing at rest and frees the phone to rise.

            The 3px of horizontal padding stays: it sets the frame's real width,
            and removing it would widen the phone by 6px. */}
        <div
          ref={wellRef}
          className="mt-7 h-[330px] w-[256px] px-[3px] md:h-auto md:min-h-0 md:flex-1"
        >
          <PhoneMock />
        </div>
      </BorderGlow>
    </div>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * CSS-built iPhone frame. Drawn rather than shipped as an image so it stays
 * crisp at any DPI and the screen inside can use live tokens.
 *
 * role="img" collapses the mock to a single label for assistive tech — without
 * it a screen reader reads illustrative member data as though it were page
 * content.
 */
function PhoneMock() {
  return (
    <div
      role="img"
      aria-label="The GymFlow member app running on a phone. The screen shows the member's membership as active with 24 days left, above their digital member card, which carries a QR code the gym scans at the door."
      className="relative"
      style={{ height: `calc(100% + ${BLEED}px)` }}
    >
      {/* Side buttons — small dark ticks against the card, purely decorative */}
      <span
        aria-hidden
        className="absolute -left-[2.5px] top-[88px] h-10 w-[3px] rounded-l-sm bg-[#0b0b0b]"
      />
      <span
        aria-hidden
        className="absolute -right-[2.5px] top-[110px] h-[60px] w-[3px] rounded-r-sm bg-[#0b0b0b]"
      />

      {/* Bezel. Screen radius is bezel radius minus the 10px band, which keeps
          the two roundings concentric. */}
      <div className="relative h-full rounded-[41px] bg-[#0b0b0b] p-[10px] shadow-[0_26px_50px_-22px_rgba(0,0,0,0.5)]">
        <div className="device-screen relative flex h-full flex-col overflow-hidden rounded-[31px] px-4 pt-12 text-left">
          <span
            aria-hidden
            className="absolute left-1/2 top-2.5 h-[21px] w-[80px] -translate-x-1/2 rounded-full bg-[#0b0b0b]"
          />

          <p className="text-[10.5px] font-medium text-[var(--dev-muted)]">
            Welcome back, Karthik
          </p>

          <p className="mt-2 text-[19px] font-semibold leading-[1.14] tracking-tight">
            Your membership
            <br />
            is active.
          </p>

          <p className="mt-2 text-[10.5px] leading-relaxed text-[var(--dev-muted)]">
            Quarterly plan, 24 days left.
          </p>

          {/* Digital member card. Grows to the bottom of the frame, so it always
              runs past the crop rather than leaving blank screen below it. The
              bottom padding parks the meta line just above the crop line, which
              is what makes the card read as continuing off-screen. */}
          <div
            className="mt-4 flex flex-1 flex-col rounded-2xl bg-card-primary p-4"
            style={{ paddingBottom: `${BLEED + 20}px` }}
          >
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block font-mono text-[9px] uppercase tracking-wider text-accent-ink/80">
                  Member card
                </span>
                <span className="mt-1 block truncate text-[15px] font-semibold text-accent-ink">
                  Karthik R.
                </span>
              </span>
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent-ink/15">
                <Check className="h-3.5 w-3.5 text-accent-ink" strokeWidth={3} />
              </span>
            </div>

            {/* The QR the real card carries — app/m/membership/card encodes the
                member code and renders it in #1e40af on white, so this is a
                genuine scannable code for GF2049, generated once into an SVG
                rather than pulled in with a QR library the landing page would
                otherwise not need.

                my-auto here does the work the footer's mt-auto used to: the free
                space splits evenly above and below this block, which centres the
                QR between the name and the code while still pushing the footer
                down onto the crop line. */}
            <span className="my-auto flex justify-center">
              <span className="rounded-xl bg-accent-ink p-2">
                <img
                  src="/member-qr.svg"
                  alt=""
                  aria-hidden
                  width={88}
                  height={88}
                  loading="lazy"
                  decoding="async"
                  /* Smaller below md, for crop clearance rather than for spacing.
                     The well is a fixed 330px there, which is less than the card
                     needs, so the card sits at its min-content height and
                     overflows past the crop — my-auto has no free space to
                     distribute and every px of QR pushes the code line closer to
                     being cut. At 88 the line cleared the crop by 10px; at 64 it
                     clears by ~34. Growing the well instead is the wrong lever:
                     because the card is floored, 50px of extra page height bought
                     only 10px of slack. Separation here comes from the tile's own
                     padding, not from the margins. */
                  className="block h-16 w-16 md:h-[88px] md:w-[88px]"
                />
              </span>
            </span>

            <p className="font-mono text-[9px] uppercase tracking-wider text-accent-ink/80">
              GF · 2049 · Active
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
