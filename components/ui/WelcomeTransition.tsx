'use client'

import { useState, useEffect } from 'react'
import { AsciiBackdrop } from '@/components/ui/AsciiBackdrop'

/**
 * The full-screen hand-off shown between a successful sign-in and the dashboard, while the
 * next route is prefetched behind it.
 *
 * ── Why it looks like this ──────────────────────────────────────────────────────────
 * It used to be a dark navy field with two blurred colour orbs, thirty drifting sparkles in
 * five hues, an emerald gradient check and a brand-blue-to-cyan gradient on the name. That
 * was built against the old auth pages, which were themselves dark navy. Those pages are
 * now a white surface with a character grid and greyscale type, so this screen had become
 * the one place in the flow that flashed to a different design — and it flashed at the worst
 * possible moment, immediately after the click, from white to near-black and back to the
 * white dashboard.
 *
 * So it takes the same surface, the same grid and the same greyscale ramp as /auth. The
 * point is that signing in should not look like leaving the page you were on.
 *
 * ── Colour ──────────────────────────────────────────────────────────────────────────
 * The check tile is near-black rather than emerald, which is a departure from the rule
 * followed on the /auth forms of keeping colour wherever it carries meaning. It is safe
 * here because nothing is being carried: the tick glyph states success, the headline says
 * "Welcome back" and the line under it says "You're all set". Colour was the fourth cue on
 * a screen that already had three, so dropping it costs no information. That is not true of
 * the form's error and confirmation states, where colour is doing real work, and those keep
 * it.
 *
 * ── Grid timing ─────────────────────────────────────────────────────────────────────
 * deferMs is small on purpose. AsciiBackdrop normally waits for an idle moment up to two
 * seconds so a page's own content paints first; this screen is on display for roughly 2.5s
 * total and has nothing else to paint, so the default would fade the grid in just as the
 * screen left. There is also no extra download in the common path — the visitor has just
 * come from /auth, which already pulled the same chunk.
 */

interface WelcomeTransitionProps {
  userName?: string
  title?: React.ReactNode
  subtitle?: string
}

/**
 * Centred white wash, same trick and same reasoning as the one in AuthAside: the grid runs
 * behind the copy rather than around it, and small glyph strokes break up against the marks
 * even at a passing contrast ratio. Opaque where the content sits, faded to nothing well
 * before any edge, so there is no boundary to read as a panel.
 */
const SCRIM_GRADIENT =
  'radial-gradient(42% 38% at 50% 50%, ' +
  'rgba(255,255,255,1) 0%, ' +
  'rgba(255,255,255,1) 62%, ' +
  'rgba(255,255,255,0.55) 82%, ' +
  'rgba(255,255,255,0) 100%)'

/** Blocks in the progress meter. */
const SEGMENTS = 18

/**
 * How long the fill takes to sweep the full row, in ms.
 *
 * Constrained by the callers, not by taste. The progress row appears at 1400ms and login
 * navigates away at 2500ms for a member and 2800ms for an owner, so the sweep plus one
 * segment's own colour transition has to fit inside the ~1100ms that leaves. The bar this
 * replaced animated its width over 1800ms from the same 1400ms start, which meant it was
 * still visibly filling when the screen vanished — a progress indicator that never reached
 * the end, every single time.
 */
const SWEEP_MS = 700

