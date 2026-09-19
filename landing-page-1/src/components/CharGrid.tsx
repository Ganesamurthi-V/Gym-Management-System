import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════════════
   CharGrid — a flow field rendered as a grid of characters.

   This is the effect on the reference security template, reconstructed from its
   live shader rather than guessed at: the fragment source was read off the running
   WebGL program with getShaderSource, and the uniform values with getUniform. The
   flow field, the tangent walk in computeField and the atlas indexing in main are
   that shader's, formatting aside.

   Measured on the reference, which is what the values here are fitted to:
     grid pitch    10px, confirmed by autocorrelation (r 0.657 at lag 10)
     ink coverage  9.3% of pixels below luminance 245
     tone          sparse near-black marks on white, p01 115 and p50 255
     motion        mean 1.55/255 per 700ms

   Two things in its configuration are not copied. Its live uniforms read
   uIntensity 0 with uHasVideo true and no video element anywhere on the page, so
   the field is scaled to nothing and the texture it falls back to is not bound.
   The video path is dropped here and intensity is a real value, fitted below.
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * Glyph ramp, ordered from no ink to most. Ten entries, matching the reference's
 * uCharCount.
 *
 * Index 0 has to be blank: that is what leaves the field's quiet areas empty rather
 * than tiling a character across the whole layer.
 *
 * Every other entry is a fine mark, and that is the important constraint. Measured
 * per 10px cell, the reference never fills a cell beyond 20%: its marks are dots and
 * light punctuation, nothing heavier. An earlier ramp here ended in # % @, which fill
 * 35 to 55% of their cell, and 27% of cells landed on them. That is what made the
 * layer read as a grid of boxes instead of a wave, and it also flattened the flow:
 * dots strung along the field's streaks read as direction, while filled cells read as
 * uniform texture. Directional anisotropy measured 1.38 against the reference's 2.15.
 *
 * So the heavy glyphs are gone and the ramp tops out around * and =. The horizontal
 * strokes in the middle of it (- ~ =) also happen to sit along the flow, which helps
 * the streaks read.
 */
const RAMP = ' .,:;-~=+*';

/** Atlas cell in px. Only affects glyph crispness, not the on-screen grid pitch. */
const ATLAS_CELL = 64;

/**
 * Draws the ramp into a one-row atlas, white on transparent.
 *
 * The shader uses only the sampled alpha, so the fill colour is irrelevant and the
 * ink colour comes from uColor. A monospace face keeps every glyph on the same
 * advance, which matters because the atlas is indexed as evenly spaced cells.
 */
function createFontAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = ATLAS_CELL * RAMP.length;
  canvas.height = ATLAS_CELL;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.fillStyle = '#ffffff';
    /*
      0.95 of the cell, not the 0.82 this started at. Punctuation occupies a small
      part of its em box, so at 0.82 the marks came out lighter than the reference's:
      measured, 6.8% of our cells landed in its 8-20% fill band against its 20.7%,
      and total ink was 2.4% against its 4.2%. Scaling the face up scales each mark
      with it, which lifts both without touching the field or the ramp.
    */
    ctx.font = `${Math.round(ATLAS_CELL * 0.95)}px ui-monospace, "Geist Mono", monospace`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for (let i = 0; i < RAMP.length; i++) {
      ctx.fillText(RAMP[i], i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2);
    }
  }
  const texture = new THREE.CanvasTexture(canvas);
  texture.minFilter = THREE.LinearFilter;
  texture.magFilter = THREE.LinearFilter;
  texture.generateMipmaps = false;
  return texture;
}

const VERTEX_SRC = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`;

/*
  First pass: the expensive part, rendered at one fragment per cell into a render
  target. No glyphs and no colour here, only the grey level each cell will use.
*/
const FIELD_FRAGMENT_SRC = /* glsl */ `
precision highp float;

uniform float uTime;
uniform vec2  uResolution;
uniform float uScale;
uniform float uSpeed;
uniform float uIntensity;
uniform float uContrast;
uniform float uWaveTension;
uniform float uWaveTwist;

varying vec2 vUv;

float flowField(vec2 p, float t) {
  return sin(p.x + sin(p.y + t * 0.1)) * sin(p.y * p.x * 0.1 + t * 0.2);
}

