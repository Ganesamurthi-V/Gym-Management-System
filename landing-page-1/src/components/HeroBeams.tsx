import { Suspense, lazy, useMemo } from 'react';
import { useIsDark } from '../lib/useTheme';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * Split out so three.js lands in its own async chunk. Imported normally it would
 * sit in the entry bundle and delay the hero's first paint by ~170KB gzipped —
 * for a decoration behind the headline. As a lazy import it is only fetched once
 * the gates below pass, which means light mode, reduced motion and phones never
 * download it at all.
 */
const Beams = lazy(() => import('./Beams'));

/**
 * Runs past the copy and down either side of the product frame.
 *
 * At 820px the layer ended just below the headline block, and since the scrim
 * has to keep that block dark for legibility, almost the only place ribbons
 * survived was the top corners — the effect read as a faint smudge. Carrying it
 * to 1080px gives them the open margins beside the dashboard shot, which is
 * unobstructed area where they can show at full strength.
 *
 * The scrim's stops are percentages of this box, so .hero-beams-scrim in
 * index.css is fitted to this number. Changing one means recomputing the other.
 */
const COVER_H = 'h-[1080px]';

/**
 * The canvas paints an opaque rectangle, so its clear colour has to agree with
 * what the scrim paints over it or the two show as different shades.
 *
 * --beams-base, not --background: the field is deliberately blacker than the
 * page so the ribbons have near-black to read against. .hero-beams-scrim uses
 * the same token for its protected core, and the scrim's bottom stop is what
 * ramps this back up to --background where the layer meets the rest of the page.
 * Read rather than hardcoded so retuning the token moves both together.
 */
function readBeamsBase(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--beams-base')
    .trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#050505';
}

/**
 * The Beams background, behind the hero, dark mode only.
 *
 * Three gates, each for its own reason:
 *  - light mode: the effect is lit ribbons on near-black. On #f5f5f5 there is
 *    nothing for them to glow against, so the CSS mesh stays the light-mode
 *    treatment.
 *  - reduced motion: it is continuous movement with no user control, which is
 *    exactly what that preference is asking not to see.
 *  - under 768px: a full-width WebGL canvas shading every frame is the wrong
 *    trade on a phone, where this page's visitors are most likely on mid-range
 *    hardware and metered data.
 */
export function HeroBeams() {
  const isDark = useIsDark();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const wideEnough = useMediaQuery('(min-width: 768px)');

  const active = isDark && !reducedMotion && wideEnough;
  const background = useMemo(() => (active ? readBeamsBase() : '#050505'), [active]);

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden
        className={`hero-beams pointer-events-none absolute inset-x-0 top-0 -z-30 ${COVER_H}`}
      >
        <Suspense fallback={null}>
          <Beams
            className="h-full w-full"
            beamNumber={12}
            beamWidth={2}
            /*
              24, not the 16 the ReactBits snippet uses. That value is tuned for
              the square 1080x1080 demo box: at fov 30 from z=20 the visible area
              is ~10.7 units tall, and rotating the slab 45deg means it has to
              span (w + h) / sqrt(2) on both axes to cover the frame — ~15.2 for a
              square, which 16 just clears. This hero is ~1.76:1, so the same
              maths asks for ~21 and 16 would cut the ribbon ends across the
              corners as two visible diagonal seams.
            */
            beamHeight={24}
            /*
              Brand blue rather than the snippet's white, so the ribbons read as
              lit by the same blue the rest of the page uses instead of as a
              neutral grey effect dropped behind it. Swap to '#ffffff' for the
              stock look.

              blue-200 rather than the blue-300 this started on: noiseIntensity 3
              subtracts up to 20% of each fragment's brightness, and against
              #141414 the darker blue left the ribbons barely separable from the
              page. The scrim knocks this back by ~80% over the copy, so the extra
              brightness lands in the open margins and not behind the text.
            */
            lightColor="#bfdbfe"
            speed={3.4}
            /*
              The shader only ever subtracts grain (rgb -= noise / 15 * intensity),
              so this both roughens and darkens, which is why it pairs with the
              near-black base rather than fighting it. At 5 the ceiling is a 0.33
              subtraction against 0.20 at 3.

              Grain is only visible where a ribbon is lit — there is nothing to
              take away from the black field itself. Wanting grain across the whole
              backdrop would mean an additive pass, not a bigger number here.
            */
            noiseIntensity={5}
            scale={0.2}
            rotation={45}
            backgroundColor={background}
          />
        </Suspense>
      </div>

      {/*
        Additive grain, and the other half of "more noise". The shader's own noise
        subtracts only, so against the near-black base it has nothing to take away
        and the flat areas stay flat however high noiseIntensity goes — measured,
        the darkest pixels clamp at 0. This lifts a dither across the field so the
        black reads as textured rather than empty.

        Ordered before the scrim deliberately. Both share -z-20, so this paints
        underneath and the scrim gets the last word: grain runs at full strength
        across the open margins and is damped to near nothing over the copy, on
        the same falloff that protects the text from the ribbons. Above the scrim
        instead, its bright speckle lifted the backdrop behind the subhead to
        rgb(58,61,65) and dropped #a3a3a3 body text to 4.33:1 — under AA.
      */}
      <div
        aria-hidden
        className={`hero-beams-grain pointer-events-none absolute inset-x-0 top-0 -z-20 ${COVER_H}`}
      />

      {/*
        Legibility scrim, and not optional — it is the single thing standing
        between the copy and everything painted behind it. The ribbons brighten
        patches of backdrop as they cross and the grain speckles it; the subhead is
        --muted-foreground (#a3a3a3), which needs 4.5:1 to clear AA for body text.
        This holds the paint behind the headline block at the base colour, lets
        both effects show around it, and its bottom stop keeps the opaque canvas
        from cutting a hard edge across the page.
      */}
      <div
        aria-hidden
        className={`hero-beams-scrim pointer-events-none absolute inset-x-0 top-0 -z-20 ${COVER_H}`}
      />
    </>
  );
}
