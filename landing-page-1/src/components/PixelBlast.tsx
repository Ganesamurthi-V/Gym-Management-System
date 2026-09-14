import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════════════
   PixelBlast — a dithered pixel grid that evolves with fbm noise.

   Ported from ReactBits' PixelBlast. The shader is theirs; the host code is
   rewritten, and two things are deliberately left out.

   postprocessing is not a dependency here. Upstream imports EffectComposer,
   EffectPass and RenderPass, but only the `liquid` and `noiseAmount` features
   use them: with both off, the render path is a plain renderer.render(). Those
   two features are dropped, so the effect runs on three alone, which this project
   already ships for the Beams background. That keeps a decorative layer from
   adding ~150KB to a page whose audience is largely on mobile data.

   The offscreen pause is rewritten rather than ported. Upstream keeps a
   visibilityRef initialised to { visible: true } and never assigns to it, so
   autoPauseOffscreen has no effect and the loop runs forever. This version drives
   it from an IntersectionObserver plus document.hidden, the same way Beams does.

   Added on top: a frame-rate ceiling and a pixel-ratio clamp, both of which the
   original leaves to the display. A full-viewport fragment shader at devicePixelRatio
   2 on a phone is a lot of shading for a background.
   ═════════════════════════════════════════════════════════════════════════ */

const SHAPE_MAP = { square: 0, circle: 1, triangle: 2, diamond: 3 } as const;
export type PixelVariant = keyof typeof SHAPE_MAP;

const MAX_CLICKS = 10;

const VERTEX_SRC = /* glsl */ `
void main() {
  gl_Position = vec4(position, 1.0);
}
`;

