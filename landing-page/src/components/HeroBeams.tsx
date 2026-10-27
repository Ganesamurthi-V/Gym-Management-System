import { Suspense, lazy, useMemo } from 'react';
import { useIsDark } from '../lib/useTheme';
import { useMediaQuery } from '../lib/useMediaQuery';
import { connectionAllowsDecoration, useDeferredUntilIdle } from '../lib/decorationGates';

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
 * The canvas clear colour, read from the token rather than hardcoded so retuning
 * --beams-base moves the canvas with it.
 *
 * The canvas paints an opaque rectangle, so this has to agree with what the scrim
 * paints over it or the two show as different shades. --beams-base, not
 * --background: the field is deliberately darker than the page, because black is
 * what an unlit ribbon resolves to under additive lighting and it is what gives the
 * white specular highlights something to read against.
 *
 * It shows less than it looks like it should. The twelve ribbons are built with
 * zero spacing into one 24x24 slab that covers the frame at both breakpoints, so
 * the clear colour is almost entirely painted over and what reads as the field is
 * really the slab's own shading. It still has to agree, because the slab's corners
 * can fall inside the frame once the vertex noise displaces them.
 *
 * Only ever called in dark mode: the whole effect is gated on the theme, so the
 * token is defined under .dark and the fallback matches it.
 */
function readBeamsBase(): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--beams-base')
    .trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  return '#000000';
}

/**
 * Specular roughness.
 *
 * The single sharpness control: it sets how wide the highlight lobe is, and a
 * narrower lobe means brightness falls off over a shorter distance, which is what
 * reads as a defined edge. 0.22 rather than the 0.3 this ran on before.
 *
 * There is a floor to how far this can usefully go. Tightening the lobe also
 * shrinks the area each light reaches, which is what concentrated everything into
 * one corner before there were four of them — past roughly 0.15 the frame starts
 * breaking into isolated bright patches with dead space between.
 */
const ROUGHNESS = 0.22;

/**
 * The Beams background behind the hero. Dark mode only, and it runs on phones.
 *
 * Gates, each for its own reason:
 *  - light mode: the effect is a lit surface, and lit surfaces need somewhere dark
 *    to be lit against. There is a shader branch that inverts the tonality for a
 *    light theme, and it was fitted here at some length; the result was legible but
 *    never as good as the dark treatment, because the thing that carries the effect
 *    is a white specular highlight and on a light field that highlight has nowhere
 *    to travel. Light mode gets a static wash instead: see html:not(.dark)
 *    .hero-mesh in index.css.
 *  - reduced motion: it is continuous movement with no user control, which is
 *    exactly what that preference is asking not to see.
 *  - Data Saver or 2g: see connectionAllowsDecoration.
 *
 * Width does not gate it. A full-width WebGL canvas is the wrong trade on a phone,
 * which is answered by spending less rather than by not showing up: a smaller
 * layer, a pixel ratio near 1 instead of the device's 2-3, a lower redraw ceiling,
 * and the whole thing deferred to idle so it is never on the critical path.
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

  if (!active) return null;

  return (
    <>
      <div
        aria-hidden
        className={`hero-beams pointer-events-none absolute inset-x-0 top-0 -z-30 ${settings.coverH}`}
      >
        <Suspense fallback={null}>
          {/*
            Several props are left at their defaults rather than restated here:
            lightMode, ambientIntensity, fillLightRatio, huePivot and hueGain. Each
            existed only to differ from a light-mode configuration, and with that
            gone every one of them would just repeat the value Beams.tsx already
            uses. They are documented there.
          */}
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
              White, because the specular highlight is the beam and white gives it
              the most luminance range to travel. The hue comes from the field
              underneath, never from the light.
            */
            lightColor="#ffffff"
            /*
              The floor the ribbons sit on, and it has to equal the canvas clear
              colour so an unlit ribbon disappears into the field and only the lit
              part of it is a shape.

              It must not be lifted off the field to improve coverage. Doing that
              once did fix a corner imbalance, but it also put a floor under every
              pixel, so adjacent ribbons differed by only slightly different amounts
              of light and the boundaries stopped being boundaries. That is what
              made it read as a shader wash rather than as beams.
            */
            beamColor="#000000"
            roughness={ROUGHNESS}
            /*
              Paired with scale: the shader advances the noise by the product of the
              two, reading vec3(..., pos.z + time * uSpeed * 3.) * uScale, so
              changing one without the other changes how fast the ribbons travel.
            */
            speed={3.4}
            /*
              High, because here the shader's subtraction darkens: rgb -= noise / 15
              * intensity against a black field speckles both the field and the
              white highlights.

              Most visible grain still comes from .hero-beams-grain, a CSS layer at
              full device resolution. This value only dithers the lit ribbons.
            */
            noiseIntensity={4}
            scale={0.2}
            rotation={45}
            backgroundColor={readBeamsBase()}
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
