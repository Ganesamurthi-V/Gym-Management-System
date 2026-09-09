import { useEffect, useRef } from 'react';
import * as THREE from 'three';

/* ═══════════════════════════════════════════════════════════════════════════
   Beams — crossing animated ribbons, lit from the front.

   Ported from ReactBits' Beams, which ships as an @react-three/fiber tree. The
   shader, the stacked-plane geometry and the material patching below are that
   component's; the renderer, camera, lights and frame loop are hand-rolled
   because fiber and drei were only supplying <Canvas>, useFrame and
   <PerspectiveCamera> — about forty lines of setup in exchange for two more
   packages on a decorative background.

   Two behaviours added on top of the original, both mattering on a marketing
   page: the loop parks itself when the canvas leaves the viewport or the tab
   goes to the background (upstream runs frameloop="always" forever), and a
   missing WebGL context returns quietly instead of throwing, so the hero just
   keeps its CSS gradient.
   ═════════════════════════════════════════════════════════════════════════ */

/**
 * The shape of an entry in THREE.ShaderLib, declared locally rather than
 * imported. three has moved this type around between releases and the deep
 * import path is not part of its public surface; matching it structurally means
 * a three upgrade cannot break the build here.
 */
interface ShaderSource {
  uniforms: Record<string, THREE.IUniform>;
  vertexShader: string;
  fragmentShader: string;
  defines?: Record<string, string | number | boolean>;
}

/**
 * Default ceiling on the backing-store resolution.
 *
 * Fragment cost scales with the square of this, and it is the single biggest
 * lever on the whole effect. Measured with GPU timer queries on Intel Iris Xe:
 * 1.54 megapixels costs 0.97ms of GPU time a frame, 3.46 costs 2.06ms — about
 * 0.6ms per megapixel. 1.5 rather than fiber's 2 is a 44% cut in fragments.
 *
 * Overridable per device because a phone wants less again: see HeroBeams, which
 * drops it further where the screen is small and the GPU is not.
 *
 * Safe to lower because there is no detail here to preserve — broad soft
 * gradients with a dither on top resample invisibly. Text or thin geometry would
 * be a different argument.
 */
const DEFAULT_MAX_PIXEL_RATIO = 1.5;

/**
 * Default redraw ceiling, independent of the display's refresh rate.
 *
 * The motion is a slow noise scroll with no edges to judder. Measured, the mean
 * pixel change between consecutive redraws at 30fps is 0.075 of 255 — about
 * thirteen times finer than one 8-bit colour step — so consecutive frames are
 * very nearly identical and redrawing more often buys nothing visible. On a 90Hz
 * panel this skips two of every three frames.
 *
 * A ceiling, not an exact rate. Redraws can only happen on animation frames, so
 * the achievable rates are the refresh divided by a whole number: on a 90Hz panel
 * a 30fps budget lands cleanly every third frame, but the 20fps used on phones
 * falls between the fourth and fifth and measures nearer 15-18. That is under
 * budget, never over, which is the direction that matters.
 *
 * The uniform advances by real elapsed time regardless, so this drops frames
 * without changing how fast the ribbons travel — verified at 0.1 of uniform time
 * per wall second at both 30 and 20, which is what the loop is written to produce.
 */
const DEFAULT_TARGET_FPS = 30;

/**
 * Slack on the frame-budget test, and it is load-bearing.
 *
 * Redraws can only land on animation frames, so the achievable rates are the
 * display's refresh divided by a whole number. On a 90Hz panel three frames bank
 * 33.30ms against a 33.33ms threshold — short by three hundredths of a
 * millisecond — so an exact comparison rejects it and waits for a fourth frame.
 * That is 22.5fps, and measured against a 30fps target this ran at 25.
 *
 * 2ms is under a quarter of the shortest realistic frame, so it can only ever
 * pull in a redraw that was already within rounding distance of being due.
 */
const FRAME_BUDGET_SLACK_SECONDS = 0.002;

type UniformValue = THREE.IUniform<unknown> | unknown;