/*
  Unchanged from upstream apart from formatting.

  How it produces pixels: fbm noise is sampled per 8x8 block of pixels, an 8x8
  Bayer matrix is added, and step(0.5, ...) turns the sum into a hard on/off per
  pixel. That is ordered dithering, which is why the result reads as pixel art
  rather than as a soft gradient: the noise decides roughly how dense an area
  should be, and the Bayer pattern decides which individual cells fill in.

  Output alpha carries the coverage, so the layer composites over whatever is
  behind it rather than painting its own background.
*/
const FRAGMENT_SRC = /* glsl */ `
precision highp float;

uniform vec3  uColor;
uniform vec2  uResolution;
uniform float uTime;
uniform float uPixelSize;
uniform float uScale;
uniform float uDensity;
uniform float uPixelJitter;
uniform int   uEnableRipples;
uniform float uRippleSpeed;
uniform float uRippleThickness;
uniform float uRippleIntensity;
uniform float uEdgeFade;

uniform int   uShapeType;
const int SHAPE_SQUARE   = 0;
const int SHAPE_CIRCLE   = 1;
const int SHAPE_TRIANGLE = 2;
const int SHAPE_DIAMOND  = 3;

const int MAX_CLICKS = 10;

uniform vec2  uClickPos  [MAX_CLICKS];
uniform float uClickTimes[MAX_CLICKS];

out vec4 fragColor;

float Bayer2(vec2 a) {
  a = floor(a);
  return fract(a.x / 2. + a.y * a.y * .75);
}
#define Bayer4(a) (Bayer2(.5*(a))*0.25 + Bayer2(a))
#define Bayer8(a) (Bayer4(.5*(a))*0.25 + Bayer2(a))

#define FBM_OCTAVES     5
#define FBM_LACUNARITY  1.25
#define FBM_GAIN        1.0

float hash11(float n){ return fract(sin(n)*43758.5453); }

float vnoise(vec3 p){
  vec3 ip = floor(p);
  vec3 fp = fract(p);
  float n000 = hash11(dot(ip + vec3(0.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n100 = hash11(dot(ip + vec3(1.0,0.0,0.0), vec3(1.0,57.0,113.0)));
  float n010 = hash11(dot(ip + vec3(0.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n110 = hash11(dot(ip + vec3(1.0,1.0,0.0), vec3(1.0,57.0,113.0)));
  float n001 = hash11(dot(ip + vec3(0.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n101 = hash11(dot(ip + vec3(1.0,0.0,1.0), vec3(1.0,57.0,113.0)));
  float n011 = hash11(dot(ip + vec3(0.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  float n111 = hash11(dot(ip + vec3(1.0,1.0,1.0), vec3(1.0,57.0,113.0)));
  vec3 w = fp*fp*fp*(fp*(fp*6.0-15.0)+10.0);
  float x00 = mix(n000, n100, w.x);
  float x10 = mix(n010, n110, w.x);
  float x01 = mix(n001, n101, w.x);
  float x11 = mix(n011, n111, w.x);
  float y0  = mix(x00, x10, w.y);
  float y1  = mix(x01, x11, w.y);
  return mix(y0, y1, w.z) * 2.0 - 1.0;
}

float fbm2(vec2 uv, float t){
  vec3 p = vec3(uv * uScale, t);
  float amp = 1.0;
  float freq = 1.0;
  float sum = 1.0;
  for (int i = 0; i < FBM_OCTAVES; ++i){
    sum  += amp * vnoise(p * freq);
    freq *= FBM_LACUNARITY;
    amp  *= FBM_GAIN;
  }
  return sum * 0.5 + 0.5;
}

float maskCircle(vec2 p, float cov){
  float r = sqrt(cov) * .25;
  float d = length(p - 0.5) - r;
  float aa = 0.5 * fwidth(d);
  return cov * (1.0 - smoothstep(-aa, aa, d * 2.0));
}

float maskTriangle(vec2 p, vec2 id, float cov){
  bool flip = mod(id.x + id.y, 2.0) > 0.5;
  if (flip) p.x = 1.0 - p.x;
  float r = sqrt(cov);
  float d  = p.y - r*(1.0 - p.x);
  float aa = fwidth(d);
  return cov * clamp(0.5 - d/aa, 0.0, 1.0);
}

float maskDiamond(vec2 p, float cov){
  float r = sqrt(cov) * 0.564;
  return step(abs(p.x - 0.49) + abs(p.y - 0.49), r);
}

void main(){
  float pixelSize = uPixelSize;
  vec2 fragCoord = gl_FragCoord.xy - uResolution * .5;
  float aspectRatio = uResolution.x / uResolution.y;

  vec2 pixelId = floor(fragCoord / pixelSize);
  vec2 pixelUV = fract(fragCoord / pixelSize);

  float cellPixelSize = 8.0 * pixelSize;
  vec2 cellId = floor(fragCoord / cellPixelSize);
  vec2 cellCoord = cellId * cellPixelSize;
  vec2 uv = cellCoord / uResolution * vec2(aspectRatio, 1.0);

  float base = fbm2(uv, uTime * 0.05);
  base = base * 0.5 - 0.65;

  float feed = base + (uDensity - 0.5) * 0.3;

  float speed     = uRippleSpeed;
  float thickness = uRippleThickness;
  const float dampT = 1.0;
  const float dampR = 10.0;

  if (uEnableRipples == 1) {
    for (int i = 0; i < MAX_CLICKS; ++i){
      vec2 pos = uClickPos[i];
      if (pos.x < 0.0) continue;
      float cps = 8.0 * pixelSize;
      vec2 cuv = (((pos - uResolution * .5 - cps * .5) / (uResolution))) * vec2(aspectRatio, 1.0);
      float t = max(uTime - uClickTimes[i], 0.0);
      float r = distance(uv, cuv);
      float waveR = speed * t;
      float ring  = exp(-pow((r - waveR) / thickness, 2.0));
      float atten = exp(-dampT * t) * exp(-dampR * r);
      feed = max(feed, ring * atten * uRippleIntensity);
    }
  }

  float bayer = Bayer8(fragCoord / uPixelSize) - 0.5;
  float bw = step(0.5, feed + bayer);

  float h = fract(sin(dot(floor(fragCoord / uPixelSize), vec2(127.1, 311.7))) * 43758.5453);
  float jitterScale = 1.0 + (h - 0.5) * uPixelJitter;
  float coverage = bw * jitterScale;

  float M;
  if      (uShapeType == SHAPE_CIRCLE)   M = maskCircle (pixelUV, coverage);
  else if (uShapeType == SHAPE_TRIANGLE) M = maskTriangle(pixelUV, pixelId, coverage);
  else if (uShapeType == SHAPE_DIAMOND)  M = maskDiamond(pixelUV, coverage);
  else                                   M = coverage;

  if (uEdgeFade > 0.0) {
    vec2 norm = gl_FragCoord.xy / uResolution;
    float edge = min(min(norm.x, norm.y), min(1.0 - norm.x, 1.0 - norm.y));
    float fade = smoothstep(0.0, uEdgeFade, edge);
    M *= fade;
  }

  vec3 color = uColor;

  // Linear to sRGB by hand. The branch below writes after three's own colour
  // management would have run, so nothing else encodes this.
  vec3 srgbColor = mix(
    color * 12.92,
    1.055 * pow(color, vec3(1.0 / 2.4)) - 0.055,
    step(0.0031308, color)
  );

  fragColor = vec4(srgbColor, M);
}
`;

export interface PixelBlastProps {
  /** Cell shape. `square` is the pixel-art reading; the rest round it off. */
  variant?: PixelVariant;
  /** Cell edge in CSS px. Smaller means a denser grid and more fragments. */
  pixelSize?: number;
  color?: string;
  className?: string;
  /** fbm frequency. Higher clusters the pattern into smaller blobs. */
  patternScale?: number;
  /** Shifts the dither threshold, so it sets how much of the grid fills in. */
  patternDensity?: number;
  /** Randomises cell coverage a little, which softens the grid's regularity. */
  pixelSizeJitter?: number;
  /**
   * Expanding rings from pointer-down.
   *
   * Off by default here, unlike upstream. The layer this sits in is
   * pointer-events-none, so nothing would ever reach it, and leaving it on costs
   * a ten-iteration loop in every fragment for a feature that cannot fire.
   */
  enableRipples?: boolean;
  rippleIntensityScale?: number;
  rippleThickness?: number;
  rippleSpeed?: number;
  /** Fades all four edges. Fraction of the shorter axis. */
  edgeFade?: number;
  /** Multiplier on how fast the noise evolves. */
  speed?: number;
  /** Ceiling on devicePixelRatio. Fragment cost scales with its square. */
  maxPixelRatio?: number;
  /** Redraw ceiling, independent of the display's refresh rate. */
  targetFps?: number;
}