/*
  Walks p along the flow field's own tangent, ten times, and returns the gradient
  it ends on. Advecting the sample point like this is what gives the pattern its
  streaked, curling structure rather than the blobs a plain noise lookup produces.
*/
vec2 computeField(vec2 p, float t) {
  vec2 ep = vec2(0.05, 0.0);
  vec2 result = vec2(0.0);
  float tension = uWaveTension;
  float twist = uWaveTwist;

  for (int i = 0; i < 10; i++) {
    float t0 = flowField(p, t);
    float t1 = flowField(p + ep.xy, t);
    float t2 = flowField(p + ep.yx, t);
    vec2 gradient = vec2((t1 - t0), (t2 - t0)) / ep.xx;
    vec2 tangent = vec2(-gradient.y, gradient.x);

    p += tangent * tension + gradient * 0.005;
    p.x += sin(t * 0.25) * twist;
    p.y += cos(t * 0.25) * twist;
    result = gradient;
  }

  return result;
}

void main() {
  // One fragment per cell: this pass renders into a target sized in cells, so the
  // aspect correction uses the layer's pixel size while the coordinate comes from
  // this pass's own uv.
  vec2 aspect = uResolution.x > uResolution.y
    ? vec2(uResolution.x / uResolution.y, 1.0)
    : vec2(uResolution.y / uResolution.x, 1.0);

  vec2 uv0 = vUv * aspect;
  vec2 field = computeField(uv0 * uScale, uTime * uSpeed);

  /*
    The curve is what spreads the ramp out. length(field) has a narrow distribution,
    so scaling it linearly puts nearly every cell just above the ink threshold and
    the grid comes out monotone: one dot weight everywhere, 18% of cells empty
    against the reference's 47%, and nothing in its 8-20% fill band at all.

    A power curve widens the spread instead of shifting it. Values below 1 are pushed
    down hard, so quiet cells fall under the threshold and go empty, while the peaks
    survive and reach further up the ramp. That is what gives the waves light and
    heavy passages rather than a uniform stipple.
  */
  float g = length(field) * uIntensity;
  float gray = clamp(pow(g, uContrast), 0.0, 1.0);
  gl_FragColor = vec4(gray, gray, gray, 1.0);
}
`;

/*
  Second pass: cheap. Reads the field one texel per cell and draws the glyph.

  Splitting the shader in two is what makes this affordable. computeField advects
  its sample point ten times and evaluates the flow field three times per
  iteration, so it is thirty sin-heavy evaluations, and the original ran that in
  every fragment. The result was already constant across each cell, because the
  coordinate was snapped before use, so all but one fragment per cell was repeating
  work someone else had already done: at a 10px cell that is 99% waste. Measured in
  this environment the single-pass version could not hold its frame budget at all.

  The field pass now renders at cell resolution, so a 1425x760 layer evaluates
  143x76 cells instead of 1.08M fragments. This pass is a nearest-neighbour texture
  read plus an atlas lookup.
*/
const COMPOSITE_FRAGMENT_SRC = /* glsl */ `
precision highp float;

uniform sampler2D uFieldTexture;
uniform sampler2D uFontTexture;
uniform vec2  uResolution;
uniform vec2  uCells;
uniform float uCharCount;
uniform vec3  uColor;
uniform float uSize;

varying vec2 vUv;

