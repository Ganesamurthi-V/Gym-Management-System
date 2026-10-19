import { useEffect, useRef } from 'react';
import { Activity, BatteryFull, CheckCircle2, CreditCard, Dumbbell, Flame, QrCode, Signal } from 'lucide-react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { ACCENT_GLOW } from '../lib/borderGlowPresets';
import { prefersReducedMotion } from '../lib/useReveal';
import BorderGlow from './BorderGlow';

// Idempotent, and stated here rather than relying on useReveal's module-level
// call having run first — that would make this component depend on import order.
gsap.registerPlugin(ScrollTrigger);

/** The four tiles of the real member Home, in the app's order. */
const QUICK_ACTIONS = [
  { label: 'Plan', icon: CreditCard },
  { label: 'Visits', icon: Activity },
  { label: 'Workout', icon: Dumbbell },
  { label: 'My Card', icon: QrCode },
] as const;

/** How far the phone runs past the card's bottom edge, in px. */
const BLEED = 0;

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
const RISE_FROM = 4;
const RISE_TO = -4;

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
        contentClassName="items-center overflow-hidden px-5 pt-5 text-center"
        {...ACCENT_GLOW}
      >
        <h3 className="text-[22px] font-medium leading-[1.1] tracking-tight text-accent-ink">
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
          className="mt-5 h-[470px] w-[256px] px-[3px] pb-6 md:h-auto md:min-h-0 md:flex-1"
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
      aria-label="The GymFlow member app Home screen on a phone. It greets the member, shows an active membership with 24 days left, a 12-day attendance streak, a weekly goal ring at 3 of 5 days, and quick actions for plan, visits, workout and member card."
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
        <div className="device-screen relative flex h-full flex-col overflow-hidden rounded-[31px] px-4 pt-10 text-left">
          <span
            aria-hidden
            className="absolute left-1/2 top-2.5 h-[21px] w-[80px] -translate-x-1/2 rounded-full bg-[#0b0b0b]"
          />

          {/* Status bar either side of the island, and a home-indicator line along the bottom.
              The bottom offset clears the BLEED crop (plus the bezel), so the bar
              sits on the visible part of the screen instead of under the card edge. */}
          <span aria-hidden className="absolute left-5 top-[11px] text-[10px] font-semibold text-[#0f172a]">
            9:41
          </span>
          <span
            aria-hidden
            className="absolute right-4 top-[11px] flex items-center gap-1 text-[9px] font-semibold text-[#0f172a]"
          >
            <Signal className="h-3 w-3" strokeWidth={2.5} />
            87%
            <BatteryFull className="h-3.5 w-3.5" />
          </span>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 z-10 flex items-start justify-center border-t border-[#e2e8f0] bg-white pt-1"
            style={{ height: '28px' }}
          >
            <span className="h-1 w-20 rounded-full bg-[#0f172a]/80" />
          </span>

          {/* A faithful, trimmed copy of the real member Home (app/m/home): greeting,
              membership status banner, streak and weekly-goal cards, quick actions.
              Colours are the app's own light-theme values (emerald status, slate text,
              brand-blue goal ring), set literally because the device screen stays
              light whatever theme the landing page is in. */}
          <div className="-mx-4 flex-1 bg-[#f8fafc] px-3.5 pt-1">
            <p className="text-[10px] font-medium text-[#64748b]">Welcome back,</p>
            <p className="text-[17px] font-bold leading-tight tracking-tight text-[#0f172a]">Karthik</p>
            <p className="mt-0.5 text-[9px] text-[#94a3b8]">Iron Temple Fitness</p>

            <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-[#a7f3d0] bg-[#ecfdf5] p-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/70 text-[#059669]">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-[#059669]">Active · 24 days left</span>
                <span className="block truncate text-[9px] text-[#64748b]">Quarterly plan · expires 12 Nov 2026</span>
              </span>
              <span className="text-[#cbd5e1]">›</span>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[#e2e8f0] bg-white p-2.5">
                <p className="flex items-center gap-1 text-[8px] font-bold uppercase tracking-widest text-[#94a3b8]">
                  <Flame className="h-3 w-3 text-[#f97316]" />
                  Streak
                </p>
                <p className="mt-1 text-[20px] font-black leading-none text-[#0f172a]">
                  12 <span className="text-[9px] font-semibold text-[#64748b]">days</span>
                </p>
                <p className="mt-1 text-[8.5px] font-semibold text-[#059669]">Checked in today</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[#e2e8f0] bg-white p-2.5">
                <span className="relative h-9 w-9 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
                    <circle cx="18" cy="18" r="14.5" fill="none" strokeWidth="4" stroke="#f1f5f9" />
                    <circle
                      cx="18"
                      cy="18"
                      r="14.5"
                      fill="none"
                      strokeWidth="4"
                      strokeLinecap="round"
                      stroke="#2563eb"
                      strokeDasharray="91.1"
                      strokeDashoffset="36.4"
                    />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-[9px] font-black text-[#0f172a]">
                    3/5
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[8px] font-bold uppercase tracking-widest text-[#94a3b8]">Goal</span>
                  <span className="block text-[9px] font-bold leading-snug text-[#334155]">2 more days</span>
                </span>
              </div>
            </div>

            <p className="mt-2.5 text-[10px] font-semibold text-[#334155]">Quick actions</p>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="flex flex-col items-center gap-1 rounded-xl border border-[#e2e8f0] bg-white py-2"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-[#eff6ff] text-[#2563eb]">
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-[8px] font-semibold text-[#475569]">{label}</span>
                </span>
              ))}
            </div>

            <div className="mt-2.5 rounded-xl bg-gradient-to-br from-[#3b82f6] to-[#1d4ed8] p-3 text-white">
              <p className="text-[8px] font-bold uppercase tracking-widest text-[#dbeafe]">Iron Temple Fitness</p>
              <p className="mt-0.5 text-[12px] font-bold">Your fitness journey</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