export function PixelBlast({
  variant = 'square',
  pixelSize = 4,
  color = '#2563eb',
  className,
  patternScale = 2,
  patternDensity = 1,
  pixelSizeJitter = 0,
  enableRipples = false,
  rippleIntensityScale = 1,
  rippleThickness = 0.1,
  rippleSpeed = 0.3,
  edgeFade = 0.35,
  speed = 0.5,
  maxPixelRatio = 1.5,
  targetFps = 30,
}: PixelBlastProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    // A blocked or unavailable context throws. Returning leaves the host empty and
    // the hero keeps its CSS wash.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: true,
        // Decoration should not be a reason to spin up a discrete GPU. Upstream asks
        // for high-performance here.
        powerPreference: 'low-power',
      });
    } catch {
      return;
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio));
    renderer.setClearAlpha(0);
    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    container.appendChild(canvas);

    const uniforms: Record<string, THREE.IUniform> = {
      uResolution: { value: new THREE.Vector2(0, 0) },
      uTime: { value: 0 },
      uColor: { value: new THREE.Color(color) },
      uClickPos: {
        value: Array.from({ length: MAX_CLICKS }, () => new THREE.Vector2(-1, -1)),
      },
      uClickTimes: { value: new Float32Array(MAX_CLICKS) },
      uShapeType: { value: SHAPE_MAP[variant] ?? 0 },
      uPixelSize: { value: pixelSize * renderer.getPixelRatio() },
      uScale: { value: patternScale },
      uDensity: { value: patternDensity },
      uPixelJitter: { value: pixelSizeJitter },
      uEnableRipples: { value: enableRipples ? 1 : 0 },
      uRippleSpeed: { value: rippleSpeed },
      uRippleThickness: { value: rippleThickness },
      uRippleIntensity: { value: rippleIntensityScale },
      uEdgeFade: { value: edgeFade },
    };

    const scene = new THREE.Scene();
    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const material = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SRC,
      fragmentShader: FRAGMENT_SRC,
      uniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
      glslVersion: THREE.GLSL3,
    });
    const geometry = new THREE.PlaneGeometry(2, 2);
    scene.add(new THREE.Mesh(geometry, material));

    const setSize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      uniforms.uResolution.value.set(canvas.width, canvas.height);
      // In backing-store pixels, so it has to be rescaled with the ratio.
      uniforms.uPixelSize.value = pixelSize * renderer.getPixelRatio();
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(container);

    /*
      Park the loop when there is nothing to see.

      This is the part upstream leaves unfinished: its visibilityRef is set to
      { visible: true } at creation and never written to again, so the flag it tests
      every frame can never be false and the canvas shades a full viewport for as
      long as the page is open.
    */
    let onScreen = true;
    const io = new IntersectionObserver(
      entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
      },
      { rootMargin: '128px' },
    );
    io.observe(container);

    let lost = false;
    const onLost = (event: Event) => {
      event.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const minFrameSeconds = 1 / targetFps;
    // 2ms of slack: redraws land on animation frames, so the achievable rates are
    // the refresh divided by a whole number, and an exact comparison rejects a frame
    // that is short by rounding.
    const slack = 0.002;
    // Ceiling on how much a single frame may advance the animation. Frames stop
    // arriving when the tab is backgrounded and the whole gap is reported as one
    // delta; that time was not seen, so it is dropped rather than replayed.
    const maxDelta = minFrameSeconds * 1.5;

    const clock = new THREE.Clock();
    // Accumulated rather than clock.getElapsedTime(), which is what upstream uses.
    // Absolute elapsed time keeps advancing through a stall, so the pattern jumps
    // on return; this only advances by time that was actually rendered.
    let elapsed = 0;
    let banked = 0;

    let raf = requestAnimationFrame(function tick() {
      raf = requestAnimationFrame(tick);
      const delta = Math.min(clock.getDelta(), maxDelta);
      if (lost || !onScreen || document.hidden) return;

      banked += delta;
      if (banked + slack < minFrameSeconds) return;
      const consumed = Math.min(banked, maxDelta);
      banked = Math.min(banked - consumed, maxDelta);

      elapsed += consumed * speed;
      uniforms.uTime.value = elapsed;
      renderer.render(scene, camera);
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      geometry.dispose();
      material.dispose();
      // Frees the GL context; without it a remount leaks one per cycle and browsers
      // cap how many a page may hold.
      renderer.dispose();
      canvas.remove();
    };
  }, [
    variant,
    pixelSize,
    color,
    patternScale,
    patternDensity,
    pixelSizeJitter,
    enableRipples,
    rippleIntensityScale,
    rippleThickness,
    rippleSpeed,
    edgeFade,
    speed,
    maxPixelRatio,
    targetFps,
  ]);

  return <div ref={host} aria-hidden className={className} />;
}

export default PixelBlast;