interface ExtendMaterialConfig {
  header: string;
  vertexHeader?: string;
  fragmentHeader?: string;
  material?: THREE.MeshPhysicalMaterialParameters & { fog?: boolean };
  uniforms?: Record<string, UniformValue>;
  vertex?: Record<string, string>;
  fragment?: Record<string, string>;
}

/**
 * Rebuilds three's physical material as a ShaderMaterial with extra code spliced
 * into its shader chunks.
 *
 * The ribbons need real lighting — they read as lit surfaces, not flat colour —
 * so the displacement has to happen inside the standard material's pipeline
 * rather than in a standalone shader. three has no public hook for that, hence
 * copying ShaderLib.physical and string-replacing its #include lines.
 */
function extendMaterial<T extends THREE.Material = THREE.Material>(
  BaseMaterial: new (params?: THREE.MaterialParameters) => T,
  cfg: ExtendMaterialConfig,
): THREE.ShaderMaterial {
  const physical = THREE.ShaderLib.physical as unknown as ShaderSource;
  const {
    vertexShader: baseVert,
    fragmentShader: baseFrag,
    uniforms: baseUniforms,
  } = physical;
  const baseDefines = physical.defines ?? {};

  const uniforms: Record<string, THREE.IUniform> = THREE.UniformsUtils.clone(baseUniforms);

  const defaults = new BaseMaterial(cfg.material || {}) as T & {
    color?: THREE.Color;
    roughness?: number;
    metalness?: number;
    envMap?: THREE.Texture;
    envMapIntensity?: number;
  };

  if (defaults.color) uniforms.diffuse.value = defaults.color;
  if ('roughness' in defaults) uniforms.roughness.value = defaults.roughness;
  if ('metalness' in defaults) uniforms.metalness.value = defaults.metalness;
  if ('envMap' in defaults) uniforms.envMap.value = defaults.envMap;
  if ('envMapIntensity' in defaults) {
    uniforms.envMapIntensity.value = defaults.envMapIntensity;
  }

  Object.entries(cfg.uniforms ?? {}).forEach(([key, u]) => {
    uniforms[key] =
      u !== null && typeof u === 'object' && 'value' in u
        ? (u as THREE.IUniform<unknown>)
        : ({ value: u } as THREE.IUniform<unknown>);
  });

  let vert = `${cfg.header}\n${cfg.vertexHeader ?? ''}\n${baseVert}`;
  let frag = `${cfg.header}\n${cfg.fragmentHeader ?? ''}\n${baseFrag}`;

  for (const [inc, code] of Object.entries(cfg.vertex ?? {})) {
    vert = vert.replace(inc, `${inc}\n${code}`);
  }
  for (const [inc, code] of Object.entries(cfg.fragment ?? {})) {
    frag = frag.replace(inc, `${inc}\n${code}`);
  }

  return new THREE.ShaderMaterial({
    defines: { ...baseDefines },
    uniforms,
    vertexShader: vert,
    fragmentShader: frag,
    lights: true,
    fog: !!cfg.material?.fog,
  });
}

const hexToNormalizedRGB = (hex: string): [number, number, number] => {
  const clean = hex.replace('#', '');
  const r = parseInt(clean.substring(0, 2), 16);
  const g = parseInt(clean.substring(2, 4), 16);
  const b = parseInt(clean.substring(4, 6), 16);
  return [r / 255, g / 255, b / 255];
};

