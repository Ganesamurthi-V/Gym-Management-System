import { useEffect, useRef } from 'react';

/**
 * A small band of drifting characters, the same dot-and-dash ramp as the hero's CharGrid.
 *
 * The hero draws its field in WebGL, which would pull three.js (about 120 KB gzipped) in for
 * a 40px strip. This is the same idea on a plain <pre>: a few sines for the flow, mapped to
 * the same ramp, redrawn about 12 times a second. It stops while the tab is hidden and
 * draws one still frame for visitors who ask for reduced motion.
 */
const RAMP = ' .,:;-~=+*';
const CELL_W = 6.2; // px per character at 10px monospace
const ROWS = 4;
const ROW_H = 10;

function frame(cols: number, t: number): string {
  let out = '';
  for (let y = 0; y < ROWS; y++) {
    for (let x = 0; x < cols; x++) {
      const v =
        Math.sin(x * 0.19 + t * 1.1 + Math.sin(y * 0.9 + t * 0.6)) +
        Math.sin(y * 0.8 - t * 0.7 + x * 0.05) +
        Math.sin((x + y * 2) * 0.11 + t * 0.4);
      // v is in [-3, 3]; sparse marks, like the hero: most cells stay blank.
      const g = Math.max(0, (v - 0.4) / 2.6);
      out += RAMP[Math.min(RAMP.length - 1, Math.floor(g * RAMP.length))];
    }
    out += '\n';
  }
  return out;
}

export function AsciiStrip() {
  const ref = useRef<HTMLPreElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const cols = Math.ceil(el.clientWidth / CELL_W) + 1;
    el.textContent = frame(cols, 2);
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const start = performance.now();
    const timer = window.setInterval(() => {
      if (document.hidden) return;
      el.textContent = frame(cols, 2 + (performance.now() - start) / 1000);
    }, 85);
    return () => window.clearInterval(timer);
  }, []);

  return (
    <pre
      ref={ref}
      aria-hidden
      className="pointer-events-none m-0 select-none overflow-hidden whitespace-pre font-mono text-muted-foreground opacity-60 [mask-image:linear-gradient(to_bottom,black_30%,transparent)]"
      style={{ fontSize: 10, lineHeight: `${ROW_H}px`, height: ROWS * ROW_H }}
    />
  );
}
