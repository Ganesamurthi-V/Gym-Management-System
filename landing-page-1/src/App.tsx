import { lazy, Suspense, useCallback, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';
import { CookieBanner } from './components/CookieBanner';
import { afterFirstPaint } from './lib/afterFirstPaint';

// Everything under the hero is a separate chunk, so the first download is only what the
// opening screen needs. See BelowFold.tsx.
const loadBelowFold = () => import('./BelowFold');
const BelowFoldSections = lazy(() => loadBelowFold().then(m => ({ default: m.BelowFoldSections })));
const BelowFoldFooter = lazy(() => loadBelowFold().then(m => ({ default: m.BelowFoldFooter })));

/**
 * True once the rest of the page should load. That is as soon as the browser is idle after
 * the hero has painted, or immediately on the first sign the visitor is going somewhere:
 * a scroll, a tap, a key press, or a link that already carries a #section.
 */
function useBelowFoldReady(): boolean {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (ready) return;
    const go = () => setReady(true);
    if (window.location.hash) {
      go();
      return;
    }
    const events = ['scroll', 'pointerdown', 'keydown', 'touchstart'] as const;
    events.forEach(e => window.addEventListener(e, go, { once: true, passive: true }));
    // Behind the first paint, not just idle: idle alone fires before it on a fast device, and the
    // chunk fetch plus the mount of every section then land in front of the hero.
    let handle: number | undefined;
    const useIdle = 'requestIdleCallback' in window;
    const cancelPaintWait = afterFirstPaint(() => {
      handle = useIdle ? window.requestIdleCallback(go, { timeout: 1500 }) : window.setTimeout(go, 600);
    });
    return () => {
      events.forEach(e => window.removeEventListener(e, go));
      cancelPaintWait();
      if (handle === undefined) return;
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [ready]);

  return ready;
}

function App() {
  const ready = useBelowFoldReady();
  // The footer waits for the sections above it, so that nothing is inserted above it later.
  const [sectionsDone, setSectionsDone] = useState(false);
  const onSectionsDone = useCallback(() => setSectionsDone(true), []);

  // A link such as /#pricing was resolved by the browser before this section existed, so it
  // had nowhere to land. Once ALL the sections are in, take the visitor there. A fixed 400 ms
  // after `ready` was not enough for sections near the bottom: arriving from a feature page,
  // /#faq measured 5862px below the viewport because the FAQ had not mounted when the timer
  // fired. Waiting for sectionsDone fixes that; the second jump corrects the small shifts that
  // fonts and lazy-mounted sections cause after the first one.
  useEffect(() => {
    if (!sectionsDone || !window.location.hash) return;
    const jump = () => document.querySelector(window.location.hash)?.scrollIntoView();
    const first = window.setTimeout(jump, 100);
    const second = window.setTimeout(jump, 800);
    return () => {
      window.clearTimeout(first);
      window.clearTimeout(second);
    };
  }, [sectionsDone]);

  return (
    <Layout>
      <Navbar />
      <main id="main-content">
        <Hero />
        {ready && (
          <Suspense fallback={null}>
            <BelowFoldSections onDone={onSectionsDone} />
          </Suspense>
        )}
      </main>
      {ready && sectionsDone && (
        <Suspense fallback={null}>
          <BelowFoldFooter />
        </Suspense>
      )}
      <CookieBanner />
    </Layout>
  );
}

export default App;