/** Value noise for the grain, classic Perlin (cnoise) for the ribbon warp. */
const noise = `
float random (in vec2 st) {
    return fract(sin(dot(st.xy,
                         vec2(12.9898,78.233)))*
        43758.5453123);
}
float noise (in vec2 st) {
    vec2 i = floor(st);
    vec2 f = fract(st);
    float a = random(i);
    float b = random(i + vec2(1.0, 0.0));
    float c = random(i + vec2(0.0, 1.0));
    float d = random(i + vec2(1.0, 1.0));
    vec2 u = f * f * (3.0 - 2.0 * f);
    return mix(a, b, u.x) +
           (c - a)* u.y * (1.0 - u.x) +
           (d - b) * u.x * u.y;
}
vec4 permute(vec4 x){return mod(((x*34.0)+1.0)*x, 289.0);}
vec4 taylorInvSqrt(vec4 r){return 1.79284291400159 - 0.85373472095314 * r;}
vec3 fade(vec3 t) {return t*t*t*(t*(t*6.0-15.0)+10.0);}
float cnoise(vec3 P){
  vec3 Pi0 = floor(P);
  vec3 Pi1 = Pi0 + vec3(1.0);
  Pi0 = mod(Pi0, 289.0);
  Pi1 = mod(Pi1, 289.0);
  vec3 Pf0 = fract(P);
  vec3 Pf1 = Pf0 - vec3(1.0);
  vec4 ix = vec4(Pi0.x, Pi1.x, Pi0.x, Pi1.x);
  vec4 iy = vec4(Pi0.yy, Pi1.yy);
  vec4 iz0 = Pi0.zzzz;
  vec4 iz1 = Pi1.zzzz;
  vec4 ixy = permute(permute(ix) + iy);
  vec4 ixy0 = permute(ixy + iz0);
  vec4 ixy1 = permute(ixy + iz1);
  vec4 gx0 = ixy0 / 7.0;
  vec4 gy0 = fract(floor(gx0) / 7.0) - 0.5;
  gx0 = fract(gx0);
  vec4 gz0 = vec4(0.5) - abs(gx0) - abs(gy0);
  vec4 sz0 = step(gz0, vec4(0.0));
  gx0 -= sz0 * (step(0.0, gx0) - 0.5);
  gy0 -= sz0 * (step(0.0, gy0) - 0.5);
  vec4 gx1 = ixy1 / 7.0;
  vec4 gy1 = fract(floor(gx1) / 7.0) - 0.5;
  gx1 = fract(gx1);
  vec4 gz1 = vec4(0.5) - abs(gx1) - abs(gy1);
  vec4 sz1 = step(gz1, vec4(0.0));
  gx1 -= sz1 * (step(0.0, gx1) - 0.5);
  gy1 -= sz1 * (step(0.0, gy1) - 0.5);
  vec3 g000 = vec3(gx0.x,gy0.x,gz0.x);
  vec3 g100 = vec3(gx0.y,gy0.y,gz0.y);
  vec3 g010 = vec3(gx0.z,gy0.z,gz0.z);
  vec3 g110 = vec3(gx0.w,gy0.w,gz0.w);
  vec3 g001 = vec3(gx1.x,gy1.x,gz1.x);
  vec3 g101 = vec3(gx1.y,gy1.y,gz1.y);
  vec3 g011 = vec3(gx1.z,gy1.z,gz1.z);
  vec3 g111 = vec3(gx1.w,gy1.w,gz1.w);
  vec4 norm0 = taylorInvSqrt(vec4(dot(g000,g000),dot(g010,g010),dot(g100,g100),dot(g110,g110)));
  g000 *= norm0.x; g010 *= norm0.y; g100 *= norm0.z; g110 *= norm0.w;
  vec4 norm1 = taylorInvSqrt(vec4(dot(g001,g001),dot(g011,g011),dot(g101,g101),dot(g111,g111)));
  g001 *= norm1.x; g011 *= norm1.y; g101 *= norm1.z; g111 *= norm1.w;
  float n000 = dot(g000, Pf0);
  float n100 = dot(g100, vec3(Pf1.x,Pf0.yz));
  float n010 = dot(g010, vec3(Pf0.x,Pf1.y,Pf0.z));
  float n110 = dot(g110, vec3(Pf1.xy,Pf0.z));
  float n001 = dot(g001, vec3(Pf0.xy,Pf1.z));
  float n101 = dot(g101, vec3(Pf1.x,Pf0.y,Pf1.z));
  float n011 = dot(g011, vec3(Pf0.x,Pf1.yz));
  float n111 = dot(g111, Pf1);
  vec3 fade_xyz = fade(Pf0);
  vec4 n_z = mix(vec4(n000,n100,n010,n110),vec4(n001,n101,n011,n111),fade_xyz.z);
  vec2 n_yz = mix(n_z.xy,n_z.zw,fade_xyz.y);
  float n_xyz = mix(n_yz.x,n_yz.y,fade_xyz.x);
  return 2.2 * n_xyz;
}
`;

