import { useEffect, useRef } from 'react';
import { afterFirstPaint } from './afterFirstPaint';
import { prefersReducedMotion } from './prefersReducedMotion';

// Lives in its own file so the hero can use it without pulling gsap into the entry chunk.
export { prefersReducedMotion };

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

    // gsap and ScrollTrigger (about 45 KB gzipped, a 300 ms-class long task on a throttled phone)
    // load after the first paint instead of ahead of it. The content is visible in the meantime
    // because nothing sets an opacity until the tween is created below.
    let cancelled = false;
    let ctx: { revert: () => void } | undefined;
    const cancelWait = afterFirstPaint(() => {
      void Promise.all([import('gsap'), import('gsap/ScrollTrigger')]).then(([{ gsap }, { ScrollTrigger }]) => {
        if (cancelled) return;
        gsap.registerPlugin(ScrollTrigger);

        // Anything already past its start line when the library arrives is on screen, so
        // animating it would blank visible content and fade it back in. It stays as it is.
        const startPct = Number(/(\d+)%/.exec(start)?.[1] ?? 80) / 100;
        const arrived = (el: Element | null) => !!el && el.getBoundingClientRect().top < window.innerHeight * startPct;

        ctx = gsap.context(() => {
          const targets = gsap.utils.toArray<HTMLElement>(selector).filter(el => perElement ? !arrived(el) : true);
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

          if (arrived(scope.current)) return;
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
      });
    });

    return () => {
      cancelled = true;
      cancelWait();
      ctx?.revert();
    };
  }, [selector, y, stagger, duration, start, perElement]);

  return scope;
}
