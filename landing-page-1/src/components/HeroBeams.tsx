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
 * --beams-base, not --background: it is whatever the unlit field resolves to in
 * each theme, which is black in dark mode and white in light. Those are set by the
 * lighting model rather than chosen freely. Dark mode lights additively, so unlit
 * means black; light mode runs the lightMode branch, where low energy maps to
 * white.
 *
 * It shows less than it looks like it should. The twelve ribbons are built with
 * zero spacing into one 24x24 slab that covers the frame at both breakpoints, so
 * the clear colour is almost entirely painted over and what reads as the field is
 * really the slab's own shading. It still has to agree, because the slab's corners
 * can fall inside the frame once the vertex noise displaces them.
 *
 * The scrim paints --beams-scrim, which is a separate token. They match in dark
 * mode and, since the field went white, in light mode too, but they are kept apart
 * because they answer to different constraints: this one to the lighting model,
 * that one to the contrast the copy needs. The scrim's bottom stop is what ramps
 * the field back to --background where the layer meets the rest of the page. Read
 * rather than hardcoded so retuning the token moves the canvas with it.
 */
function readBeamsBase(isDark: boolean): string {
  const value = getComputedStyle(document.documentElement)
    .getPropertyValue('--beams-base')
    .trim();
  if (/^#[0-9a-f]{6}$/i.test(value)) return value;
  // Token missing or malformed. The fallback has to follow the theme too: a fixed
  // black here would paint a black rectangle across the page in light mode.
  return isDark ? '#000000' : '#ffffff';
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
 * Per-theme material settings.
 *
 * The shader carries a lightMode branch that rewrites each fragment as
 * mix(white, chroma, energy): unlit areas go white and lit areas take the
 * surface's hue. That inverts the whole effect, which is what light mode needs —
 * but it also changes what every other value should be.
 *
 * beamColor stops being a floor and becomes the hue. In dark mode black is
 * correct because the gaps between ribbons are what draw their edges. Under
 * lightMode the same black would normalise to a chroma of white and the ribbons
 * would vanish into the page, so it has to carry colour instead.
 *
 * It does not have to be a pale colour, which an earlier version of this note
 * claimed. The argument was that chroma normalises the surface to its brightest
 * channel, so #2563eb yields a fully lit ribbon at 0.153 luminance, and that
 * behind #6b6b6b body text would be 1.22:1. The figure is right and the
 * conclusion does not follow: it assumes the field reaches the text. Every glyph
 * in the hero sits at r <= 0.44 of the scrim ellipse, where coverage is at least
 * 97%, so only about 3% of the field ever arrives. Measured, the saturated brand
 * blue puts the worst glyph backdrop at rgb(249,250,255) and body text at 4.9:1.
 * The scrim, not the field, is what text is read against.
 *
 * Noise still comes down in light mode. It is subtracted before the lightMode
 * branch, so it lowers energy, and lower energy means whiter: the grain lightens
 * rather than darkens and works against the ribbons instead of texturing them.
 */
const DARK_MATERIAL = {
  lightMode: false,
  beamColor: '#000000',
  lightColor: '#ffffff',
  noiseIntensity: 4,
  // Additive path: the ambient floor is what colours unlit areas, so it stays at
  // full. Only the lightMode branch needs it cut.
  ambientIntensity: 1,
  // Three fills at half the key. Needed here specifically because beamColor is
  // black: with no diffuse term the only thing on screen is the specular lobe, and
  // one light puts that lobe in a single screen corner.
  fillLightRatio: 0.5,
  // Inert here: both only apply inside the lightMode branch, which this theme does
  // not enter. Present so the two materials share a shape, and set to the upstream
  // values so they cannot change anything if that ever stops being true.
  huePivot: 0,
  hueGain: 0.98,
  // Dark mode's contrast comes from the specular lobe, not from NdotL, so it does
  // not need the steeper tilt light mode requires. These are the original values.
  scale: 0.2,
  speed: 3.4,
  intensityScale: { desktop: 1, phone: 1 },
} as const;

/*
  Light mode: a white field with the brand blue arriving as the waves.

  This is the opposite tonal arrangement to dark mode, and it has to be, because
  the lighting is additive. Specular highlights can only brighten what they land
  on, so on a white field there is no way to render a wave that is darker than the
  field it sits on. Painting blue onto white additively just clamps back to white.

  So lightMode is true here. That branch remaps each finished fragment as
  mix(white, chroma, t), where t is the fragment's energy put through huePivot and
  hueGain: below the pivot it clamps to white, above it climbs to the hue. Field
  reads white, the lit ribbon bodies read brand blue, and specular glints stay white
  because a blown highlight has equal channels and so normalises to a white chroma.
  That last part is what keeps the ribbons crisp instead of flattening them, and it
  is the reason this branch can carry the look rather than merely inverting it.

  ambientIntensity is cut hard, and its absence is why this branch looked washed out
  on earlier attempts. energy is max(r, g, b), so a uniform ambient floor reads as
  "fully lit" everywhere: at ambient 1 a blue with a 0.92 blue channel pins the mix
  near its 0.94 ceiling across the whole frame, giving a flat saturated field with
  the structure compressed out. At 0.05 the floor is low enough that the directional
  lights are the only route to the hue.

  beamColor is --accent, the brand blue from app/design-tokens.css, not a Tailwind
  blue picked to look right. Under this branch it is a hue rather than a floor:
  chroma divides out brightness, so only its ratios matter and it should be the
  saturated brand value. It deliberately no longer tracks --beams-base, which is
  white now because white is what unlit fragments become.

  The values below were fitted by measurement, in this order: cut ambient and the
  fill ratio so the lighting has somewhere dark to go, raise the key to put the level
  back, then calibrate huePivot and hueGain against the resulting distribution. The
  last step is the one that separates field from wave, and the first two only exist
  to give it a distribution wide enough to cut. Each has a note of its own.
*/
const LIGHT_MATERIAL = {
  lightMode: true,
  /*
    #1D4DD5, given directly rather than taken from a token.

    Worth knowing it is three steps of blue away from --accent-strong, which is
    #1d4ed8: near enough that swapping to the token would be invisible, so if these
    should track the design system rather than drift from it, that is the one to use.
    Left as the literal value because it was specified as such.
  */
  beamColor: '#1D4DD5',
  lightColor: '#ffffff',
  /*
    Off, for two reasons that both come from where it sits in the pipeline.

    It is subtracted from rgb before the lightMode branch, so it perturbs energy and
    the gain then multiplies the result. At 0.6 it moves a channel by up to 0.04,
    against a pivot fitted to 0.01 precision, so it is a large disturbance on the
    quantity the whole mapping is calibrated against. Its mean matters as much as its
    spread: turning it off shifted every energy percentile up by about 0.02.

    It also cannot texture the part of the frame that most needs it. Over half the
    field clamps to pure white, and there t is already 0, so lowering energy further
    changes nothing at all.

    So the grain comes from .hero-beams-grain instead: a CSS layer at full device
    resolution, composited after the canvas, unamplified by the gain and effective on
    white. See its blend mode note in index.css, which has to be multiply for exactly
    the reason above.
  */
  noiseIntensity: 0,
  /*
    Fitted to the measured energy distribution on the raw canvas.

    Calibrate by setting pivot 0 and gain 1, which makes t equal energy so the
    rendered B-R reports the distribution directly, and capture with .hero-mesh,
    .hero-beams-grain and .hero-beams-scrim hidden. All three have to go: the mesh
    paints accent-tinted blue above the beams, the scrim whitens toward the copy and
    the grain perturbs R, so a composited screenshot is not a function of t alone.
    Fitting against one of those was what produced two wrong values before this.

    Read off a probe build whose branch ended in gl_FragColor.rgb = vec3(energy),
    making the frame a greyscale map of energy itself, and read as raw bytes rather
    than decoded. Two things make that indirection necessary, and both cost a wrong
    fit before they were understood.

    Inverting the normal output through B - R does not work. R is
    (1 - t) + chromaR^1.2 * t, and chromaR only equals the diffuse colour's ratio on
    a purely diffuse fragment; specular drags chroma toward white, so the coefficient
    collapses wherever a highlight lands and B - R understates t by a varying amount.
    Two builds with different amounts of blue on screen invert to different apparent
    distributions.

    And the probe's bytes are not sRGB. This branch is spliced at
    #include <dithering_fragment>, which three runs after #include
    <colorspace_fragment>, so anything written here has already missed the encoding
    step. energy is therefore the maximum of the already-encoded channels, and the
    byte is that value directly. Decoding it as sRGB read the median as 0.31 when it
    is 0.65, which put the pivot far below the whole distribution: t clamped at its
    0.94 ceiling nearly everywhere and the field came out a flat, uniform blue. The
    tell was that pivot 0.31 and pivot 0.45 both left the same 1.9% of the frame
    white, which cannot happen if the pivot is inside the data.

    Measured, at scale 0.2 with beamColor #1D4DD5, pooled over three phases:

      p25 0.573   p50 0.647   p60 0.690   p70 0.761   p80 0.863   p90 1.000

    The shape matters as much as the numbers. The top sixth is blown to 1.0: that is
    the specular lobe, and those fragments have a near-neutral chroma, so
    mix(white, chroma, t) leaves them white however high t climbs. The hue can only
    come from the diffuse mid-band, which is why the gain is fitted to p80 rather
    than to the maximum. Aiming at the peak would spend the range on fragments that
    render white anyway.

      p50 -> 0 (white field)   p60 -> 0.13   p70 -> 0.38   p80 -> 0.75 (full blue)
      p90 and above -> clamped, but neutral chroma, so white glints on the crests

    Recalibrate with the probe whenever the lighting, scale, beamColor or
    noiseIntensity move, since the pivot is an absolute position inside a
    distribution that all four of them shift.
  */
  huePivot: 0.655,
  hueGain: 3.6,
  /*
    Identical to dark mode, which is what sets the wave density.

    The noise wavelength is roughly 1/scale in world units, so against a frame about
    14 units across this gives three or four broad bands. It was briefly 0.55, which
    packs in eight or so; that reads as busy rather than as waves, and it also stopped
    matching dark mode, whose ribbons are wide and few. Same number here means the two
    themes have the same structure and only the colour differs.
  */
  scale: 0.2,
  /*
    Identical to dark mode, and it has to move with scale.

    The shader advances the noise by the product of the two: the coordinate reads
    vec3(..., pos.z + time * uSpeed * 3.) * uScale. This was 1.25 while scale was
    0.55, purely so that 0.55 * 1.25 matched dark mode's 0.2 * 3.4 and the waves
    travelled at the same apparent rate. With scale back at 0.2 the compensation is
    no longer needed and the original value is correct again.
  */
  speed: 3.4,
  /*
    Near zero, because under this branch ambient is a floor on saturation rather
    than on brightness.

    energy is max(r, g, b), and ambient is uniform, so every unit of it raises the
    mix factor everywhere at once. At 0.18 the whole field measured B-R 71 of a
    possible 228, a flat light blue with the waves swinging only 0.25 to 0.41. The
    field cannot be white while ambient is holding it off white.
  */
  ambientIntensity: 0.05,
  /*
    Far below dark mode's 0.5, and this is what turns a flat blue field into waves.

    All four lights sit at z=+10 and the slab faces the camera, so each one lands
    NdotL near 0.958 on a flat fragment and the three fills together outweigh the
    key. That is a broad, nearly uniform contribution: it raises the floor
    everywhere instead of picking out geometry, which is why the measured field
    varied by so little. Dark mode wants exactly that, because with a black diffuse
    the fills are the only thing lighting the far corners at all.

    Dropping them to 0.18 lets the key light dominate, so NdotL variation from the
    warped normals actually reaches the output and the troughs can fall back to
    white.
  */
  fillLightRatio: 0.18,
  /*
    Raised well past the first attempt's 0.28, which is a consequence of the two
    values above rather than an independent choice.

    Cutting ambient and the fills lowered the whole field, not just its troughs, so
    the crests need the level put back or the waves come out pale everywhere. This
    restores it through the one term that still varies across the frame, the key
    light, which is the difference between raising contrast and raising brightness.

    It stays well under dark mode's because the diffuse term saturates. metalness
    0.3 puts the diffuse blue channel at 0.645, so the mix reaches its 0.94 ceiling
    at a light level dark mode would consider dim, and past that the frame goes flat
    saturated blue: the same failure as high ambient, by a different route.

    Phone is 0.5 against its 1.5 base, landing at 0.75 absolute, close to desktop on
    purpose. That 1.5 exists to compensate a cramped portrait frame under additive
    lighting and has no equivalent job here.
  */
  intensityScale: { desktop: 0.7, phone: 0.5 },
} as const;

/**
 * Specular roughness, shared by both themes.
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
 * The Beams background, behind the hero, in both themes. Runs on phones too.
 *
 * Gates, each for its own reason:
 *  - reduced motion: it is continuous movement with no user control, which is
 *    exactly what that preference is asking not to see.
 *  - Data Saver or 2g: see connectionAllowsDecoration.
 *
 * Neither theme nor width gates it any more. Light mode used to, on the grounds
 * that lit ribbons need near-black to glow against — true of the dark treatment,
 * but the shader's lightMode branch inverts the tonality so the same geometry
 * reads as pale ribbons on white instead. Width used to, on the grounds that a
 * full-width WebGL canvas is the wrong trade on a phone — answered by spending
 * less rather than by not showing up: a smaller layer, a pixel ratio near 1
 * instead of the device's 2-3, a lower redraw ceiling, and the whole thing
 * deferred to idle so it is never on the critical path.
 */
export function HeroBeams() {
  const isDark = useIsDark();
  const reducedMotion = useMediaQuery('(prefers-reduced-motion: reduce)');
  const isPhone = useMediaQuery(PHONE_QUERY);

  // Once per mount, not per render: this reads navigator and must not change
  // identity on every paint.
  const connectionOk = useMemo(() => connectionAllowsDecoration(), []);

  const wanted = !reducedMotion && connectionOk;
  const ready = useDeferredUntilIdle(wanted, 2500);
  const active = wanted && ready;

  const settings = isPhone ? PHONE : DESKTOP;
  const material = isDark ? DARK_MATERIAL : LIGHT_MATERIAL;

  // Re-read on theme change, not just on mount: --beams-base inverts between
  // themes, so a toggle that kept the old floor would show the canvas as a block
  // against the page.
  const background = useMemo(() => readBeamsBase(isDark), [isDark]);

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
              White in both themes, and for the same reason in both: the specular
              highlight is the beam, and white gives it the most luminance range to
              travel. The hue comes from the field underneath, never from the light.
            */
            lightColor={material.lightColor}
            /*
              Means two different things depending on lightMode, which is why it is
              the value that differs between themes.

              Dark mode, additive: it is the floor the ribbons sit on, and black is
              right because it has to equal the canvas clear colour so an unlit
              ribbon disappears into the field and only the lit part is a shape. It
              must not be lifted off the field to improve coverage. Doing that once
              did fix a corner imbalance, but it also put a floor under every pixel,
              so adjacent ribbons differed by only slightly different amounts of
              light and the boundaries stopped being boundaries. That is what made
              it read as a shader wash rather than as beams.

              Light mode, lightMode branch: it is the hue, not a floor. chroma
              divides brightness out, so only the ratios between channels matter and
              this should be the saturated brand blue. Unlit fragments go white on
              their own, so it does not track the clear colour here.
            */
            beamColor={material.beamColor}
            lightMode={material.lightMode}
            /*
              Cut hard in light mode. Ambient is uniform, and the lightMode branch
              keys off max(r, g, b), so a full ambient floor reads as fully lit
              across the entire frame and flattens the ribbons into a solid colour.
              See the prop's own note in Beams.tsx.
            */
            ambientIntensity={material.ambientIntensity}
            /*
              Also cut hard in light mode, and for the same underlying reason: the
              fills are broad and nearly uniform, so under the lightMode branch they
              raise saturation everywhere rather than picking out the ribbons. Dark
              mode needs them because a black diffuse leaves specular as the only
              light in the frame.
            */
            fillLightRatio={material.fillLightRatio}
            /*
              The pair that decides where white ends and the hue begins. Only active
              under lightMode; dark mode passes the upstream values and never reaches
              the branch that reads them.
            */
            huePivot={material.huePivot}
            hueGain={material.hueGain}
            roughness={ROUGHNESS}
            /*
              Per-theme only because scale is. The shader multiplies the two together
              to advance the noise, so changing one without the other changes how
              fast the waves travel. See the note on LIGHT_MATERIAL.speed.
            */
            speed={material.speed}
            /*
              Lower in light mode, because the shader only ever subtracts grain
              (rgb -= noise / 15 * intensity) and the two themes read that
              subtraction in opposite directions.

              Dark mode: subtracting darkens, which speckles the black field and the
              white highlights, so it can run high at 4.

              Light mode: the subtraction happens before the lightMode branch, so it
              lowers energy, and lower energy means whiter. Grain lightens there. At
              4 it washed the blue back out of the waves, hence 1.5.

              Most visible grain comes from .hero-beams-grain either way, a CSS layer
              at full device resolution that none of this touches. This value only
              dithers the ribbons themselves.
            */
            noiseIntensity={material.noiseIntensity}
            /*
              Noise frequency, and in light mode it is the control on lighting
              contrast rather than on texture. Steeper displacement means more normal
              tilt, which is the only thing that makes NdotL vary across a slab this
              flat. See the note on LIGHT_MATERIAL.scale.
            */
            scale={material.scale}
            rotation={45}
            backgroundColor={background}
            maxPixelRatio={settings.maxPixelRatio}
            targetFps={settings.targetFps}
            fov={settings.fov}
            /*
              Breakpoint sets the level; the per-theme scale is 1 in both now that
              light mode runs dark mode's treatment. It stays a per-theme value
              rather than being folded away because the phone carries a 1.5x boost
              for its cramped portrait frame, and if the themes ever diverge again
              that boost is the first thing that needs to differ between them.
            */
            lightIntensity={
              settings.lightIntensity *
              (isPhone ? material.intensityScale.phone : material.intensityScale.desktop)
            }
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
