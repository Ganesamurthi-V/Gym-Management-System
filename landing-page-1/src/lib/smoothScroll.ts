import { afterFirstPaint } from './afterFirstPaint';

/**
 * Lenis smooth scrolling, shared by the homepage (main.tsx) and the feature pages
 * (feature-main.tsx) so both scroll the same way.
 */
export function initSmoothScroll() {
  const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

  if (reducedMotion) {
    // Lenis hijacks the scroll thread by design, which is the opposite of what a
    // reduced-motion visitor asked for. Hand scrolling back to the browser and let
    // native anchor jumps (plus CSS scroll-padding) do the work.
    document.documentElement.style.scrollBehavior = 'auto';
  } else {
    // Lenis (and the gsap it shares a frame loop with) is not needed for the first paint, so it is
    // fetched and constructed once the hero has painted and the browser is idle. Created up front it put its constructor and a
    // ResizeObserver in front of the hero, took its own bytes out of the entry chunk, and it
    // re-measured the page every time a below-the-fold section mounted. Until it starts,
    // scrolling and anchor jumps are the browser's own, which is what a reduced-motion visitor
    // gets throughout.
    const startSmoothScroll = async () => {
      const [{ default: Lenis }, { gsap }, { ScrollTrigger }] = await Promise.all([
        import('lenis'),
        import('gsap'),
        import('gsap/ScrollTrigger'),
      ]);
      gsap.registerPlugin(ScrollTrigger);
      const lenis = new Lenis({
        duration: 1.2,
        easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
        smoothWheel: true,
        wheelMultiplier: 1.0,
        touchMultiplier: 1.5,
      });

      // Keep ScrollTrigger's cached positions honest — Lenis moves the page with a
      // transform, so without this every trigger fires at the wrong offset.
      lenis.on('scroll', ScrollTrigger.update);

      // One RAF loop for both libraries. Two independent loops would tear.
      gsap.ticker.add(time => lenis.raf(time * 1000));
      gsap.ticker.lagSmoothing(0);

      // In-page anchors: CSS scroll-behavior cannot drive a Lenis-controlled page,
      // so route every same-page hash link through Lenis instead. Delegated once on
      // the document, so links rendered later are covered without re-binding.
      document.addEventListener('click', event => {
        if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey) {
          return;
        }

        const anchor = (event.target as Element | null)?.closest?.('a[href^="#"]');
        if (!anchor) return;

        const hash = anchor.getAttribute('href');
        if (!hash || hash === '#') return;

        const destination = document.querySelector(hash);
        if (!destination) return;

        event.preventDefault();
        // No offset here on purpose: Lenis already honours scroll-padding-top, so
        // passing the header offset again lands the section twice as far down.
        lenis.scrollTo(destination as HTMLElement);
      });
    };

    afterFirstPaint(() => {
      const start = () => void startSmoothScroll();
      if (typeof window.requestIdleCallback === 'function') window.requestIdleCallback(start, { timeout: 2000 });
      else window.setTimeout(start, 1000);
    });
  }
}
