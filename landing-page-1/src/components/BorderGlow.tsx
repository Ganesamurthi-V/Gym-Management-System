import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   BORDER GLOW

   Adapted from React Bits (BorderGlow, MIT — github.com/DavidHDev/react-bits).
   A mesh-gradient border plus an outer halo that both track the pointer and
   only light up as it approaches an edge.

   Three deliberate changes from upstream:

   1. Theming is CSS-driven, not JS-driven. Upstream sniffs the surface colour
      with `isLightColor(backgroundColor)` and branches on it in JS to pick the
      border colour, drop shadow and blend modes. That cannot work here: the
      surface is a token (`var(--frame)`), which is not a hex, so the sniff
      would always fall through to its dark branch — and reading the theme from
      JS instead would go stale the moment ThemeToggle flips the `.dark` class,
      because that never re-renders this component. The four theme-dependent
      values are `--glow-*` custom properties in index.css instead, so the
      switch costs nothing and can never desync.

   2. `backgroundColor` / `borderRadius` accept CSS values, so the card inherits
      `--frame` and `--radius-card` rather than restating them.

   3. Pointer moves are coalesced into one rAF, and the intro sweep is
      cancellable and skipped under prefers-reduced-motion. Upstream's
      `animateValue` also double-counted `delay` (it offset `t0` by `delay` *and*
      deferred the first frame by `delay`), which fed a negative progress value
      into the easing on the opening frames; the timer here starts the clock
      when it actually fires.
═══════════════════════════════════════════════════════════════════════════ */

interface BorderGlowProps {
  children?: ReactNode;
  /** Element to render. Defaults to `div`; pass `article`/`li` to keep semantics. */
  as?: 'div' | 'article' | 'section' | 'li';
  className?: string;
  /** Classes for the inner content wrapper — put padding here, not on the host,
      so the mesh rim still reaches the card's true edge. */
  contentClassName?: string;
  /** How close to an edge the pointer must be before the glow appears (0–100). */
  edgeSensitivity?: number;
  /** Halo colour as space-separated HSL numbers — parsed in JS, so not a var(). */
  glowColor?: string;
  /** Any CSS colour value, including a custom property. */
  backgroundColor?: string;
  /** Number (px) or any CSS length. */
  borderRadius?: number | string;
  glowRadius?: number;
  glowIntensity?: number;
  coneSpread?: number;
  /** Play a one-off sweep on mount. Skipped under prefers-reduced-motion. */
  animated?: boolean;
  colors?: string[];
  fillOpacity?: number;
}

function parseHSL(hslStr: string): { h: number; s: number; l: number } {
  const match = hslStr.match(/([\d.]+)\s*([\d.]+)%?\s*([\d.]+)%?/);
  if (!match) return { h: 40, s: 80, l: 80 };
  return { h: parseFloat(match[1]), s: parseFloat(match[2]), l: parseFloat(match[3]) };
}

/** Stacked inset + outset shadows that read as a soft bloom rather than a ring. */
function buildBoxShadow(glowColor: string, intensity: number): string {
  const { h, s, l } = parseHSL(glowColor);
  const base = `${h}deg ${s}% ${l}%`;
  const layers: [number, number, number, number, number, boolean][] = [
    [0, 0, 0, 1, 100, true],
    [0, 0, 1, 0, 60, true],
    [0, 0, 3, 0, 50, true],
    [0, 0, 6, 0, 40, true],
    [0, 0, 15, 0, 30, true],
    [0, 0, 25, 2, 20, true],
    [0, 0, 50, 2, 10, true],
    [0, 0, 1, 0, 60, false],
    [0, 0, 3, 0, 50, false],
    [0, 0, 6, 0, 40, false],
    [0, 0, 15, 0, 30, false],
    [0, 0, 25, 2, 20, false],
    [0, 0, 50, 2, 10, false],
  ];
  return layers
    .map(([x, y, blur, spread, alpha, inset]) => {
      const a = Math.min(alpha * intensity, 100);
      return `${inset ? 'inset ' : ''}${x}px ${y}px ${blur}px ${spread}px hsl(${base} / ${a}%)`;
    })
    .join(', ');
}

const easeOutCubic = (x: number) => 1 - Math.pow(1 - x, 3);
const easeInCubic = (x: number) => x * x * x;

interface AnimateOpts {
  start?: number;
  end?: number;
  duration?: number;
  delay?: number;
  ease?: (t: number) => number;
  onUpdate: (v: number) => void;
  onEnd?: () => void;
}

/** Returns a cancel fn so an unmount mid-sweep cannot set state on a dead tree. */
function animateValue({
  start = 0,
  end = 100,
  duration = 1000,
  delay = 0,
  ease = easeOutCubic,
  onUpdate,
  onEnd,
}: AnimateOpts): () => void {
  let raf = 0;
  let cancelled = false;

  const timer = window.setTimeout(() => {
    const t0 = performance.now();
    const tick = () => {
      if (cancelled) return;
      const t = Math.min((performance.now() - t0) / duration, 1);
      onUpdate(start + (end - start) * ease(t));
      if (t < 1) raf = requestAnimationFrame(tick);
      else onEnd?.();
    };
    raf = requestAnimationFrame(tick);
  }, delay);

  return () => {
    cancelled = true;
    window.clearTimeout(timer);
    if (raf) cancelAnimationFrame(raf);
  };
}