function buildBeamMaterial(opts: {
  beamColor: string;
  speed: number;
  noiseIntensity: number;
  scale: number;
  lightMode: boolean;
  roughness: number;
}): THREE.ShaderMaterial {
  return extendMaterial(THREE.MeshStandardMaterial, {
    header: `
  varying vec3 vEye;
  varying float vNoise;
  varying vec2 vUv;
  varying vec3 vPosition;
  uniform float time;
  uniform float uSpeed;
  uniform float uNoiseIntensity;
  uniform float uScale;
  ${noise}`,
    vertexHeader: `
  float getPos(vec3 pos) {
    vec3 noisePos =
      vec3(pos.x * 0., pos.y - uv.y, pos.z + time * uSpeed * 3.) * uScale;
    return cnoise(noisePos);
  }
  vec3 getCurrentPos(vec3 pos) {
    vec3 newpos = pos;
    newpos.z += getPos(pos);
    return newpos;
  }
  vec3 getNormal(vec3 pos) {
    vec3 curpos = getCurrentPos(pos);
    vec3 nextposX = getCurrentPos(pos + vec3(0.01, 0.0, 0.0));
    vec3 nextposZ = getCurrentPos(pos + vec3(0.0, -0.01, 0.0));
    vec3 tangentX = normalize(nextposX - curpos);
    vec3 tangentZ = normalize(nextposZ - curpos);
    return normalize(cross(tangentZ, tangentX));
  }`,
    fragmentHeader: 'uniform float uLightMode;',
    vertex: {
      '#include <begin_vertex>': `transformed.z += getPos(transformed.xyz);`,
      '#include <beginnormal_vertex>': `objectNormal = getNormal(position.xyz);`,
    },
    fragment: {
      '#include <dithering_fragment>': `
    float randomNoise = noise(gl_FragCoord.xy);
    gl_FragColor.rgb -= randomNoise / 15. * uNoiseIntensity;
    if (uLightMode > 0.5) {
      float energy = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);
      vec3 chroma = clamp(gl_FragColor.rgb / max(energy, 0.0001), 0.0, 1.0);
      chroma = pow(chroma, vec3(1.2));
      gl_FragColor.rgb = mix(vec3(1.0), chroma, clamp(energy * 0.98, 0.0, 0.94));
    }`,
    },
    material: { fog: true },
    uniforms: {
      diffuse: new THREE.Color(...hexToNormalizedRGB(opts.beamColor)),
      time: { shared: true, mixed: true, linked: true, value: 0 },
      roughness: opts.roughness,
      metalness: 0.3,
      uSpeed: { shared: true, mixed: true, linked: true, value: opts.speed },
      envMapIntensity: 10,
      uNoiseIntensity: opts.noiseIntensity,
      uScale: opts.scale,
      uLightMode: opts.lightMode ? 1 : 0,
    },
  });
}

/**
 * n vertical ribbons side by side in a single buffer.
 *
 * One geometry rather than n meshes: every ribbon shares the same material and
 * the same per-frame uniform, so merging them turns n draw calls into one. Each
 * ribbon gets a random UV offset, which is what stops them warping in unison —
 * the vertex shader reads uv.y, so a shared UV would make twelve identical
 * ribbons.
 */
