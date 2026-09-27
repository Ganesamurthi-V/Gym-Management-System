/*
  RubberSegment — vendored from React Bits (reactbits.dev/micro/rubber-segment,
  DavidHDev/react-bits, MIT). A draggable segmented control with spring/rubber-band
  physics on the thumb.

  Ported to TypeScript from the upstream .jsx: the animation logic is unchanged, and
  only type annotations (props interface, refs, `import type`) were added so it compiles
  under this project's strict tsconfig (verbatimModuleSyntax / noUnusedParameters).
*/
import type { CSSProperties, KeyboardEvent, PointerEvent, ReactNode } from 'react';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { animate, motion, useMotionTemplate, useMotionValue, useReducedMotion, useTransform } from 'motion/react';

import './RubberSegment.css';

const EASE_OUT = [0.23, 1, 0.32, 1] as const;
const SPRING_UI = { type: 'spring', duration: 0.3, bounce: 0 } as const;
const SPRING_MOMENTUM = { type: 'spring', duration: 0.4, bounce: 0.2 } as const;
const SPRING_RELAX = { type: 'spring', duration: 0.16, bounce: 0 } as const;
const DILATE = 0.19;
const HANDOFF = 0.15;
const FLICK = 110;
const MAX_VELOCITY = 2000;
const DEADZONE = 4;
const SLOP = 10;
const RUBBER = 0.55;
const SIZES = {
  sm: { height: 28, font: 12, pad: 10, min: 36 },
  md: { height: 36, font: 13, pad: 14, min: 44 },
  lg: { height: 44, font: 14, pad: 18, min: 48 }
} as const;

type SizeKey = keyof typeof SIZES;

export interface RubberSegmentItem {
  value: string;
  label?: ReactNode;
  icon?: ReactNode;
}

export interface RubberSegmentProps {
  items: Array<string | RubberSegmentItem>;
  value?: string;
  defaultValue?: string;
  onChange?: (value: string, index: number) => void;
  trackColor?: string;
  thumbColor?: string;
  textColor?: string;
  activeTextColor?: string;
  size?: SizeKey;
  radius?: number;
  inset?: number;
  equalSlots?: boolean;
  stretch?: number;
  squash?: number;
  speed?: number;
  glide?: number;
  draggable?: boolean;
  disabled?: boolean;
  className?: string;
  'aria-label'?: string;
}

type Slot = { l: number; r: number };
type MotionValueNumber = ReturnType<typeof useMotionValue<number>>;
type DragState = {
  id: number;
  x0: number;
  slot: number;
  onThumb: boolean;
  live: boolean;
  offset: number;
  w: number;
  hist: Array<[number, number]>;
};

const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value));
const rubber = (over: number, dim: number) => (over * dim * RUBBER) / (dim + RUBBER * Math.abs(over));
const project = (v: number, glide: number) => {
  const d = 1 - 0.1 * Math.pow(0.05, glide / 100);
  return ((v / 1000) * d) / (1 - d);
};
const velocityOf = (hist: Array<[number, number]>, now: number) => {
  const recent = hist.filter(([t]) => now - t <= 100);
  if (recent.length < 2) return 0;
  const [t0, x0] = recent[0];
  const [t1, x1] = recent[recent.length - 1];
  return t1 - t0 >= 8 ? ((x1 - x0) / (t1 - t0)) * 1000 : 0;
};
const nearestSlot = (slots: Slot[], x: number) => {
  let best = 0;
  for (let i = 1; i < slots.length; i++) {
    if (Math.abs((slots[i].l + slots[i].r) / 2 - x) < Math.abs((slots[best].l + slots[best].r) / 2 - x)) best = i;
  }
  return best;
};

