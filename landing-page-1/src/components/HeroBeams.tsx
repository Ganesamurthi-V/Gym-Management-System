import { Suspense, lazy, useEffect, useMemo, useState } from 'react';
import { useIsDark } from '../lib/useTheme';
import { useMediaQuery } from '../lib/useMediaQuery';

/**
 * Split out so three.js lands in its own async chunk. Imported normally it would
 * sit in the entry bundle and delay the hero's first paint by ~123KB gzipped —
 * for a decoration behind the headline. As a lazy import it is only fetched once
 * the gates below pass, so light mode, reduced motion and data-saving visitors
 * never download it at all.
 */
const Beams = lazy(() => import('./Beams'));
const PHONE_QUERY = '(max-width: 767px)';

/**
 * Per-device cost settings.
 *
 * Phones run the same effect, just cheaper in all three dimensions that matter.
 * Fragment work scales with pixelRatio squared and linearly with fps, so 1.15 at
 * 20fps against 1.5 at 30fps is roughly a 2.5x reduction in shading throughput —
 * before accounting for the smaller layer.
 *
 * A phone reports devicePixelRatio 2-3, which would mean shading up to 9x the
 * pixels of the CSS layout for content that is soft gradients. Clamping near 1
 * costs nothing visible and is the difference between this being reasonable on a
 * mid-range Android and not.
 *
 * The heights are fitted to measured layout, not picked: on a 390px phone the
 * hero copy runs y=124-521 and the product card starts at y=588, so 880px puts
 * the layer's bottom fade behind that opaque card where no seam can show. On
 * desktop the card starts at y=706 and 1080px leaves open margin beside it.
 * .hero-beams-scrim in index.css is fitted to both numbers per breakpoint —
 * change one and the other has to move with it.
 */
/*
  fov is why the ribbons were invisible on a phone rather than merely subtle.

  At fov 30 from z=20 the frame is ~10.7 world units tall, and a portrait layer
  375 wide by 880 tall makes it only ~4.6 units across. Against 2-unit beams that
  is barely two ribbons on screen — no edges, no variation, just a dark wash. 58
  degrees opens the frame to ~22 units tall and ~9.4 across, so five or six
  ribbons read at once.

  Coverage still holds at that width: rotated 45 degrees the slab has to span
  (9.4 + 22.2) / sqrt(2) = 22.4 units, and it is 24 by 24.

  lightIntensity spends measured headroom. Body text behind the phone copy
  measured 7.45:1 against a 4.5 floor, and luminance would have to rise about
  sixfold before it reached 5:1 — so the ribbons can be a good deal brighter and
  still leave the copy comfortably legible. Desktop has less slack (6.18:1) and
  more open area, so it stays at 1.
*/
const PHONE = {
  coverH: 'h-[880px]',
  maxPixelRatio: 1.15,
  targetFps: 20,
  fov: 58,
  // 1.9 was set against a blue-200 light; white carries more luminance for the
  // same intensity, so this comes down to compensate.
  lightIntensity: 1.5,
} as const;

const DESKTOP = {
  coverH: 'h-[1080px]',
  maxPixelRatio: 1.5,
  targetFps: 30,
  fov: 30,
  lightIntensity: 1,
} as const;

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
  return /^#[0-9a-f]{6}$/i.test(value) ? value : '#000000';
}

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Whether the connection looks like one that should not be spent on decoration.
 *
 * Data Saver is an explicit request to stop sending optional bytes, and 123KB of
 * WebGL library for a background is exactly what it means. On 2g the same file is
 * seconds of waiting. This page's audience is largely on Indian mobile data, so
 * the check earns its keep rather than being theoretical.
 *
 * Read once at mount rather than subscribed: connection quality changes mid-visit
 * are not worth tearing a canvas down over, and Chromium is the only engine that
 * exposes any of this — elsewhere it returns true and the other gates decide.
 */
function connectionAllowsDecoration(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g';
}

/**
 * Defers a flag until the browser is idle, so fetching and compiling three.js
 * cannot compete with the hero's own paint.
 *
 * requestIdleCallback where available, a timeout everywhere else — Safari only
 * shipped it recently. The timeout is a ceiling in both branches: on a busy page
 * idle may never arrive, and the effect should still appear.
 */
function useDeferredUntilIdle(enabled: boolean, timeoutMs: number): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // No reset when disabled: `active` already requires `wanted`, so there is
    // nothing to undo, and keeping this latched means toggling light -> dark
    // brings the beams straight back instead of waiting on idle a second time.
    if (!enabled) return;

    const idle = (window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    });

    if (typeof idle.requestIdleCallback === 'function') {
      const handle = idle.requestIdleCallback(() => setReady(true), { timeout: timeoutMs });
      return () => idle.cancelIdleCallback?.(handle);
    }
    const t = window.setTimeout(() => setReady(true), Math.min(timeoutMs, 1200));
    return () => window.clearTimeout(t);
  }, [enabled, timeoutMs]);

  return ready;
}

/**
 * The Beams background, behind the hero, dark mode only. Runs on phones too.
 *
 * Gates, each for its own reason:
 *  - light mode: the effect is lit ribbons on near-black. On #f5f5f5 there is
 *    nothing for them to glow against, so the CSS mesh stays the light-mode
 *    treatment.
 *  - reduced motion: it is continuous movement with no user control, which is
 *    exactly what that preference is asking not to see.
 *  - Data Saver or 2g: see connectionAllowsDecoration.
 *
 * Width is no longer a gate. It used to be, on the grounds that a full-width
 * WebGL canvas is the wrong trade on a phone — that concern is now answered by
 * spending less rather than by not showing up: a smaller layer, a pixel ratio
 * near 1 instead of the device's 2-3, 20fps instead of 30, and the whole thing
 * deferred to idle so it is never on the critical path.
 */