function createStackedPlanesBufferGeometry(
  n: number,
  width: number,
  height: number,
  spacing: number,
  heightSegments: number,
): THREE.BufferGeometry {
  const geometry = new THREE.BufferGeometry();
  const numVertices = n * (heightSegments + 1) * 2;
  const numFaces = n * heightSegments * 2;
  const positions = new Float32Array(numVertices * 3);
  const indices = new Uint32Array(numFaces * 3);
  const uvs = new Float32Array(numVertices * 2);

  let vertexOffset = 0;
  let indexOffset = 0;
  let uvOffset = 0;
  const totalWidth = n * width + (n - 1) * spacing;
  const xOffsetBase = -totalWidth / 2;

  for (let i = 0; i < n; i++) {
    const xOffset = xOffsetBase + i * (width + spacing);
    const uvXOffset = Math.random() * 300;
    const uvYOffset = Math.random() * 300;

    for (let j = 0; j <= heightSegments; j++) {
      const y = height * (j / heightSegments - 0.5);
      const v0 = [xOffset, y, 0];
      const v1 = [xOffset + width, y, 0];
      positions.set([...v0, ...v1], vertexOffset * 3);

      const uvY = j / heightSegments;
      uvs.set([uvXOffset, uvY + uvYOffset, uvXOffset + 1, uvY + uvYOffset], uvOffset);

      if (j < heightSegments) {
        const a = vertexOffset,
          b = vertexOffset + 1,
          c = vertexOffset + 2,
          d = vertexOffset + 3;
        indices.set([a, b, c, c, b, d], indexOffset);
        indexOffset += 6;
      }
      vertexOffset += 2;
      uvOffset += 4;
    }
  }

  geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geometry.setIndex(new THREE.BufferAttribute(indices, 1));
  geometry.computeVertexNormals();
  return geometry;
}

export interface BeamsProps {
  beamWidth?: number;
  beamHeight?: number;
  beamNumber?: number;
  /** Colour of the directional light, i.e. what the ribbons are lit with. */
  lightColor?: string;
  /**
   * Base colour of the ribbon surface, and the material's diffuse term.
   *
   * Pure black means no diffuse response at all, leaving the ribbons lit only by
   * specular — which localises visibility to wherever the highlight lobes land
   * and starves the rest of the frame. Any non-black value restores a
   * view-independent term that reads evenly across the whole field.
   */
  beamColor?: string;
  /** Must match the page behind the canvas or its edges show as a hard rectangle. */
  backgroundColor?: string;
  speed?: number;
  noiseIntensity?: number;
  scale?: number;
  /** Degrees, clockwise, applied to the whole ribbon group. */
  rotation?: number;
  lightMode?: boolean;
  className?: string;
  /**
   * Ceiling on devicePixelRatio for the backing store. The dominant cost knob —
   * fragment work scales with its square.
   */
  maxPixelRatio?: number;
  /** Redraws per second, capped independently of the display's refresh rate. */
  targetFps?: number;
  /**
   * Vertical field of view, degrees. Governs how much of the ribbon slab is on
   * screen: wider fov means more, smaller ribbons.
   */
  fov?: number;
  /** Brightness of the key light. */
  lightIntensity?: number;
  /**
   * Surface roughness, 0-1. Widens or tightens the specular lobe.
   *
   * Low values give a tight highlight that covers a small part of the frame,
   * which is what concentrates brightness into one corner. Higher values spread
   * the same energy over much more of the surface.
   */
  roughness?: number;
  /**
   * Intensity of each fill light, as a fraction of the key.
   *
   * With beamColor black the ribbons are lit almost entirely by specular
   * response, so a single light puts its highlight in one screen corner and
   * starves the rest. Three fills spread matching highlights across both
   * diagonals — see the placement note where they are created.
   *
   * Raising this past roughly 0.6 starts to cost the effect its definition: every
   * fill adds light everywhere, and the black between ribbons is what makes their
   * edges read. 0 disables them and leaves the single key light.
   */
  fillLightRatio?: number;
}