void main() {
  vec2 pix = vUv * uResolution;
  vec2 cellId = floor(pix / uSize);

  // Sample at the texel centre so nearest filtering cannot land between two cells.
  vec2 fieldUV = (cellId + 0.5) / uCells;
  float gray = texture2D(uFieldTexture, fieldUV).r;

  float charIndex = clamp(floor(gray * (uCharCount - 1.0)), 0.0, uCharCount - 1.0);

  vec2 cellUV = fract(pix / uSize);
  float charWidth = 1.0 / uCharCount;
  vec2 atlasUV = vec2(cellUV.x * charWidth + charIndex * charWidth, cellUV.y);

  float alpha = texture2D(uFontTexture, atlasUV).a;

  // The + 0.1 keeps the faintest glyphs from going fully transparent, so the ramp
  // reads as a gradient of density instead of cutting off.
  vec3 ink = uColor * (gray + 0.1);
  gl_FragColor = vec4(ink * alpha, alpha);
}
`;

export interface CharGridProps {
  className?: string;
  /** Ink colour. */
  color?: string;
  /** Cell pitch in CSS px. The reference uses 10. */
  size?: number;
  /** Field frequency. Higher packs more structure into the frame. */
  scale?: number;
  /** How fast the field evolves. */
  speed?: number;
  /**
   * Multiplier on the field's gradient magnitude before it becomes a grey level.
   *
   * This is the ink-coverage control: gray has to clear 1/(charCount-1) for a cell
   * to draw anything at all, so raising it fills the grid in and lowering it thins
   * it out.
   */
  intensity?: number;
  /**
   * Power curve applied to the grey level, which sets how far the ramp spreads.
   *
   * 1 is linear, and linear is too narrow here: the field's own distribution is tight,
   * so every cell lands on the same glyph. Above 1 pushes quiet cells below the ink
   * threshold while leaving the peaks, which is what produces empty space and varied
   * mark weight in the same frame.
   */
  contrast?: number;
  /** Tangent step in the advection walk. */
  waveTension?: number;
  /** Slow circular drift added each iteration. */
  waveTwist?: number;
  maxPixelRatio?: number;
  targetFps?: number;
}

export function CharGrid({
  className,
  color = '#2563eb',
  size = 10,
  scale = 6,
  speed = 1,
  intensity = 0.9,
  contrast = 2.2,
  waveTension = 0.5,
  waveTwist = 0.1,
  maxPixelRatio = 1.25,
  targetFps = 24,
}: CharGridProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const container = host.current;
    if (!container) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
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

    const atlas = createFontAtlas();

    // Pass 1 uniforms: the expensive field, evaluated once per cell.
    const fieldUniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      // CSS pixels, not the backing store. The grid pitch is a CSS length, so
      // feeding backing pixels would shrink every cell on a retina screen.
      uResolution: { value: new THREE.Vector2(1, 1) },
      uScale: { value: scale },
      uSpeed: { value: speed },
      uIntensity: { value: intensity },
      uContrast: { value: contrast },
      uWaveTension: { value: waveTension },
      uWaveTwist: { value: waveTwist },
    };

    // Pass 2 uniforms: the cheap composite.
    const compositeUniforms: Record<string, THREE.IUniform> = {
      uFieldTexture: { value: null },
      uFontTexture: { value: atlas },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCells: { value: new THREE.Vector2(1, 1) },
      uCharCount: { value: RAMP.length },
      uColor: { value: new THREE.Color(color) },
      uSize: { value: size },
    };

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);
    const geometry = new THREE.PlaneGeometry(2, 2);

    const fieldMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SRC,
      fragmentShader: FIELD_FRAGMENT_SRC,
      uniforms: fieldUniforms,
      depthTest: false,
      depthWrite: false,
    });
    const fieldScene = new THREE.Scene();
    fieldScene.add(new THREE.Mesh(geometry, fieldMaterial));

    const compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SRC,
      fragmentShader: COMPOSITE_FRAGMENT_SRC,
      uniforms: compositeUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    });
    const compositeScene = new THREE.Scene();
    compositeScene.add(new THREE.Mesh(geometry, compositeMaterial));

    /*
      Nearest filtering, and it is required rather than an optimisation: each texel
      is one cell, and linear filtering would blend neighbouring cells so a glyph
      could be chosen from a grey value that belongs to no cell at all. That reads as
      the grid softening into a gradient.
    */
    let target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    });
    compositeUniforms.uFieldTexture.value = target.texture;

    const setSize = () => {
      const w = container.clientWidth || 1;
      const h = container.clientHeight || 1;
      renderer.setSize(w, h, false);
      fieldUniforms.uResolution.value.set(w, h);
      compositeUniforms.uResolution.value.set(w, h);

      const cx = Math.max(1, Math.ceil(w / size));
      const cy = Math.max(1, Math.ceil(h / size));
      compositeUniforms.uCells.value.set(cx, cy);
      target.setSize(cx, cy);
    };
    setSize();
    const ro = new ResizeObserver(setSize);
    ro.observe(container);

    let onScreen = true;
    const io = new IntersectionObserver(
      entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
      },
      { rootMargin: '128px' },
    );
    io.observe(container);

    let lost = false;
    const onLost = (e: Event) => {
      e.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const minFrameSeconds = 1 / targetFps;
    const slack = 0.002;
    const maxDelta = minFrameSeconds * 1.5;
    const clock = new THREE.Clock();
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

      // Accumulated rather than absolute elapsed time, so a backgrounded tab does
      // not come back with the field jumped forward by the length of the stall.
      elapsed += consumed;
      fieldUniforms.uTime.value = elapsed;

      // Field into the cell-sized target, then composite it to the canvas.
      renderer.setRenderTarget(target);
      renderer.render(fieldScene, camera);
      renderer.setRenderTarget(null);
      renderer.render(compositeScene, camera);
    });

    return () => {
      cancelAnimationFrame(raf);
      ro.disconnect();
      io.disconnect();
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      geometry.dispose();
      fieldMaterial.dispose();
      compositeMaterial.dispose();
      atlas.dispose();
      target.dispose();
      renderer.dispose();
      canvas.remove();
    };
  }, [
    color,
    size,
    scale,
    speed,
    intensity,
    contrast,
    waveTension,
    waveTwist,
    maxPixelRatio,
    targetFps,
  ]);

  return <div ref={host} aria-hidden className={className} />;
}

export default CharGrid;
