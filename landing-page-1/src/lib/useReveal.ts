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
  /**
   * Give each target its own ScrollTrigger instead of one for the whole scope.
   *
   * The default fires every target together, staggered, when the scope's top
   * reaches `start`. That is right for a group that arrives on screen at once: a
   * heading with its subtitle and buttons.
   *
   * It is wrong for a long list. A tall scope crosses `start` while most of its
   * children are still far below the fold, so those animate unseen and are already
   * at rest by the time they are scrolled to. Per-element triggers make each row
   * animate as it arrives, which is the only version a visitor actually sees.
   *
   * `stagger` is ignored here: the targets no longer share a timeline, and their
   * spacing on screen already supplies the offset.
   */
  perElement?: boolean;
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
    perElement = false,
  } = options;

  const scope = useRef<T>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      const targets = gsap.utils.toArray<HTMLElement>(selector);
      if (targets.length === 0) return;

      if (perElement) {
        // One tween per target, each triggered by itself. Deliberately not a single
        // tween with a stagger: that would share one ScrollTrigger, which is the
        // behaviour this option exists to avoid.
        for (const el of targets) {
          gsap.fromTo(
            el,
            { y, opacity: 0 },
            {
              y: 0,
              opacity: 1,
              duration,
              ease: 'power3.out',
              scrollTrigger: { trigger: el, start },
            }
          );
        }
        return;
      }

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
  }, [selector, y, stagger, duration, start, perElement]);

  return scope;
}
