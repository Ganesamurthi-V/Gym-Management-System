import { Suspense, lazy, useMemo } from 'react';
import { useIsDark } from '../lib/useTheme';
import { useMediaQuery } from '../lib/useMediaQuery';
import { connectionAllowsDecoration, useDeferredUntilIdle } from '../lib/decorationGates';

/**
 * Split out for the same reason as Beams: three.js is ~123KB gzipped and has no
 * business in the entry bundle for a background. Only fetched once the gates pass.
 */
const PixelBlast = lazy(() => import('./PixelBlast'));
const PHONE_QUERY = '(max-width: 767px)';

/**
 * Reads the brand blue out of the tokens rather than repeating the hex.
 *
 * The pixels are the one place on the page where the accent appears as texture
 * rather than as a fill, and it should still move if the token moves.
 */
function readAccent(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--accent')
    .trim();
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#2563eb';
}

/**
 * Bigger cells and a slower redraw on a phone.
 *
 * pixelSize is the lever that matters. It is a cell edge in CSS px, so the number
 * of cells goes with its inverse square: 4 to 6 is a little over half as many
 * cells to evaluate, on the device least able to afford them. It also keeps the
 * grid legible on a small screen, where 4px cells start to read as noise rather
 * than as pixels.
 */
const PHONE = {
  pixelSize: 6,
  maxPixelRatio: 1.15,
  targetFps: 20,
  patternScale: 2.6,
} as const;

const DESKTOP = {
  pixelSize: 4,
  maxPixelRatio: 1.5,
  targetFps: 30,
  patternScale: 2.2,
} as const;

/**
 * The hero's light-mode backdrop: a dithered pixel grid over the brand wash.
 *
 * Light mode only, and that is the point of it. Dark mode has the Beams canvas,
 * which needs a near-black field for its specular highlights to read against;
 * light mode had nothing moving at all after the beams were gated out of it, just
 * the static mesh wash. This fills that gap without either theme having to
 * compromise for the other.
 *
 * The other gates match Beams, for the same reasons:
 *  - reduced motion: continuous movement with no user control.
 *  - Data Saver or 2g: see connectionAllowsDecoration.
 *
 * Legibility is handled in CSS rather than here. .hero-pixels carries a mask that
 * removes the grid from behind the copy, so the pixels live in the margins where
 * nothing is read. That is cheaper and more predictable than the gradient scrim the
 * beams needed, because a mask cannot be defeated by whatever the shader does.
 */
export function HeroPixels() {
  const isDark = useIsDark();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Once per mount, not per render: this reads navigator and must not change
  // identity on every paint.
  const connectionOk = useMemo(() => connectionAllowsDecoration(), []);

  const wanted = !isDark && !reducedMotion && connectionOk;
  const ready = useDeferredUntilIdle(wanted, 2500);
  const active = wanted && ready;

  const settings = isPhone ? PHONE : DESKTOP;

  // Re-read per theme so a toggle cannot leave the previous theme's accent behind.
  const color = useMemo(() => (isDark ? '#2563eb' : readAccent()), [isDark]);

  if (!active) return null;

  return (
    <div
      aria-hidden
      className="hero-pixels pointer-events-none absolute inset-x-0 top-0 -z-20 h-[760px]"
    >
      <Suspense fallback={null}>
        <PixelBlast
          className="h-full w-full"
          /*
            square, not one of the rounded variants. The whole point is that it reads
            as pixels, and circle or diamond spend fragments on an antialiased mask
            that makes the grid softer, which is the opposite of the intent.
          */
          variant="square"
          pixelSize={settings.pixelSize}
          color={color}
          /*
            fbm frequency. Higher gathers the pattern into smaller, more separate
            clumps; lower spreads it into broad fields that read as a gradient rather
            than as pixels. The phone runs slightly higher so the pattern still has
            structure inside a much narrower frame.
          */
          patternScale={settings.patternScale}
          /*
            Down from the component's default of 1, which fills a lot of the frame.
            This shifts the dither threshold, so it is the direct control on how much
            of the grid lights up, and a background wants far fewer cells than a demo
            does.
          */
          patternDensity={0.62}
          /*
            A little irregularity in cell coverage. Without it the grid is perfectly
            uniform where the noise plateaus, and the eye picks out the Bayer matrix
            itself as a repeating 8x8 texture.
          */
          pixelSizeJitter={0.4}
          /*
            Off: the layer is pointer-events-none, so pointer-down can never reach it,
            and the ripple path costs a ten-iteration loop in every fragment.
          */
          enableRipples={false}
          /*
            Fades all four edges, so the grid dissolves into the page instead of
            ending on the layer's 760px boundary. Paired with the CSS mask, which
            handles the middle.
          */
          edgeFade={0.4}
          /*
            Far above the component's default of 0.5, and it has to be.

            speed only scales how fast the fbm field drifts, and the shader feeds it
            in at uTime * 0.05, so the default advances the noise by 0.025 units a
            second. Cells flip through a step(), so nothing visibly happens until the
            field moves enough for a cell to cross the dither threshold. Measured at
            0.45: 0.06% of cells changed state per second, and 1.31% over a full eight
            seconds. That is a still image with a slow bias, not an animation.

            The rate works out at roughly 5 to 7% of cells per unit of noise time, so
            6 lands near 2% a second: enough that the grid is visibly alive, little
            enough that it reads as a shimmer behind the copy rather than as flicker
            competing with it.
          */
          speed={6}
          maxPixelRatio={settings.maxPixelRatio}
          targetFps={settings.targetFps}
        />
      </Suspense>
    </div>
  );
}