export function HeroBeams() {
  const isDark = useIsDark();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Once per mount, not per render: this reads navigator and must not change
  // identity on every paint.
  const connectionOk = useMemo(() => connectionAllowsDecoration(), []);

  const wanted = isDark && !reducedMotion && connectionOk;
  const ready = useDeferredUntilIdle(wanted, 2500);
  const active = wanted && ready;

  const settings = isPhone ? PHONE : DESKTOP;
  const background = useMemo(() => (active ? readBeamsBase() : '#000000'), [active]);

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden
        className={`hero-beams pointer-events-none absolute inset-x-0 top-0 -z-30 ${settings.coverH}`}
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
              square, which 16 just clears. Desktop here is ~1.33:1, which asks for
              ~19; a phone layer is portrait at ~0.44:1 and asks for only ~11. 24
              clears every case, so one value serves both breakpoints.
            */
            beamHeight={24}
            /*
              Brand blue rather than the snippet's white, so the ribbons read as
              lit by the same blue the rest of the page uses instead of as a
              neutral grey effect dropped behind it. Swap to '#ffffff' for the
              stock look.

              blue-200 rather than the blue-300 this started on: noiseIntensity 5
              subtracts up to a third of each fragment's brightness, and against
              near-black the darker blue left the ribbons barely separable from the
              page. The scrim knocks this back by ~80% over the copy, so the extra
              brightness lands in open area and not behind the text.
            */
            /*
              White, like the reference, not the brand blue this ran on for a while.
              Ribbon definition comes from luminance range, and white simply has
              more of it to give against black than blue-200 does. The brand tint is
              still present in the layer — the hero mesh sits above these — so
              tinting the light as well was double-counting it and costing contrast.
            */
            lightColor="#ffffff"
            /*
              Back to pure black, and this is what makes them read as ribbons rather
              than as a gradient.

              A non-black diffuse term lights the surface evenly, which is genuinely
              better for coverage — it was how the corner imbalance got fixed. But
              it also lifts the gaps between ribbons off black, and those gaps are
              the edges. Once every pixel has a floor, adjacent ribbons at slightly
              different angles differ by slightly different amounts of light, and the
              boundaries stop being boundaries. The result was evenly lit and
              shapeless: a shader background, exactly as described.

              With black there is no floor, so a small change in surface normal is
              the difference between lit and not — which is what draws a crisp edge.
              Coverage is instead handled by the mirrored fill light in Beams.tsx,
              which does not cost contrast because it adds a second highlight rather
              than a global lift.
            */
            beamColor="#000000"
            /*
              Back to a tight lobe. 0.72 spread the highlight so wide that its
              falloff became the dominant gradient on screen, washing the ribbons
              out. 0.3 keeps the specular sharp, so brightness tracks the ribbon
              geometry instead of the distance from a light.
            */
            roughness={0.3}
            speed={3.4}
            /*
              Down from 5. The shader only ever subtracts grain
              (rgb -= noise / 15 * intensity), so at 5 the ceiling was a 0.33
              subtraction — enough to crush the mid-tones along a ribbon's gradient
              into black speckle and cost the smooth falloff the reference has.

              Lowering it does not cost visible grain, because the grain that reads
              on screen is .hero-beams-grain, an additive CSS layer at full device
              resolution. This value only ever dithered the lit ribbons.
            */
            noiseIntensity={3}
            scale={0.2}
            rotation={45}
            backgroundColor={background}
            maxPixelRatio={settings.maxPixelRatio}
            targetFps={settings.targetFps}
            fov={settings.fov}
            lightIntensity={settings.lightIntensity}
          />
        </Suspense>
      </div>

      {/*
        Additive grain, and the other half of the noise. The shader's own noise
        subtracts only, so against the near-black base it has nothing to take away
        and the flat areas stay flat however high noiseIntensity goes — measured,
        the darkest pixels clamp at 0. This lifts a dither across the field so the
        black reads as textured rather than empty.

        Ordered before the scrim deliberately. Both share -z-20, so this paints
        underneath and the scrim gets the last word: grain runs at full strength
        across open area and is damped to near nothing over the copy, on the same
        falloff that protects the text from the ribbons. Above the scrim instead,
        its bright speckle lifted the backdrop behind the subhead to rgb(58,61,65)
        and dropped #a3a3a3 body text to 4.33:1 — under AA.

        Being CSS, it costs nothing per frame and renders at full device
        resolution, which is why the canvas underneath can afford to be coarse.
      */}
      <div
        aria-hidden
        className={`hero-beams-grain pointer-events-none absolute inset-x-0 top-0 -z-20 ${settings.coverH}`}
      />

      {/*
        Legibility scrim, and not optional — it is the single thing standing
        between the copy and everything painted behind it. The ribbons brighten
        patches of backdrop as they cross and the grain speckles it; the subhead is
        --muted-foreground (#a3a3a3), which needs 4.5:1 to clear AA for body text.
        This holds the paint behind the headline block at the base colour, lets
        both effects show around it, and its bottom stop keeps the opaque canvas
        from cutting a hard edge across the page.

        Its geometry differs per breakpoint because the copy block does: see the
        two fitted gradients in index.css.
      */}
      <div
        aria-hidden
        className={`hero-beams-scrim pointer-events-none absolute inset-x-0 top-0 -z-20 ${settings.coverH}`}
      />
    </>
  );
}
