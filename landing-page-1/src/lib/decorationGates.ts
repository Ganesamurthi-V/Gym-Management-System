import { useEffect, useState } from 'react';

/* ═══════════════════════════════════════════════════════════════════════════
   Shared gates for the decorative WebGL backdrops.

   Both hero backdrops answer the same two questions before mounting anything:
   is this a connection worth spending bytes on, and is the browser idle enough
   to compile a shader without competing with the hero's own paint. These lived
   in HeroBeams until a second backdrop needed them.
   ═════════════════════════════════════════════════════════════════════════ */

interface NetworkInformation {
  saveData?: boolean;
  effectiveType?: string;
}

/**
 * Whether the connection looks like one that should not be spent on decoration.
 *
 * Data Saver is an explicit request to stop sending optional bytes, and a WebGL
 * library for a background is exactly what it means. On 2g the same file is
 * seconds of waiting. This page's audience is largely on Indian mobile data, so
 * the check earns its keep rather than being theoretical.
 *
 * Read once at mount rather than subscribed: connection quality changes mid-visit
 * are not worth tearing a canvas down over, and Chromium is the only engine that
 * exposes any of this — elsewhere it returns true and the other gates decide.
 */
export function connectionAllowsDecoration(): boolean {
  const conn = (navigator as Navigator & { connection?: NetworkInformation }).connection;
  if (!conn) return true;
  if (conn.saveData) return false;
  return conn.effectiveType !== 'slow-2g' && conn.effectiveType !== '2g';
}

/**
 * Defers a flag until the browser is idle, so fetching and compiling a shader
 * cannot compete with the hero's own paint.
 *
 * requestIdleCallback where available, a timeout everywhere else — Safari only
 * shipped it recently. The timeout is a ceiling in both branches: on a busy page
 * idle may never arrive, and the effect should still appear.
 */
export function useDeferredUntilIdle(enabled: boolean, timeoutMs: number): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    // No reset when disabled: callers already require their own `wanted` flag, so
    // there is nothing to undo, and keeping this latched means toggling the theme
    // back brings the effect straight in instead of waiting on idle a second time.
    if (!enabled) return;

    const idle = window as Window & {
      requestIdleCallback?: (cb: () => void, opts?: { timeout: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (typeof idle.requestIdleCallback === 'function') {
      const handle = idle.requestIdleCallback(() => setReady(true), { timeout: timeoutMs });
      return () => idle.cancelIdleCallback?.(handle);
    }
    const t = window.setTimeout(() => setReady(true), Math.min(timeoutMs, 1200));
    return () => window.clearTimeout(t);
  }, [enabled, timeoutMs]);

  return ready;
}
