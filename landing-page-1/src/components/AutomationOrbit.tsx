import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { LucideIcon } from 'lucide-react';
import { prefersReducedMotion } from '../lib/useReveal';

// Idempotent, and stated here rather than relying on another module's top-level
// call having run first — that would make this component depend on import order.
gsap.registerPlugin(ScrollTrigger);

/**
 * Resting rotation, degrees per second. ~40s for a full revolution: slow enough
 * to read as a drift rather than a spin, fast enough to be visible if you watch
 * a chip for a couple of seconds.
 */
const BASE_DEG_PER_SEC = 9;

/**
 * How much scroll speed adds. Scroll velocity arrives in px/sec, so dividing by
 * 260 means a brisk ~2000px/sec flick lands around 8x — the ceiling.
 */
const BOOST_PER_PX_PER_SEC = 1 / 260;
const MAX_BOOST = 8;

/**
 * How quickly the boost bleeds back to 1x once scrolling stops. 2.6/sec puts it
 * ~95% of the way home in about a second, so it reads as coasting to a stop
 * rather than snapping.
 */
const BOOST_DECAY_PER_SEC = 2.6;

/**
 * Ceiling on a single frame's delta, in ms. main.tsx calls
 * gsap.ticker.lagSmoothing(0), so after a backgrounded tab the ticker can hand
 * over a delta of several seconds. Unclamped, the orbit would jump a third of a
 * revolution the moment the tab is refocused.
 */
const MAX_FRAME_MS = 50;

/** Where a chip sits, as offsets from the phone's own box. */
interface OrbitChip {
  icon: LucideIcon;
  label: string;
  /** Tailwind position utilities, so each chip can be nudged independently. */
  position: string;
  /** Point on the arc this chip answers to, in the SVG's own coordinates. */
  dot: { x: number; y: number };
}

/**
 * Decorative arc and icon chips orbiting the phone mock.
 *
 * Purely illustrative, hence aria-hidden: the three automations it stands for are
 * already listed in prose in the column beside it, and the icons here are the
 * same ones that list uses, so the echo is deliberate rather than a second source
 * of truth.
 *
 * Only rendered from xl up, and that is a hard constraint rather than taste. The
 * chips hang ~100px outside the phone, and at lg the right-hand grid cell has
 * only ~61px of slack either side of a 330px phone — they would sit on top of the
 * copy column. xl is the first breakpoint with room.
 *
 * The arc is absolutely positioned behind the phone and larger than it, so the
 * phone occludes the segment that passes over it and the whole thing reads as a
 * ring around the device rather than a line drawn on top of it.
 *
 * Motion is two layers. Scroll drives the swing of the whole assembly around the
 * phone. On top of that the ring, the chips and the dots each run their own idle
 * period and easing (see .orbit-* in index.css), none matching the phone's, and
 * all staggered by NEGATIVE delays so the cycles are already in progress on first
 * paint — a positive delay would park them at one pose for the first seconds,
 * which is the lockstep look being avoided.
 */