export function Beams({
  beamWidth = 2,
  beamHeight = 15,
  beamNumber = 12,
  lightColor = '#ffffff',
  beamColor = '#000000',
  backgroundColor = '#000000',
  speed = 2,
  noiseIntensity = 1.75,
  scale = 0.2,
  rotation = 0,
  lightMode = false,
  className,
  maxPixelRatio = DEFAULT_MAX_PIXEL_RATIO,
  targetFps = DEFAULT_TARGET_FPS,
  fov = 30,
  lightIntensity = 1,
  // 0.85 was right when there was one fill; with three it would triple the added
  // light and wash the blacks back out.
  fillLightRatio = 0.5,
  roughness = 0.3,
}: BeamsProps) {
  const host = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = host.current;
    if (!el) return;

    // A blocked or unavailable context throws here. Returning leaves the host
    // div empty and the hero's CSS gradient does the job on its own.
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({
        antialias: true,
        alpha: false,
        // Decoration should not be a reason to spin up a discrete GPU.
        powerPreference: 'low-power',
      });
    } catch {
      return;
    }

    const size = () => ({
      w: el.clientWidth || 1,
      h: el.clientHeight || 1,
    });

    let { w, h } = size();
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, maxPixelRatio));
    renderer.setSize(w, h, false);

    const canvas = renderer.domElement;
    canvas.style.display = 'block';
    canvas.style.width = '100%';
    canvas.style.height = '100%';
    el.appendChild(canvas);

    const scene = new THREE.Scene();
    scene.background = new THREE.Color(backgroundColor);

    const camera = new THREE.PerspectiveCamera(fov, w / h, 0.1, 200);
    camera.position.set(0, 0, 20);

    const material = buildBeamMaterial({
      beamColor,
      speed,
      noiseIntensity,
      scale,
      lightMode,
      roughness,
    });
    const geometry = createStackedPlanesBufferGeometry(
      beamNumber,
      beamWidth,
      beamHeight,
      0,
      100,
    );

    const group = new THREE.Group();
    group.rotation.z = THREE.MathUtils.degToRad(rotation);
    group.add(new THREE.Mesh(geometry, material));

    // Inside the group so they rotate with the ribbons — the highlight has to
    // stay in the same place relative to them, or rotation slides the lit band
    // off the beams.
    const keyLight = new THREE.DirectionalLight(new THREE.Color(lightColor), lightIntensity);
    keyLight.position.set(0, 3, 10);
    group.add(keyLight);

    /*
      Mirrored fill.

      With beamColor black there is no diffuse term, so what is visible is the
      specular lobe, and its screen position follows the half-vector between the
      view and light directions. The key light's +3 in y biases that lobe toward
      group-space +y, which a 45 degree group rotation maps to screen up-left —
      one bright corner and a starved opposite one.

      Negating only the y offset puts a second lobe in the opposite corner. z
      stays positive: mirroring the whole position through the origin would put
      the light behind the slab, lighting a back face the camera never sees.

      Slightly under the key rather than equal to it — matching them exactly
      flattens the field into an even wash and loses any sense of a light
      direction.
    */
    if (fillLightRatio > 0) {
      /*
        Three fills, not one, placed so their lobes land on both diagonals.

        A light at (px, py, 10) puts its brightest point at group-space
        (2*px, 2*py). The key's (0, 3) lands at group (0, 6), which the 45 degree
        rotation sends to screen up-left; its mirror (0, -3) lands down-right.
        Those two share one diagonal and leave the other unlit, so offsetting the
        remaining pair in x instead of y — group (+-6, 0) — sends them to screen
        up-right and down-left.

        Four tight lobes rather than one broad one. Widening the lobe would cover
        the same area but is what turned the ribbons into a wash: brightness has to
        stay a function of ribbon geometry, not of distance from a light.
      */
      const fillOffsets: ReadonlyArray<readonly [number, number]> = [
        [0, -3],
        [3, 0],
        [-3, 0],
      ];
      for (const [x, y] of fillOffsets) {
        const fill = new THREE.DirectionalLight(
          new THREE.Color(lightColor),
          lightIntensity * fillLightRatio,
        );
        fill.position.set(x, y, 10);
        group.add(fill);
      }
    }

    scene.add(group);
    scene.add(new THREE.AmbientLight(0xffffff, 1));

    const resize = () => {
      ({ w, h } = size());
      renderer.setSize(w, h, false);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    const ro = new ResizeObserver(resize);
    ro.observe(el);

    // Scrolled past the hero, there is nothing to see — but frameloop="always"
    // would keep shading a full-viewport canvas the whole way down the page.
    let onScreen = true;
    const io = new IntersectionObserver(
      entries => {
        onScreen = entries[entries.length - 1].isIntersecting;
      },
      { rootMargin: '128px' },
    );
    io.observe(el);

    let lost = false;
    const onLost = (event: Event) => {
      // Default behaviour is to never restore; preventing it lets the browser
      // hand the context back, but until then stop touching the renderer.
      event.preventDefault();
      lost = true;
    };
    const onRestored = () => {
      lost = false;
    };
    canvas.addEventListener('webglcontextlost', onLost);
    canvas.addEventListener('webglcontextrestored', onRestored);

    const minFrameSeconds = 1 / targetFps;

    /*
      Ceiling on how much time one frame may advance the animation by.

      Animation frames stop being delivered whenever the page is backgrounded,
      occluded, or the machine sleeps, and the gap is not reported until the next
      frame arrives — as a single delta covering the whole stall. Replaying it is
      never right: that time was not seen, so it should be dropped rather than
      fast-forwarded through.

      Proportional to the frame budget rather than a fixed number, so it scales
      with targetFps and can never throttle the intended pace. 1.5x leaves room
      for ordinary jitter while cutting anything that is clearly a stall.
    */
    const maxFrameDeltaSeconds = minFrameSeconds * 1.5;

    const clock = new THREE.Clock();
    // Elapsed time banked since the last redraw. The uniform is advanced by this
    // whole amount rather than by one frame's worth, which is what keeps the
    // ribbons moving at the same speed regardless of how many frames were
    // skipped to hit targetFps.
    let banked = 0;

    let raf = requestAnimationFrame(function tick() {
      raf = requestAnimationFrame(tick);

      /*
        Clamped, and this is load-bearing.

        This used to be a bare getDelta() on the reasoning that a paused stretch
        would be discarded by the guard below — but that guard tests
        document.hidden, and a backgrounded tab does not reliably report itself as
        hidden. Measured: after five seconds in another tab, visibilityState stayed
        "visible" the whole time and no visibilitychange fired, yet frames stopped.
        So the full stall arrived as one delta, passed the guard, and was banked.

        The result was a step of 0.536 against a normal 0.0045 — 118x — draining at
        only one frame budget per redraw, so roughly 160 redraws of violent motion
        before it settled. Clamping here is what makes stalled time inert.
      */
      const delta = Math.min(clock.getDelta(), maxFrameDeltaSeconds);
      if (lost || !onScreen || document.hidden) return;

      banked += delta;
      if (banked + FRAME_BUDGET_SLACK_SECONDS < minFrameSeconds) return;

      /*
        Advance by exactly the time being consumed, and remove exactly that much.

        This previously advanced by the whole bank while subtracting only one frame
        budget, so the surplus above a budget was advanced again on the next redraw
        — and again after that. Measured, it ran the animation at 1.709x its
        intended rate: 0.171 of uniform time per wall second against the 0.1 the
        loop is written to produce.

        That subtraction was added to stop the redraw rate undershooting targetFps,
        but the real cause of the undershoot was an exact floating-point comparison,
        which FRAME_BUDGET_SLACK_SECONDS above already fixes. Consuming the whole
        bank costs nothing in cadence and makes the speed exact.

        The remainder is clamped as well, so even if a large delta ever reaches this
        point it cannot leave a residue that drips oversized steps into later
        frames.
      */
      const consumed = Math.min(banked, maxFrameDeltaSeconds);
      material.uniforms.time.value += 0.1 * consumed;
      banked = Math.min(banked - consumed, maxFrameDeltaSeconds);
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
      // Frees the GL context; without it a remount leaks one per cycle and
      // browsers cap how many a page may hold.
      renderer.dispose();
      canvas.remove();
    };
  }, [
    beamWidth,
    beamHeight,
    beamNumber,
    lightColor,
    beamColor,
    backgroundColor,
    speed,
    noiseIntensity,
    scale,
    rotation,
    lightMode,
    maxPixelRatio,
    targetFps,
    fov,
    lightIntensity,
    fillLightRatio,
    roughness,
  ]);

  return <div ref={host} aria-hidden className={className} />;
}

export default Beams;
