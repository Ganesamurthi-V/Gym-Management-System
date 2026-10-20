/**
 * Calls `run` once the page has painted for the first time, or after `ceilingMs` if no paint is
 * ever reported (a tab opened in the background does not paint until it is shown). Returns a
 * cancel function.
 *
 * Idle callbacks alone are the wrong gate for deferred work. They fire as soon as the main thread
 * is quiet, and on a fast machine that is before the first paint, so the chunk fetches and the
 * script evaluation they start landed in front of it: with Lenis, the below-the-fold chunk and
 * the WebGL chunk all gated on idle alone, Lighthouse counted their bytes against FCP and LCP.
 * Waiting for the paint entry first puts all of it behind the hero.
 */
export function afterFirstPaint(run: () => void, ceilingMs = 3000): () => void {
  let done = false;
  let observer: PerformanceObserver | undefined;
  const fire = () => {
    if (done) return;
    done = true;
    observer?.disconnect();
    window.clearTimeout(ceiling);
    run();
  };
  const ceiling = window.setTimeout(fire, ceilingMs);

  try {
    observer = new PerformanceObserver(list => {
      if (list.getEntriesByName('first-contentful-paint').length) fire();
    });
    observer.observe({ type: 'paint', buffered: true });
  } catch {
    // No paint timing (older Safari): the ceiling timer alone decides, so run on a short delay.
    window.clearTimeout(ceiling);
    window.setTimeout(fire, 300);
  }

  return () => {
    done = true;
    observer?.disconnect();
    window.clearTimeout(ceiling);
  };
}