export function AutomationOrbit({ chips }: { chips: readonly OrbitChip[] }) {
  const swingRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    // Unset, --orbit-angle falls back to 0deg, which is the composed rest pose.
    if (prefersReducedMotion()) return;

    const swing = swingRef.current;
    if (!swing) return;

    // Rotation accumulates on the ticker rather than being scrubbed to scroll
    // position. A scrub maps angle to *where* the page is, so the orbit freezes
    // the instant scrolling stops and unwinds on the way back up. Here scroll
    // only ever modulates the speed of a rotation that never stops.
    let angle = 0;
    let boost = 1;
    let inView = false;

    const ctx = gsap.context(() => {
      ScrollTrigger.create({
        // The phone's scene, not this element: below xl the orbit is
        // display:none, and a zero-height trigger measures nonsense.
        trigger: swing.parentElement ?? swing,
        start: 'top bottom',
        end: 'bottom top',
        onToggle: self => {
          inView = self.isActive;
        },
        onUpdate: self => {
          // Unsigned on purpose: scrolling either way speeds the orbit up rather
          // than reversing it, so there is no direction flip to reconcile with
          // the resting drift.
          const velocity = Math.abs(self.getVelocity());
          boost = Math.min(1 + velocity * BOOST_PER_PX_PER_SEC, MAX_BOOST);
        },
      });
    });

    const tick = (_time: number, deltaMs: number) => {
      const dt = Math.min(deltaMs, MAX_FRAME_MS) / 1000;

      // Decays whether or not the section is on screen, so returning to it never
      // finds a stale boost still spent.
      if (boost > 1.001) {
        boost += (1 - boost) * Math.min(1, BOOST_DECAY_PER_SEC * dt);
      }

      // No style writes while it cannot be seen. The angle stops advancing too,
      // which is invisible and cheaper than spinning an offscreen element.
      if (!inView) return;

      // Wrapped, so a long session cannot grow the value until float precision
      // starts to show. A 360 wrap is visually a no-op.
      angle = (angle + BASE_DEG_PER_SEC * boost * dt) % 360;
      swing.style.setProperty('--orbit-angle', `${angle.toFixed(2)}deg`);
    };

    gsap.ticker.add(tick);

    return () => {
      gsap.ticker.remove(tick);
      ctx.revert();
    };
  }, []);

  return (
    <div
      ref={swingRef}
      aria-hidden
      /* -z-10 sits on the whole assembly, not just the arc as it used to. Now
         that rotation is continuous the chips travel the full circle, and the two
         at the smaller radii pass inside the phone's silhouette near the top and
         bottom of their arc. Behind the opaque bezel they slide out of view and
         re-emerge, which is what an orbit should do; in front they would sit on
         top of the message.

         Contained rather than escaping to the page: .phone-scene sets
         `perspective`, which establishes a stacking context. */
      className="orbit-swing pointer-events-none absolute inset-0 -z-10 hidden xl:block"
    >
      {/* Sized past the phone's box on every side and centred on it, which is
          what lets the ellipse read as an orbit.

          The centring translate sits on this wrapper, not on the svg: .orbit-ring
          animates `transform`, and its keyframes would overwrite the translate
          and drop the ring out of centre. */}
      <div className="absolute left-1/2 top-1/2 h-[680px] w-[640px] -translate-x-1/2 -translate-y-1/2">
        <svg
          viewBox="0 0 640 680"
          fill="none"
          /* currentColor comes from a token, so the gradient stops only shape the
             fade and the theme decides how hard the line is carried. */
          className="orbit-ring h-full w-full overflow-visible text-[var(--wa-orbit-line)]"
        >
          <defs>
            {/* Faded at the top and bottom so the ring dissolves instead of
                ending on a hard stroke cap. */}
            <linearGradient id="orbit-fade" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="currentColor" stopOpacity="0" />
              <stop offset="26%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="74%" stopColor="currentColor" stopOpacity="1" />
              <stop offset="100%" stopColor="currentColor" stopOpacity="0" />
            </linearGradient>
          </defs>

          {/* 238x268 hugs a 330x537 phone: wide enough that the chips straddle
              the curve, tight enough that it still reads as a ring around the
              device rather than an unrelated circle behind it. */}
          <ellipse
            cx="320"
            cy="340"
            rx="238"
            ry="268"
            stroke="url(#orbit-fade)"
            strokeWidth="1.25"
          />

          {chips.map((chip, i) => (
            <circle
              key={chip.label}
              cx={chip.dot.x}
              cy={chip.dot.y}
              r="4"
              fill="currentColor"
              className="orbit-dot text-whatsapp"
              /* Thirds of the 4.5s period, so no two dots peak together. */
              style={{ animationDelay: `${i * -1.5}s` }}
            />
          ))}
        </svg>
      </div>

      {chips.map((chip, i) => {
        const Icon = chip.icon;
        return (
          /* Two spans per chip because three transforms want the same property:
             the swing above rotates this one into place, .orbit-counter undoes
             that rotation so the icon stays upright, and .orbit-chip's keyframes
             own the idle bob. */
          <span key={chip.label} className={`orbit-counter absolute ${chip.position}`}>
            <span
              className="orbit-chip grid h-[52px] w-[52px] place-items-center rounded-2xl"
              /* Thirds of the 9s period. */
              style={{ animationDelay: `${i * -3}s` }}
            >
              <Icon className="h-5 w-5 text-whatsapp-ink" />
            </span>
          </span>
        );
      })}
    </div>
  );
}

export type { OrbitChip };
