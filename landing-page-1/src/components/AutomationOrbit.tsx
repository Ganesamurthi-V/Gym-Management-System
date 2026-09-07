import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import type { LucideIcon } from 'lucide-react';
import { prefersReducedMotion } from '../lib/useReveal';

// Idempotent, and stated here rather than relying on another module's top-level
// call having run first — that would make this component depend on import order.
gsap.registerPlugin(ScrollTrigger);

/**
 * Amplitude of the sway, in degrees either side of rest.
 *
 * The orbit sways rather than revolving, and that is forced by the phone's
 * proportions. A chip sits ~250px from centre; the phone is 330x537, so ±165
 * half-width. Anything whose x falls inside that band is behind the device, which
 * on a full revolution is 46% of the cycle — the chips spent most of their time
 * invisible. Clearing the phone over the top and bottom instead would need a
 * vertical radius past 416px, which is far more room than the section has.
 *
 * 20 is the largest amplitude where all three chip centres stay outside the
 * phone's half-width for the whole sway. The binding chip is the welcome one,
 * repositioned in WhatsAppSection to buy the headroom this needs.
 */
const SWING_DEG = 20;

/** Degrees per second while scrolling, before the velocity boost multiplies it. */
const BASE_DEG_PER_SEC = 9;

/**
 * Idle legs, degrees per second. Clockwise is the faster of the two on purpose:
 * the sway has to turn round somewhere to keep the chips out from behind the
 * phone, so making the return leg half the speed means roughly two thirds of the
 * idle cycle is spent travelling clockwise and it reads as a clockwise drift
 * rather than an even back-and-forth.
 */
const IDLE_CW_DEG_PER_SEC = 9;
const IDLE_RETURN_DEG_PER_SEC = 4.5;

/**
 * Scroll velocity below this (px/sec) does not set a direction. Without it, the
 * tail of Lenis's easing dithers around zero and flips the spin on noise.
 */
const SCROLL_DEADZONE = 40;

/** Boost above which we treat the page as actively scrolling. */
const SCROLLING_ABOVE = 1.08;

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

    // The angle is driven directly rather than through a sine of a phase. A sine
    // reverses on its own schedule, so "which way is it going" was never under
    // scroll's control — and direction is the whole point here.
    //
    // legDir is the current travel direction: +1 clockwise, -1 anti-clockwise. It
    // flips when the sway reaches either end, and scrolling overrides it outright.
    let angle = 0;
    let legDir = 1;
    let scrollSign = 0;
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
          // Signed now. getVelocity is positive when the page scrolls down, and
          // down should drive the orbit anti-clockwise, so the sign inverts.
          const velocity = self.getVelocity();
          boost = Math.min(1 + Math.abs(velocity) * BOOST_PER_PX_PER_SEC, MAX_BOOST);
          if (Math.abs(velocity) > SCROLL_DEADZONE) {
            scrollSign = velocity > 0 ? -1 : 1;
          }
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

      const scrolling = boost > SCROLLING_ABOVE && scrollSign !== 0;

      // Scroll wins over the idle leg, and leaves legDir behind it so that when
      // scrolling stops the drift carries on the same way rather than jumping.
      if (scrolling) legDir = scrollSign;

      const rate = scrolling
        ? BASE_DEG_PER_SEC * boost
        : legDir > 0
          ? IDLE_CW_DEG_PER_SEC
          : IDLE_RETURN_DEG_PER_SEC;

      // Ease the last stretch into each end, but only when travelling towards it.
      // Driving the angle directly means the turnaround would otherwise be a hard
      // velocity flip; this rounds it off without ever fully stalling.
      const travellingOutward = Math.sign(angle) === legDir;
      const approach = travellingOutward ? 1 - (Math.abs(angle) / SWING_DEG) ** 2 : 1;
      const eased = 0.3 + 0.7 * Math.max(0, approach);

      angle += rate * eased * legDir * dt;

      // Clamp and turn round. This is what keeps every chip clear of the phone,
      // so it holds even while scrolling: park at the end rather than let a fast
      // scroll carry a chip behind the bezel.
      if (angle >= SWING_DEG) {
        angle = SWING_DEG;
        legDir = -1;
      } else if (angle <= -SWING_DEG) {
        angle = -SWING_DEG;
        legDir = 1;
      }

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
      /* -z-10 on the whole assembly, not just the arc. The sway is bounded so the
         chips stay clear of the phone, but they pass close to its edge at the ends
         of their travel, and a chip grazing the bezel should tuck behind it rather
         than ride over the message. The arc genuinely does cross the phone and
         needs to be occluded there.

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
