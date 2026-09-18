import { Suspense, lazy, useMemo } from 'react';
import { useIsDark } from '../lib/useTheme';
import { useMediaQuery } from '../lib/useMediaQuery';
import { connectionAllowsDecoration, useDeferredUntilIdle } from '../lib/decorationGates';

/**
 * Split out for the same reason as Beams: three.js is ~123KB gzipped and has no
 * business in the entry bundle for a background. Only fetched once the gates pass.
 */
const CharGrid = lazy(() => import('./CharGrid'));
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
 * Cheaper on a phone, in the dimensions that actually cost.
 *
 * This shader is far more expensive per fragment than a dithered pixel grid:
 * computeField advects the sample point ten times and evaluates the flow field
 * three times per iteration, so every fragment runs thirty sin-heavy evaluations.
 * The cell snapping does not help, because each fragment still computes its cell's
 * value independently.
 *
 * So the phone gets a coarser grid, a lower pixel-ratio ceiling and a lower redraw
 * ceiling. A larger cell does not reduce the per-fragment cost, but a lower pixel
 * ratio reduces the fragment count quadratically, which is the lever that matters.
 *
 * scale comes down with the frame: 25 is fitted to a 1440-wide layer, and at 390 the
 * same value packs the structure too tightly to read.
 */
const PHONE = {
  size: 12,
  scale: 14,
  maxPixelRatio: 1,
  targetFps: 15,
} as const;

const DESKTOP = {
  size: 10,
  scale: 25,
  maxPixelRatio: 1.25,
  targetFps: 24,
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
        <CharGrid
          className="h-full w-full"
          color={color}
          /*
            10px, the pitch measured on the reference: its column-ink autocorrelation
            peaks at lag 10 with a harmonic at 20.
          */
          size={settings.size}
          /*
            25 on desktop is the reference's own uScale. It is a frequency against an
            aspect-corrected uv, so it has to come down on a narrow frame or the
            structure packs tighter than the 10px cells can resolve.
          */
          scale={settings.scale}
          /*
            Fitted to the reference's measured ink coverage of 9.3%. This is the
            coverage control: a cell needs gray above 1/(charCount - 1), about 0.11,
            before it draws anything at all, so intensity sets how much of the grid
            is inked.
          */
          intensity={0.35}
          /* Both straight off the reference's live uniforms. */
          waveTension={0.5}
          waveTwist={0.1}
          /*
            1, the reference's own value, and here it does read as motion: the flow
            field feeds time in at t * 0.1 and t * 0.2 inside flowField, not at the
            hundredth-scale the previous pixel shader used, so the pattern visibly
            moves without needing to be driven hard. Measured on the reference at this
            speed: mean 1.55/255 per 700ms.
          */
          speed={1}
          maxPixelRatio={settings.maxPixelRatio}
          targetFps={settings.targetFps}
        />
      </Suspense>
    </div>
  );
}
