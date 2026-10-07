import { lazy, Suspense, useEffect, useState } from 'react';
import { Layout } from './components/Layout';
import { Navbar } from './components/Navbar';
import { Hero } from './components/Hero';

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
    const useIdle = 'requestIdleCallback' in window;
    const handle: number = useIdle
      ? window.requestIdleCallback(go, { timeout: 1500 })
      : window.setTimeout(go, 600);
    return () => {
      events.forEach(e => window.removeEventListener(e, go));
      if (useIdle) window.cancelIdleCallback(handle);
      else window.clearTimeout(handle);
    };
  }, [ready]);

  return ready;
}

function App() {
  const ready = useBelowFoldReady();

  // A link such as /#pricing was resolved by the browser before this section existed, so it
  // had nowhere to land. Once the sections are in, take the visitor there.
  useEffect(() => {
    if (!ready || !window.location.hash) return;
    const timer = window.setTimeout(() => {
      document.querySelector(window.location.hash)?.scrollIntoView();
    }, 400);
    return () => window.clearTimeout(timer);
  }, [ready]);

  return (
    <Layout>
      <Navbar />
      <main id="main-content">
        <Hero />
        {ready && (
          <Suspense fallback={null}>
            <BelowFoldSections />
          </Suspense>
        )}
      </main>
      {ready && (
        <Suspense fallback={null}>
          <BelowFoldFooter />
        </Suspense>
      )}
    </Layout>
  );
}

export default App;
