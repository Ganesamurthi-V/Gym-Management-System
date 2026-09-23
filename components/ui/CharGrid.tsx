'use client'

import { useEffect, useRef } from 'react'
import * as THREE from 'three'

/* ═══════════════════════════════════════════════════════════════════════════
   CharGrid — a flow field rendered as a grid of characters.

   Ported from landing-page-1/src/components/CharGrid.tsx, which is the canonical
   copy. The two are separate builds with no shared package: the root has no npm
   workspaces and tsconfig.json excludes landing-page-1 outright, so there is no
   import path between them and this is a deliberate duplicate. The shader is
   identical on purpose — the point of it here is that the login panel carries the
   same effect as the marketing hero. If the shader changes in one, it has to change
   in both.

   The effect itself was reconstructed from the reference security template's live
   WebGL program rather than guessed at: the fragment source came off it with
   getShaderSource and the uniform values with getUniform. flowField, the tangent
   walk in computeField and the atlas indexing are that shader's.
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * Glyph ramp, from no ink to most. Ten entries, matching the reference's uCharCount.
 *
 * Index 0 must be blank: that is what leaves the field's quiet areas empty instead of
 * tiling a character across the whole layer.
 *
 * Everything else is a fine mark, which is the load-bearing constraint. Measured per
 * 10px cell, the reference never fills a cell past 20%. An earlier ramp ended in # % @,
 * which fill 35-55% of their cell, and 27% of cells landed on them — that is what made
 * the layer read as a grid of boxes rather than a wave, and it flattened the flow too,
 * since dots strung along a streak read as direction where filled cells read as texture.
 */
const RAMP = ' .,:;-~=+*'

/** Atlas cell in px. Affects glyph crispness only, not the on-screen grid pitch. */
const ATLAS_CELL = 64

/**
 * Draws the ramp into a one-row atlas, white on transparent.
 *
 * Only the sampled alpha is used, so the fill colour is irrelevant and the ink comes
 * from uColor. A monospace face keeps every glyph on the same advance, which matters
 * because the atlas is indexed as evenly spaced cells.
 */
function createFontAtlas(): THREE.CanvasTexture {
  const canvas = document.createElement('canvas')
  canvas.width = ATLAS_CELL * RAMP.length
  canvas.height = ATLAS_CELL
  const ctx = canvas.getContext('2d')
  if (ctx) {
    ctx.clearRect(0, 0, canvas.width, canvas.height)
    ctx.fillStyle = '#ffffff'
    // 0.95 of the cell. Punctuation fills a small part of its em box, so at the 0.82
    // this started on the marks came out lighter than the reference's; scaling the face
    // up scales each mark with it without touching the field or the ramp.
    ctx.font = `${Math.round(ATLAS_CELL * 0.95)}px ui-monospace, SFMono-Regular, Menlo, monospace`
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    for (let i = 0; i < RAMP.length; i++) {
      ctx.fillText(RAMP[i], i * ATLAS_CELL + ATLAS_CELL / 2, ATLAS_CELL / 2)
    }
  }
  const texture = new THREE.CanvasTexture(canvas)
  texture.minFilter = THREE.LinearFilter
  texture.magFilter = THREE.LinearFilter
  texture.generateMipmaps = false
  return texture
}

const VERTEX_SRC = /* glsl */ `
varying vec2 vUv;
void main() {
  vUv = uv;
  gl_Position = vec4(position, 1.0);
}
`

/*
  First pass: the expensive part, one fragment per cell into a render target. No glyphs
  and no colour, only the grey level each cell will use.
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
  Walks p along the flow field's own tangent ten times and returns the gradient it ends
  on. Advecting the sample point is what gives the pattern its streaked, curling
  structure rather than the blobs a plain noise lookup produces.
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
  vec2 aspect = uResolution.x > uResolution.y
    ? vec2(uResolution.x / uResolution.y, 1.0)
    : vec2(uResolution.y / uResolution.x, 1.0);

  vec2 uv0 = vUv * aspect;
  vec2 field = computeField(uv0 * uScale, uTime * uSpeed);

  /*
    The curve is what spreads the ramp out. length(field) has a narrow distribution, so
    scaling it linearly puts nearly every cell just above the ink threshold and the grid
    comes out monotone. A power curve widens the spread instead of shifting it: values
    below 1 are pushed down hard, so quiet cells drop under the threshold and go empty
    while the peaks survive and reach further up the ramp.
  */
  float g = length(field) * uIntensity;
  float gray = clamp(pow(g, uContrast), 0.0, 1.0);
  gl_FragColor = vec4(gray, gray, gray, 1.0);
}
`

/*
  Second pass: cheap. Reads the field one texel per cell and draws the glyph.

  Splitting the shader in two is what makes this affordable. computeField is thirty
  sin-heavy evaluations, and the original ran it per fragment while the result was
  already constant across each cell — at a 10px cell that is 99% repeated work, and the
  single-pass version could not hold its frame budget at all. The field pass now runs at
  cell resolution, so an 80x90 cell panel evaluates 7,200 cells rather than 712,800
  fragments.
*/
const COMPOSITE_FRAGMENT_SRC = /* glsl */ `
precision highp float;