/* Fixed blob positions — the mesh is meant to look hand-placed, not procedural. */
const GRADIENT_POSITIONS = [
  '80% 55%',
  '69% 34%',
  '8% 6%',
  '41% 38%',
  '86% 85%',
  '82% 18%',
  '51% 4%',
];
const COLOR_MAP = [0, 1, 2, 0, 1, 2, 1];

function buildMeshGradients(colors: string[]): string[] {
  const gradients = GRADIENT_POSITIONS.map((pos, i) => {
    const c = colors[Math.min(COLOR_MAP[i], colors.length - 1)];
    return `radial-gradient(at ${pos}, ${c} 0px, transparent 50%)`;
  });
  gradients.push(`linear-gradient(${colors[0]} 0 100%)`);
  return gradients;
}

export default function BorderGlow({
  children,
  as = 'div',
  className = '',
  contentClassName = '',
  edgeSensitivity = 30,
  // Brand blue (#2563eb) in HSL. Must stay numeric: parseHSL reads it in JS,
  // so a var() would silently fall back to the amber default.
  glowColor = '221 83 53',
  backgroundColor = 'var(--frame)',
  borderRadius = 'var(--radius-card)',
  glowRadius = 40,
  glowIntensity = 1,
  coneSpread = 25,
  animated = false,
  colors = ['var(--accent)', 'var(--accent-strong)', 'var(--accent)'],
  fillOpacity = 0.5,
}: BorderGlowProps) {
  const cardRef = useRef<HTMLDivElement>(null);
  const [isHovered, setIsHovered] = useState(false);
  const [cursorAngle, setCursorAngle] = useState(45);
  const [edgeProximity, setEdgeProximity] = useState(0);
  const [sweepActive, setSweepActive] = useState(false);

  /* ── Pointer tracking ─────────────────────────────────────────────────── */

  const frame = useRef<number | null>(null);
  const pending = useRef<{ x: number; y: number } | null>(null);

  const handlePointerMove = useCallback((e: React.PointerEvent<HTMLDivElement>) => {
    const card = cardRef.current;
    if (!card) return;

    const rect = card.getBoundingClientRect();
    pending.current = { x: e.clientX - rect.left, y: e.clientY - rect.top };

    // Coalesce: pointermove can fire many times per frame, and each update here
    // rewrites four gradient/mask strings.
    if (frame.current !== null) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = null;
      const el = cardRef.current;
      const p = pending.current;
      if (!el || !p) return;

      const { width, height } = el.getBoundingClientRect();
      const cx = width / 2;
      const cy = height / 2;
      const dx = p.x - cx;
      const dy = p.y - cy;

      // Proximity: 0 at dead centre, 1 at the nearest edge.
      const kx = dx === 0 ? Infinity : cx / Math.abs(dx);
      const ky = dy === 0 ? Infinity : cy / Math.abs(dy);
      setEdgeProximity(Math.min(Math.max(1 / Math.min(kx, ky), 0), 1));

      // Angle drives the conic mask, so the lit arc faces the pointer.
      if (dx !== 0 || dy !== 0) {
        let deg = Math.atan2(dy, dx) * (180 / Math.PI) + 90;
        if (deg < 0) deg += 360;
        setCursorAngle(deg);
      }
    });
  }, []);

  useEffect(
    () => () => {
      if (frame.current !== null) cancelAnimationFrame(frame.current);
    },
    [],
  );

  /* ── Intro sweep ──────────────────────────────────────────────────────── */

  useEffect(() => {
    if (!animated) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const angleStart = 110;
    const angleEnd = 465;
    const span = angleEnd - angleStart;

    // Deferred by a frame rather than set synchronously here: a synchronous
    // setState in an effect kicks off a second render pass before paint. The
    // tweens below are async anyway, so this changes nothing visually.
    const primer = requestAnimationFrame(() => {
      setSweepActive(true);
      setCursorAngle(angleStart);
    });

    const cancels = [
      animateValue({ duration: 500, onUpdate: v => setEdgeProximity(v / 100) }),
      animateValue({
        ease: easeInCubic,
        duration: 1500,
        end: 50,
        onUpdate: v => setCursorAngle(span * (v / 100) + angleStart),
      }),
      animateValue({
        ease: easeOutCubic,
        delay: 1500,
        duration: 2250,
        start: 50,
        end: 100,
        onUpdate: v => setCursorAngle(span * (v / 100) + angleStart),
      }),
      animateValue({
        ease: easeInCubic,
        delay: 2500,
        duration: 1500,
        start: 100,
        end: 0,
        onUpdate: v => setEdgeProximity(v / 100),
        onEnd: () => setSweepActive(false),
      }),
    ];

    return () => {
      cancelAnimationFrame(primer);
      cancels.forEach(cancel => cancel());
    };
  }, [animated]);

  /* ── Derived visuals ──────────────────────────────────────────────────── */

  // The border lights later than the halo, so the edge reads as a hard rim
  // sitting inside a softer bloom.
  const colorSensitivity = edgeSensitivity + 20;
  const isVisible = isHovered || sweepActive;
  const borderOpacity = isVisible
    ? Math.max(0, (edgeProximity * 100 - colorSensitivity) / (100 - colorSensitivity))
    : 0;
  const glowOpacity = isVisible
    ? Math.max(0, (edgeProximity * 100 - edgeSensitivity) / (100 - edgeSensitivity))
    : 0;

  const meshGradients = buildMeshGradients(colors);
  const angleDeg = `${cursorAngle.toFixed(3)}deg`;
  const radius = typeof borderRadius === 'number' ? `${borderRadius}px` : borderRadius;

  // Fading out runs slower than fading in: a slow decay reads as the light
  // trailing the pointer, a fast one reads as a flicker.
  const fade = isVisible ? 'opacity 0.25s ease-out' : 'opacity 0.75s ease-in-out';

  const coneMask = `conic-gradient(from ${angleDeg} at center, black ${coneSpread}%, transparent ${
    coneSpread + 15
  }%, transparent ${100 - coneSpread - 15}%, black ${100 - coneSpread}%)`;

  const fillMask = [
    'linear-gradient(to bottom, black, black)',
    'radial-gradient(ellipse at 50% 50%, black 40%, transparent 65%)',
    'radial-gradient(ellipse at 66% 66%, black 5%, transparent 40%)',
    'radial-gradient(ellipse at 33% 33%, black 5%, transparent 40%)',
    'radial-gradient(ellipse at 66% 33%, black 5%, transparent 40%)',
    'radial-gradient(ellipse at 33% 66%, black 5%, transparent 40%)',
    `conic-gradient(from ${angleDeg} at center, transparent 5%, black 15%, black 85%, transparent 95%)`,
  ].join(', ');

  const haloMask = `conic-gradient(from ${angleDeg} at center, black 2.5%, transparent 10%, transparent 90%, black 97.5%)`;

  // Rendering a union of tags breaks ref typing; the value is still the real tag
  // at runtime, only the type is narrowed so the HTMLDivElement ref checks out.
  const Tag = as as 'div';

  return (
    <Tag
      ref={cardRef}
      onPointerMove={handlePointerMove}
      onPointerEnter={() => setIsHovered(true)}
      onPointerLeave={() => setIsHovered(false)}
      className={`glow-card relative isolate grid border ${className}`}
      style={{
        background: backgroundColor,
        borderColor: 'var(--glow-border)',
        borderRadius: radius,
        boxShadow: 'var(--glow-shadow)',
      }}
    >
      {/* Mesh-gradient rim. Negative z-index inside an isolated stacking context
          paints above the host's own background but below its content. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-[1] rounded-[inherit]"
        style={{
          border: '1px solid transparent',
          background: [
            `linear-gradient(${backgroundColor} 0 100%) padding-box`,
            'linear-gradient(rgb(255 255 255 / 0%) 0% 100%) border-box',
            ...meshGradients.map(g => `${g} border-box`),
          ].join(', '),
          opacity: borderOpacity,
          maskImage: coneMask,
          WebkitMaskImage: coneMask,
          transition: fade,
        }}
      />

      {/* Mesh bleeding inward from the rim, punched out in the middle so the
          card's own surface stays readable behind the content. */}
      <div
        aria-hidden
        /* mask-composite and mix-blend-mode live in CSS: they are constant, and
           React's CSSProperties types both as closed unions that reject a
           multi-value list and a var() respectively. */
        className="glow-card-fill absolute inset-0 -z-[1] rounded-[inherit]"
        style={{
          border: '1px solid transparent',
          background: meshGradients.map(g => `${g} padding-box`).join(', '),
          maskImage: fillMask,
          WebkitMaskImage: fillMask,
          opacity: borderOpacity * fillOpacity,
          transition: fade,
        }}
      />

      {/* Outer halo. Inset by -glowRadius, so the section it lives in must not
          use `contain: paint` (see .contain-visible in index.css). */}
      <span
        aria-hidden
        className="glow-card-halo pointer-events-none absolute z-[1] rounded-[inherit]"
        style={{
          inset: `${-glowRadius}px`,
          maskImage: haloMask,
          WebkitMaskImage: haloMask,
          opacity: glowOpacity,
          transition: fade,
        }}
      >
        <span
          className="absolute rounded-[inherit]"
          style={{
            inset: `${glowRadius}px`,
            boxShadow: buildBoxShadow(glowColor, glowIntensity),
          }}
        />
      </span>

      {/* z-[1] keeps content above both mesh layers. flex-1 lets a child opt
          into filling the card when the grid row is taller than the content. */}
      <div
        className={`relative z-[1] flex flex-1 flex-col rounded-[inherit] ${contentClassName}`}
      >
        {children}
      </div>
    </Tag>
  );
}
