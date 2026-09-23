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
/*
  intensity and contrast are solved, not tuned by eye.

  The shader maps the field to a glyph as floor(gray * 9), with
  gray = pow(length(field) * intensity, contrast). The reference's measured per-cell
  fill distribution fixes two points of that mapping: 46.6% of its cells are empty, so
  P(gray < 1/9) = 0.466, and 20.7% carry a heavier mark, so P(gray >= 5/9) = 0.207.
  Both are thresholds on length(field), so with its 46th and 79th percentiles the pair
  falls out directly:

    contrast  = ln 5 / ln(q79 / q46)
    intensity = (1/9)^(1/contrast) / q46

  These were first solved against the reference's own distribution, 47% of cells empty
  with a fifth carrying a heavier mark, and have since been re-solved for a denser grid:
  28% empty and 34% heavy.

  Density is the lever because darkness is not. On the white surface a full mark at
  layer opacity a leaves the backdrop at 255(1 - a), so every piece of hero text implies
  a ceiling on a, and the blue emphasis words bind it hard: the glint on "effortless."
  caps opacity at 0.322 against the 0.31 now in use. There is nothing left there.

  Coverage, on the other hand, is free. WCAG compares text against its background per
  pixel, so the measured floor is set by the darkest single mark and not by how many
  marks there are. Inking more of the grid, and pushing more of it further up the ramp,
  makes the layer read more strongly without moving any contrast number.

  The percentiles shift with scale and frame shape, so the two devices do not share a
  pair and both have to be re-solved if scale or the target distribution changes.
*/
const PHONE = {
  size: 12,
  scale: 3,
  intensity: 1.133,
  contrast: 2.496,
  maxPixelRatio: 1,
  targetFps: 15,
} as const;

const DESKTOP = {
  size: 10,
  scale: 4,
  intensity: 1.096,
  contrast: 2.535,
  maxPixelRatio: 1.25,
  targetFps: 24,
} as const;

/**
 * The hero's backdrop in both themes: a character grid flowing over the mesh wash.
 *
 * This used to be light mode only, with the Beams canvas covering dark. Both themes
 * now run this one, which is also what the reference does: switching its theme keeps
 * the same grid at the same uScale, uSize, uSpeed, uWaveTension and uWaveTwist, and
 * changes only two things, uColor from near-black to pure white and the layer opacity
 * from 0.5 to 0.6. Beams is no longer mounted; two WebGL contexts in one hero is not
 * worth it for a decoration, and the heavier of the two was the one being dropped.
 *
 * Gates, unchanged and for the same reasons:
 *  - reduced motion: continuous movement with no user control.
 *  - Data Saver or 2g: see connectionAllowsDecoration.
 *
 * Legibility is handled in CSS, not here: the grid runs behind the copy rather than
 * around it, so .hero-pixels sets the opacity each theme can afford and --hero-copy
 * carries the text far enough from the marks to stay readable over them.
 */
export function HeroPixels() {
  const isDark = useIsDark();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Once per mount, not per render: this reads navigator and must not change
  // identity on every paint.
  const connectionOk = useMemo(() => connectionAllowsDecoration(), []);

  // No theme condition: both themes run the grid now.
  const wanted = !reducedMotion && connectionOk;
  const ready = useDeferredUntilIdle(wanted, 2500);
  const active = wanted && ready;

  const settings = isPhone ? PHONE : DESKTOP;

  /*
    Pure black on pure white, pure white on pure black, which is what the reference
    does: its uColor is [0.003,0.003,0.003] in light and [1,1,1] in dark, on #ffffff
    and #0a0a0a. The hero surface is set to match in .hero-surface.

    This used to read --accent, and the brand blue was the wrong ink for a glyph ramp
    in both directions. In light it tints the whole backdrop, so the hero never looked
    monochrome; in dark it is darker than several steps of the ramp, so marks that
    should read as the heaviest come out dimmer than the page and the gradient inverts.
    A neutral ink keeps the ramp monotonic, which is the thing the glyph mapping
    assumes.

    Not read from a token, because these are not brand values: they are the two ends
    of the range the ramp needs, and they should not follow --accent if it moves.
  */
  const color = isDark ? '#ffffff' : '#000000';

  /*
    The coloured end of the ramp, carrying the faint marks. The heavy ones keep the full
    strength of `color` above, which is what makes the grid read; the tint rides on the
    lighter glyphs where it adds colour without costing presence.
  */
  const colorTint = isDark ? '#93c5fd' : '#2563eb';

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
          colorTint={colorTint}
          /*
            10px, the pitch measured on the reference: its column-ink autocorrelation
            peaks at lag 10 with a harmonic at 20.
          */
          size={settings.size}
          /*
            Field frequency, and the control that decides whether this reads as a wave
            or as speckle.

            The reference's own uScale is 25, and copying it was wrong. At 25, with the
            aspect correction, p.x spans about 47 radians across the layer, and
            computeField amplifies gradients by 1/ep = 20 over ten iterations, so
            neighbouring cells decorrelate entirely. Measured, our inked cells formed
            runs averaging 3 cells against the reference's 19, and 3 is what pure
            chance gives at that coverage: scattered marks, no flow.

            Its 25 works there because its pattern is not coming from this field. Its
            live uniforms are uIntensity 0 with uHasVideo true, so the field is scaled
            out and the glyphs are driven by a texture instead. Matching the look meant
            matching the field's coherence rather than its number.
          */
          scale={settings.scale}
          /*
            Solved together against the reference's per-cell fill distribution rather
            than picked by eye; the derivation is on the settings above.

            Matching its total ink coverage was not enough on its own. An earlier pass
            sat at 9.9% ink against its 9.3% and still looked nothing like it, because
            the grey ran high enough to reach the top of the ramp: cells filled in,
            only 7% stayed empty against its 47%, and the layer read as boxes.
          */
          intensity={settings.intensity}
          contrast={settings.contrast}
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