uniform sampler2D uFieldTexture;
uniform sampler2D uFontTexture;
uniform vec2  uResolution;
uniform vec2  uCells;
uniform float uCharCount;
uniform vec3  uColor;
uniform vec3  uColorTint;
uniform float uSize;

varying vec2 vUv;

void main() {
  vec2 pix = vUv * uResolution;
  vec2 cellId = floor(pix / uSize);

  // Texel centre, so nearest filtering cannot land between two cells.
  vec2 fieldUV = (cellId + 0.5) / uCells;
  float gray = texture2D(uFieldTexture, fieldUV).r;

  float charIndex = clamp(floor(gray * (uCharCount - 1.0)), 0.0, uCharCount - 1.0);

  vec2 cellUV = fract(pix / uSize);
  float charWidth = 1.0 / uCharCount;
  vec2 atlasUV = vec2(cellUV.x * charWidth + charIndex * charWidth, cellUV.y);

  float alpha = texture2D(uFontTexture, atlasUV).a;

  /*
    Two inks, mixed by the cell's own density, keyed to gray rather than to position so
    the colour follows the flow instead of sitting over it as a gradient.

    uColorTint carries the faint end and uColor the dense end. That direction matters:
    the other way round puts the tint on the heaviest glyphs, which are exactly the marks
    doing the most to make the grid visible, and the layer reads washed out. It costs
    nothing in contrast either way, because the extreme ink is reached at one end or the
    other regardless — only which glyphs get it changes.
  */
  vec3 ink = mix(uColorTint, uColor, gray) * (gray + 0.1);
  gl_FragColor = vec4(ink * alpha, alpha);
}
`

export interface CharGridProps {
  className?: string
  /** Ink for the dense end of the ramp, where the heaviest glyphs are. */
  color?: string
  /**
   * Ink for the faint end, mixed out toward `color` as cells get denser. Defaults to
   * `color`, which gives a single flat ink. Contrast is governed by `color` alone, since
   * that is the end the mix reaches at full density.
   */
  colorTint?: string
  /** Cell pitch in CSS px. The reference uses 10. */
  size?: number
  /** Field frequency. Higher packs more structure into the frame. */
  scale?: number
  /** How fast the field evolves. */
  speed?: number
  /**
   * Multiplier on the gradient magnitude before it becomes a grey level. gray must clear
   * 1/(charCount-1) for a cell to draw at all, so this sets ink coverage.
   */
  intensity?: number
  /**
   * Power curve on the grey level, setting how far the ramp spreads. 1 is linear and too
   * narrow here; above 1 pushes quiet cells under the ink threshold while leaving the
   * peaks, which is what gives empty space and varied mark weight in one frame.
   */
  contrast?: number
  /** Tangent step in the advection walk. */
  waveTension?: number
  /** Slow circular drift added each iteration. */
  waveTwist?: number
  maxPixelRatio?: number
  targetFps?: number
}

export function CharGrid({
  className,
  color = '#ffffff',
  colorTint,
  size = 10,
  scale = 4,
  speed = 1,
  intensity = 1.115,
  contrast = 2.298,
  waveTension = 0.5,
  waveTwist = 0.1,
  maxPixelRatio = 1.25,
  targetFps = 24,
}: CharGridProps) {
  const host = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const container = host.current
    if (!container) return

    let renderer: THREE.WebGLRenderer
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: false,
        alpha: true,
        powerPreference: 'low-power',
      })
    } catch {
      // No WebGL, or it is blocked. The panel keeps its own background.
      return
    }

    renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, maxPixelRatio))
    renderer.setClearAlpha(0)
    const canvas = renderer.domElement
    canvas.style.display = 'block'
    canvas.style.width = '100%'
    canvas.style.height = '100%'
    container.appendChild(canvas)

    const atlas = createFontAtlas()

    const fieldUniforms: Record<string, THREE.IUniform> = {
      uTime: { value: 0 },
      // CSS pixels, not the backing store: the grid pitch is a CSS length, so feeding
      // backing pixels would shrink every cell on a retina screen.
      uResolution: { value: new THREE.Vector2(1, 1) },
      uScale: { value: scale },
      uSpeed: { value: speed },
      uIntensity: { value: intensity },
      uContrast: { value: contrast },
      uWaveTension: { value: waveTension },
      uWaveTwist: { value: waveTwist },
    }

    const compositeUniforms: Record<string, THREE.IUniform> = {
      uFieldTexture: { value: null },
      uFontTexture: { value: atlas },
      uResolution: { value: new THREE.Vector2(1, 1) },
      uCells: { value: new THREE.Vector2(1, 1) },
      uCharCount: { value: RAMP.length },
      uColor: { value: new THREE.Color(color) },
      uColorTint: { value: new THREE.Color(colorTint ?? color) },
      uSize: { value: size },
    }

    const camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1)
    const geometry = new THREE.PlaneGeometry(2, 2)

    const fieldMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SRC,
      fragmentShader: FIELD_FRAGMENT_SRC,
      uniforms: fieldUniforms,
      depthTest: false,
      depthWrite: false,
    })
    const fieldScene = new THREE.Scene()
    fieldScene.add(new THREE.Mesh(geometry, fieldMaterial))

    const compositeMaterial = new THREE.ShaderMaterial({
      vertexShader: VERTEX_SRC,
      fragmentShader: COMPOSITE_FRAGMENT_SRC,
      uniforms: compositeUniforms,
      transparent: true,
      depthTest: false,
      depthWrite: false,
    })
    const compositeScene = new THREE.Scene()
    compositeScene.add(new THREE.Mesh(geometry, compositeMaterial))

    /*
      Nearest filtering, and it is required rather than an optimisation: each texel is
      one cell, and linear filtering would blend neighbours so a glyph could be chosen
      from a grey value belonging to no cell at all. That reads as the grid softening
      into a gradient.
    */
    const target = new THREE.WebGLRenderTarget(1, 1, {
      minFilter: THREE.NearestFilter,
      magFilter: THREE.NearestFilter,
      depthBuffer: false,
      stencilBuffer: false,
    })
    compositeUniforms.uFieldTexture.value = target.texture

    const setSize = () => {
      const w = container.clientWidth || 1
      const h = container.clientHeight || 1
      renderer.setSize(w, h, false)
      fieldUniforms.uResolution.value.set(w, h)
      compositeUniforms.uResolution.value.set(w, h)

      const cx = Math.max(1, Math.ceil(w / size))
      const cy = Math.max(1, Math.ceil(h / size))
      compositeUniforms.uCells.value.set(cx, cy)
      target.setSize(cx, cy)
    }
    setSize()
    const ro = new ResizeObserver(setSize)
    ro.observe(container)

    let onScreen = true
    const io = new IntersectionObserver(
      (entries) => {
        onScreen = entries[entries.length - 1].isIntersecting
      },
      { rootMargin: '128px' },
    )
    io.observe(container)

    let lost = false
    const onLost = (e: Event) => {
      e.preventDefault()
      lost = true
    }
    const onRestored = () => {
      lost = false
    }
    canvas.addEventListener('webglcontextlost', onLost)
    canvas.addEventListener('webglcontextrestored', onRestored)

    const minFrameSeconds = 1 / targetFps
    const slack = 0.002
    const maxDelta = minFrameSeconds * 1.5
    const clock = new THREE.Clock()
    let elapsed = 0
    let banked = 0

    let raf = requestAnimationFrame(function tick() {
      raf = requestAnimationFrame(tick)
      const delta = Math.min(clock.getDelta(), maxDelta)
      if (lost || !onScreen || document.hidden) return

      banked += delta
      if (banked + slack < minFrameSeconds) return
      const consumed = Math.min(banked, maxDelta)
      banked = Math.min(banked - consumed, maxDelta)

      // Accumulated rather than absolute, so a backgrounded tab does not come back with
      // the field jumped forward by the length of the stall.
      elapsed += consumed
      fieldUniforms.uTime.value = elapsed

      renderer.setRenderTarget(target)
      renderer.render(fieldScene, camera)
      renderer.setRenderTarget(null)
      renderer.render(compositeScene, camera)
    })

    return () => {
      cancelAnimationFrame(raf)
      ro.disconnect()
      io.disconnect()
      canvas.removeEventListener('webglcontextlost', onLost)
      canvas.removeEventListener('webglcontextrestored', onRestored)
      geometry.dispose()
      fieldMaterial.dispose()
      compositeMaterial.dispose()
      atlas.dispose()
      target.dispose()
      renderer.dispose()
      canvas.remove()
    }
  }, [
    color,
    colorTint,
    size,
    scale,
    speed,
    intensity,
    contrast,
    waveTension,
    waveTwist,
    maxPixelRatio,
    targetFps,
  ])

  return <div ref={host} aria-hidden className={className} />
}

export default CharGrid
