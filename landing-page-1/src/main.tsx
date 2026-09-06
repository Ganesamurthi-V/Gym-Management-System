import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import './index.css';
import App from './App';
import Lenis from 'lenis';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

if (reducedMotion) {
  // Lenis hijacks the scroll thread by design, which is the opposite of what a
  // reduced-motion visitor asked for. Hand scrolling back to the browser and let
  // native anchor jumps (plus CSS scroll-padding) do the work.
  document.documentElement.style.scrollBehavior = 'auto';
} else {
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
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <App />
  </StrictMode>
);