export default function RubberSegment({
  items,
  value,
  defaultValue,
  onChange,
  trackColor = '#27272a',
  thumbColor = '#fafafa',
  textColor = '#fafafa',
  activeTextColor = '#18181b',
  size = 'md',
  radius = 10,
  inset = 3,
  equalSlots = true,
  stretch = 100,
  squash = 3,
  speed = 1,
  glide = 75,
  draggable = true,
  disabled = false,
  className = '',
  'aria-label': ariaLabel = 'Segmented control'
}: RubberSegmentProps) {
  const list = items.map(item => (typeof item === 'string' ? { value: item, label: item } : item));
  const [inner, setInner] = useState<string | undefined>(defaultValue ?? list[0]?.value);
  const current = value !== undefined ? value : inner;
  const index = Math.max(
    0,
    list.findIndex(item => item.value === current)
  );
  const reduce = useReducedMotion();

  const trackRef = useRef<HTMLDivElement>(null);
  const itemRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const slots = useRef<Slot[]>([]);
  const box = useRef<DOMRect | null>(null);
  const committed = useRef(index);
  const handoff = useRef<ReturnType<typeof setTimeout> | number>(0);
  const drag = useRef<DragState | null>(null);
  const gen = useRef(0);

  const edgeL = useMotionValue(0);
  const edgeR = useMotionValue(0);
  const innerW = useMotionValue(0);
  const thumbRadius = Math.max(0, radius - inset);
  /*
    Composed with useMotionTemplate over two single-value useTransform derivations,
    rather than the upstream's dependency-less `useTransform(() => ...)`.

    Under motion@13 that functional overload (and the array overload) only recomputed
    when an animate() drove the edges; values applied via set()/jump() — the initial
    position, keyboard selection, and the measure() re-layout — did not re-fire it, so
    the thumb stayed clipped to the full track until a pointer drag. useMotionTemplate
    subscribes to each interpolated motion value explicitly and re-renders the string
    whenever any of them changes, which is reactive for every code path.

    inset right = max(0, innerW - edgeR); inset left = max(0, edgeL).
  */
  const insetRight = useTransform([innerW, edgeR], ([w, r]: number[]) => Math.max(0, w - r));
  const insetLeft = useTransform(edgeL, (l: number) => Math.max(0, l));
  const clipPath = useMotionTemplate`inset(0 ${insetRight}px 0 ${insetLeft}px round ${thumbRadius}px)`;

  const t = (seconds: number) => seconds / speed;

  const jumpTo = (i: number) => {
    const s = slots.current[i];
    if (!s) return;
    clearTimeout(handoff.current);
    gen.current += 1;
    /*
      Routed through animate() with a 0s duration rather than the upstream's .jump()
      (or a plain .set()). Under motion@13 the motion.div only reflects a MotionValue
      change to the DOM when the value is driven through motion's animation loop; a
      silent jump()/set() updated the value but the composed clip-path binding did not
      repaint until the next animate() (i.e. the first drag). A zero-duration animate
      snaps instantly AND ticks the render loop, so the thumb lands on the right segment
      on mount, on keyboard select, and after a re-measure. Drag/land already use
      animate(), so they were always fine.
    */
    animate(edgeL, s.l, { duration: 0 });
    animate(edgeR, s.r, { duration: 0 });
  };

  const measure = () => {
    const track = trackRef.current;
    if (!track) return;
    const rect = track.getBoundingClientRect();
    box.current = rect;
    slots.current = list.map((_, i) => {
      const el = itemRefs.current[i];
      if (!el) return { l: 0, r: 0 };
      const r = el.getBoundingClientRect();
      return { l: r.left - rect.left - inset, r: r.right - rect.left - inset };
    });
    innerW.set(rect.width - inset * 2);
    jumpTo(committed.current);
  };

  const listKey = list.map(item => item.value).join('|');
  useLayoutEffect(() => {
    measure();
    const observer = new ResizeObserver(measure);
    if (trackRef.current) observer.observe(trackRef.current);
    if (typeof document !== 'undefined' && document.fonts) document.fonts.ready.then(measure);

    /*
      Everything below is added to the upstream to fix the thumb starting clipped to
      the FULL track (instead of the active segment) until the first interaction.

      Root cause: this control is often mounted inside a scroll-reveal wrapper that
      starts translated/faded and off-screen. The first measure() then reads the
      buttons before they have their final geometry, so jumpTo() sets the thumb edges
      to a zero-width slot. Once committed.current already equals the active index, the
      corrective effect below never re-jumps, so nothing fixes the edges until a
      resize or a pointer drag happens to call measure()/animate() again.

      The upstream's ResizeObserver does not fire for a visibility/scroll change, and a
      single rAF re-measure lands too early while the reveal transform is still
      running. So we (a) re-measure once the control actually intersects the viewport,
      deferred a frame, and (b) poll a few escalating delays after mount to cover the
      reveal-settle window. Each attempt stops as soon as the measured width is stable
      and non-zero, so this is a short-lived, self-terminating safety net, not an
      ongoing loop.
    */
    let visibility: IntersectionObserver | undefined;
    const timers: Array<ReturnType<typeof setTimeout>> = [];
    let raf = 0;

    const remeasure = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(measure);
    };

    if (trackRef.current && typeof IntersectionObserver !== 'undefined') {
      visibility = new IntersectionObserver(
        entries => {
          if (entries.some(entry => entry.isIntersecting)) remeasure();
        },
        { threshold: 0.1 }
      );
      visibility.observe(trackRef.current);
    }

    // Escalating catch-up measures for the reveal-settle window.
    for (const delay of [0, 60, 160, 360, 700]) timers.push(setTimeout(remeasure, delay));

    return () => {
      cancelAnimationFrame(raf);
      timers.forEach(clearTimeout);
      observer.disconnect();
      visibility?.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [listKey, size, inset, equalSlots]);

  useEffect(() => {
    if (!drag.current && committed.current !== index) {
      committed.current = index;
      jumpTo(index);
    }
  });

  useEffect(
    () => () => {
      clearTimeout(handoff.current);
      edgeL.stop();
      edgeR.stop();
    },
    [edgeL, edgeR]
  );

  const commit = (i: number) => {
    committed.current = i;
    if (i === index) return;
    if (value === undefined) setInner(list[i].value);
    onChange?.(list[i].value, i);
  };

  const land = (to: number, v: number | null, flick: boolean, withSquash: boolean) => {
    const b = slots.current[to];
    if (!b) return;
    const g = ++gen.current;
    const dir = Math.sign((b.l + b.r) / 2 - (edgeL.get() + edgeR.get()) / 2) || 1;
    const [lead, leadTo, trail, trailTo] = dir > 0 ? [edgeR, b.r, edgeL, b.l] : [edgeL, b.l, edgeR, b.r];
    const velocityFor = (mv: MotionValueNumber) => clamp(v === null ? mv.getVelocity() : v, -MAX_VELOCITY, MAX_VELOCITY);
    animate(lead as MotionValueNumber, leadTo as number, {
      ...(flick ? SPRING_MOMENTUM : SPRING_UI),
      duration: t(flick ? 0.4 : 0.3),
      velocity: velocityFor(lead as MotionValueNumber)
    });
    const trailVelocity = velocityFor(trail as MotionValueNumber);
    if (!withSquash || squash <= 0) {
      animate(trail as MotionValueNumber, trailTo as number, { ...SPRING_UI, duration: t(0.3), velocity: trailVelocity });
      return;
    }
    animate(trail as MotionValueNumber, (trailTo as number) + dir * squash, {
      ...SPRING_UI,
      duration: t(0.3),
      velocity: trailVelocity
    }).then(() => {
      if (gen.current === g) animate(trail as MotionValueNumber, trailTo as number, { ...SPRING_RELAX, duration: t(0.16) });
    });
  };

  const travel = (from: number, to: number) => {
    const a = slots.current[from];
    const b = slots.current[to];
    if (!a || !b) return;
    clearTimeout(handoff.current);
    gen.current += 1;
    if (reduce) {
      edgeL.jump(b.l);
      edgeR.jump(b.r);
      return;
    }
    const u = stretch / 100;
    const tween = { duration: t(DILATE), ease: EASE_OUT } as const;
    animate(edgeL, b.l + (Math.min(a.l, b.l) - b.l) * u, tween);
    animate(edgeR, b.r + (Math.max(a.r, b.r) - b.r) * u, tween);
    handoff.current = setTimeout(() => land(to, null, false, true), t(HANDOFF) * 1000);
  };

  const localX = (e: PointerEvent) => e.clientX - (box.current ? box.current.left : 0) - inset;

  const handlePointerDown = (e: PointerEvent<HTMLButtonElement>, i: number) => {
    if (disabled || drag.current || e.button !== 0) return;
    box.current = trackRef.current?.getBoundingClientRect() ?? null;
    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {
      /* pointer capture is best-effort */
    }
    const x = localX(e);
    const onThumb = draggable && x >= edgeL.get() && x <= edgeR.get();
    drag.current = { id: e.pointerId, x0: x, slot: i, onThumb, live: false, offset: 0, w: 0, hist: [[e.timeStamp, x]] };
    if (onThumb) {
      clearTimeout(handoff.current);
      gen.current += 1;
      edgeL.stop();
      edgeR.stop();
    } else if (!reduce) {
      e.currentTarget.dataset.pressed = '';
    }
  };

  const handlePointerMove = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id || !d.onThumb) return;
    const x = localX(e);
    d.hist.push([e.timeStamp, x]);
    if (d.hist.length > 8) d.hist.shift();
    if (!d.live) {
      if (Math.abs(x - d.x0) < DEADZONE) return;
      d.live = true;
      d.offset = x - edgeL.get();
      d.w = edgeR.get() - edgeL.get();
      if (trackRef.current) trackRef.current.dataset.held = '';
    }
    const width = innerW.get();
    const l = x - d.offset;
    const maxL = width - d.w;
    if (reduce) {
      const c = clamp(l, 0, maxL);
      edgeL.set(c);
      edgeR.set(c + d.w);
    } else if (l < 0) {
      edgeL.set(0);
      edgeR.set(d.w - rubber(-l, d.w));
    } else if (l > maxL) {
      edgeR.set(width);
      edgeL.set(maxL + rubber(l - maxL, d.w));
    } else {
      edgeL.set(l);
      edgeR.set(l + d.w);
    }
  };

  const release = () => {
    const d = drag.current;
    drag.current = null;
    if (trackRef.current) delete trackRef.current.dataset.held;
    if (d) {
      const el = itemRefs.current[d.slot];
      if (el) delete el.dataset.pressed;
    }
    return d;
  };

  const handlePointerUp = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    release();
    const x = localX(e);
    if (!d.live) {
      if (Math.abs(x - d.x0) <= SLOP && d.slot !== committed.current) {
        const from = committed.current;
        commit(d.slot);
        travel(from, d.slot);
      }
      return;
    }
    const v = velocityOf(d.hist, e.timeStamp);
    const flick = Math.abs(v) > FLICK;
    let to = nearestSlot(slots.current, (edgeL.get() + edgeR.get()) / 2 + project(v, glide));
    if (flick && to === committed.current) to = clamp(to + Math.sign(v), 0, list.length - 1);
    commit(to);
    if (reduce) jumpTo(to);
    else land(to, v, flick, flick);
  };

  const handlePointerCancel = (e: PointerEvent) => {
    const d = drag.current;
    if (!d || e.pointerId !== d.id) return;
    release();
    if (!d.live) return;
    if (reduce) jumpTo(committed.current);
    else land(committed.current, null, false, false);
  };

  const handleKeyDown = (e: KeyboardEvent) => {
    if (disabled) return;
    const last = list.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = Math.min(last, index + 1);
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = Math.max(0, index - 1);
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault();
    if (next === index) return;
    commit(next);
    jumpTo(next);
    itemRefs.current[next]?.focus();
  };

  const preset = SIZES[size] || SIZES.md;

  return (
    <div
      ref={trackRef}
      role="radiogroup"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-equal={equalSlots ? '' : undefined}
      data-draggable={draggable && !disabled ? '' : undefined}
      className={`rubber-segment${className ? ` ${className}` : ''}`}
      style={
        {
          '--rs-track': trackColor,
          '--rs-thumb': thumbColor,
          '--rs-ink': textColor,
          '--rs-ink-active': activeTextColor,
          '--rs-radius': `${radius}px`,
          '--rs-inset': `${inset}px`,
          '--rs-thumb-radius': `${thumbRadius}px`,
          '--rs-h': `${preset.height}px`,
          '--rs-font': `${preset.font}px`,
          '--rs-pad': `${preset.pad}px`,
          '--rs-min': `${preset.min}px`
        } as CSSProperties
      }
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onLostPointerCapture={handlePointerCancel}
    >
      {list.map((item, i) => (
        <button
          key={item.value}
          ref={el => {
            itemRefs.current[i] = el;
          }}
          type="button"
          role="radio"
          aria-checked={i === index}
          tabIndex={i === index ? 0 : -1}
          disabled={disabled}
          className="rubber-segment__item"
          onPointerDown={e => handlePointerDown(e, i)}
          onKeyDown={handleKeyDown}
        >
          {item.icon}
          {item.label}
        </button>
      ))}
      <motion.div className="rubber-segment__thumb" aria-hidden="true" style={{ clipPath }}>
        {list.map(item => (
          <span key={item.value} className="rubber-segment__item rubber-segment__copy">
            {item.icon}
            {item.label}
          </span>
        ))}
      </motion.div>
    </div>
  );
}