export function WelcomeTransition({ userName, title, subtitle }: WelcomeTransitionProps) {
  const [stage, setStage] = useState(0) // 0=initial, 1=check, 2=text, 3=progress

  useEffect(() => {
    const t1 = setTimeout(() => setStage(1), 200)
    const t2 = setTimeout(() => setStage(2), 800)
    const t3 = setTimeout(() => setStage(3), 1400)
    return () => { clearTimeout(t1); clearTimeout(t2); clearTimeout(t3) }
  }, [])

  return (
    /*
      fixed with a z-index already makes this a stacking context, so the z-0 grid and z-10
      content below are scoped to it. isolate is belt and braces — see the longer note in
      AuthShell about a negative z-index landing in the root stacking context and the body
      background painting over the canvas.
    */
    <div className="fixed inset-0 z-[200] isolate flex items-center justify-center overflow-hidden bg-white">
      {/*
        absolute rather than the fixed used on /auth: this overlay already fills the
        viewport, so there is nothing to pin against.
      */}
      <AsciiBackdrop
        className="pointer-events-none absolute inset-0 z-0 opacity-[0.26]"
        color="#000000"
        colorTint="#737373"
        scale={4}
        intensity={1.099}
        contrast={2.501}
        deferMs={120}
      />

      <div className="relative z-10 flex max-w-md flex-col items-center px-6 text-center">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute -inset-x-32 -inset-y-24"
          style={{ backgroundImage: SCRIM_GRADIENT }}
        />

        <div className="relative flex flex-col items-center">
          {/* ── Check ─────────────────────────────────────────────────────────── */}
          <div
            className={`relative mb-8 transition-all duration-700 ease-out ${
              stage >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
            }`}
          >
            {/*
              Square with a generous radius rather than a circle, echoing the icon tiles in
              the /auth left column. The two rings are neutral now; at 0.35 and 0.2 on white
              they read as a soft echo rather than the emerald halo they were.
            */}
            <div
              className={`absolute inset-[-12px] rounded-[1.25rem] border-2 border-neutral-300/60 transition-all duration-1000 ${
                stage >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
              style={{ animation: stage >= 1 ? 'ring-pulse 2s ease-out infinite' : 'none' }}
            />
            <div
              className={`absolute inset-[-24px] rounded-[1.5rem] border border-neutral-300/40 transition-all delay-200 duration-1000 ${
                stage >= 1 ? 'scale-100 opacity-100' : 'scale-50 opacity-0'
              }`}
              style={{ animation: stage >= 1 ? 'ring-pulse 2s ease-out 0.5s infinite' : 'none' }}
            />

            <div className="flex h-20 w-20 items-center justify-center rounded-2xl bg-neutral-950 shadow-[0_1px_2px_rgba(0,0,0,0.04),0_12px_32px_-16px_rgba(0,0,0,0.25)]">
              <svg
                className="h-10 w-10 text-white"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="3"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path
                  d="M5 13l4 4L19 7"
                  className={stage >= 1 ? 'animate-check-draw' : ''}
                  style={{
                    strokeDasharray: 24,
                    strokeDashoffset: stage >= 1 ? 0 : 24,
                    transition: 'stroke-dashoffset 0.6s ease-out 0.3s',
                  }}
                />
              </svg>
            </div>
          </div>

          {/* ── Text ──────────────────────────────────────────────────────────── */}
          <div
            className={`transition-all duration-700 ${
              stage >= 2 ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'
            }`}
          >
            {title ? (
              <h1 className="text-[1.75rem] font-bold leading-[1.15] tracking-tight text-neutral-950 sm:text-4xl">
                {title}
              </h1>
            ) : (
              <h1 className="text-[1.75rem] font-bold leading-[1.15] tracking-tight sm:text-4xl">
                {/*
                  With the brand gradient gone, the name is separated from the greeting by
                  weight and ink rather than hue — greeting at the neutral-700 floor, name at
                  neutral-950. It still reads as the emphasised half of the line.
                */}
                <span className="block text-neutral-700">Welcome back{userName ? ',' : '!'}</span>
                {userName && <span className="block text-neutral-950">{userName}</span>}
              </h1>
            )}
            <p className="mt-3 text-sm text-neutral-700">
              {subtitle || "You're all set! Taking you to your dashboard..."}
            </p>
          </div>

          {/* ── Progress ──────────────────────────────────────────────────────── */}
          <div
            className={`mt-8 w-full max-w-[260px] transition-all duration-500 ${
              stage >= 3 ? 'translate-y-0 opacity-100' : 'translate-y-4 opacity-0'
            }`}
          >
            {/*
              Segmented rather than a continuous bar, because a row of discrete cells is the
              one place on this screen where the grid's own vocabulary can do the work
              instead of being decoration behind it. Built from two aligned rows of blocks —
              a neutral track and a near-black fill clipped to the completed width — so the
              cells stay put while the fill advances through them, the way a character-cell
              meter would.
            */}
            {/*
              aria-hidden, with no progressbar role. The line directly beneath already says
              "Loading your gym" in a live region, and giving these cells a role and the same
              accessible name would have a screen reader announce the same thing twice. There
              is also no meaningful value to report — the sweep is a fixed animation, not
              real progress against the prefetch it sits in front of, and claiming otherwise
              through aria-valuenow would be a lie told precisely to the users least able to
              check it.
            */}
            <div aria-hidden="true" className="flex gap-[3px]">
              {Array.from({ length: SEGMENTS }).map((_, i) => (
                <span
                  key={i}
                  className="h-2 flex-1 rounded-[2px] bg-neutral-300 transition-colors duration-300"
                  style={{
                    // Staggered so the fill sweeps across rather than snapping on.
                    transitionDelay: `${Math.round(i * (SWEEP_MS / SEGMENTS))}ms`,
                    backgroundColor: stage >= 3 ? '#0a0a0a' : undefined,
                  }}
                />
              ))}
            </div>

            <div
              role="status"
              className={`mt-4 flex items-center justify-center gap-2 transition-all delay-300 duration-500 ${
                stage >= 3 ? 'opacity-100' : 'opacity-0'
              }`}
            >
              <span className="h-1.5 w-1.5 animate-pulse rounded-[1px] bg-neutral-950" />
              <span className="text-[11px] font-semibold uppercase tracking-widest text-neutral-700">
                Loading your gym
              </span>
            </div>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes ring-pulse {
          0%   { transform: scale(1);    opacity: 0.35; }
          50%  { transform: scale(1.12); opacity: 0; }
          100% { transform: scale(1);    opacity: 0; }
        }
        @keyframes check-draw {
          from { stroke-dashoffset: 24; }
          to   { stroke-dashoffset: 0; }
        }
        .animate-check-draw {
          animation: check-draw 0.6s ease-out 0.3s forwards;
          stroke-dashoffset: 24;
        }
        @media (prefers-reduced-motion: reduce) {
          .animate-check-draw { animation: none; stroke-dashoffset: 0; }
        }
      `}</style>
    </div>
  )
}
