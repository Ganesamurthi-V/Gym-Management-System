import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

export function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

interface RevealOptions {
  /** Descendant selector to stagger in. Defaults to `.reveal`. */
  selector?: string;
  /** Vertical travel in px. */
  y?: number;
  stagger?: number;
  duration?: number;
  /** ScrollTrigger `start`, e.g. 'top 82%'. */
  start?: string;
}

/**
 * Staggered fade-up on scroll, scoped to the returned ref.
 *
 * Bails out entirely under prefers-reduced-motion rather than playing a
 * zero-duration tween: the elements have no opacity set in CSS, so skipping the
 * tween leaves them visible. Setting the `from` state and then instantly
 * clearing it would flash.
 */
export function useReveal<T extends HTMLElement = HTMLDivElement>(
  options: RevealOptions = {}
) {
  const {
    selector = '.reveal',
    y = 28,
    stagger = 0.08,
    duration = 0.65,
    start = 'top 82%',
  } = options;

  const scope = useRef<T>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>(selector);
      if (targets.length === 0) return;

      gsap.fromTo(
        targets,
        { y, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          duration,
          stagger,
          ease: 'power3.out',
          scrollTrigger: { trigger: scope.current, start },
        }
      );
    }, scope);

    return () => ctx.revert();
  }, [selector, y, stagger, duration, start]);

  return scope;
}
