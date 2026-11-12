import { useEffect, useRef, type ReactNode } from 'react';
import { gsap } from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

/*
  The feature card's picture, animated the way the "How it works" cards on tasteskill.dev are (their GSAP timeline,
  reworked for our cards and our blue):
    1. A blue panel with drawn layers (a glow, two rings, hairlines along the edges, corner crosses) and a small
       product card floating on two faint sheets.
    2. When the panel scrolls to 85% of the viewport, once: the glow, rings, lines and crosses draw in, the card
       rises and fades in, then at 0.55 s the card's own story plays (rows drop in one after another, pills pop).
    3. While it is on screen the card drifts a few pixels against the scroll, and the panel itself grows with the
       scroll: it starts as a smaller inset window (clipped 14% / 16% in from each edge, with its background zoomed
       to 1.3) and opens to the full rounded panel as the card scrolls up to 52% of the viewport (scrubbed, so it
       follows the scrollbar both ways).
    4. With a mouse, entering the panel replays the story: the card's rows fade out, the story restarts, they fade in.
  Reduced motion gets none of it: the panel simply shows its final state.
*/

export type FeatureStory = 'members' | 'inventory' | 'app';

type Q = (selector: string) => Element[];

const STORIES: Record<FeatureStory, (q: Q) => gsap.core.Timeline> = {
  members: q =>
    gsap
      .timeline({ paused: true, defaults: { ease: 'expo.out' } })
      .fromTo(q('.mini__head > *'), { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.1 }, 0)
      .fromTo(q('.mini__stats > div'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.12 }, 0.15)
      .fromTo(q('.mini__rows li'), { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, stagger: 0.17 }, 0.6)
      .fromTo(q('.mini__avatar'), { scale: 0.4 }, { scale: 1, duration: 0.5, ease: 'back.out(2)', stagger: 0.17 }, 0.65)
      .fromTo(q('.mini__pill'), { scale: 1.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.42, ease: 'power4.out', stagger: 0.17 }, 1.05),
  inventory: q =>
    gsap
      .timeline({ paused: true, defaults: { ease: 'expo.out' } })
      .fromTo(q('.mini__head > *'), { y: -8, opacity: 0 }, { y: 0, opacity: 1, duration: 0.6, stagger: 0.1 }, 0)
      .fromTo(q('.mini__stats > div'), { y: 10, opacity: 0 }, { y: 0, opacity: 1, duration: 0.7, stagger: 0.12 }, 0.15)
      .fromTo(q('.mini__rows li'), { y: -16, opacity: 0 }, { y: 0, opacity: 1, duration: 0.75, stagger: 0.17 }, 0.6)
      .fromTo(q('.mini__pill'), { scale: 1.9, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.42, ease: 'power4.out', stagger: 0.17 }, 1.05),
  app: q =>
    gsap
      .timeline({ paused: true, defaults: { ease: 'expo.out' } })
      .fromTo(q('.ma-phone'), { y: 28, opacity: 0.2 }, { y: 0, opacity: 1, duration: 1.2 }, 0),
};

export function FeatureArt({ story, children }: { story: FeatureStory; children: ReactNode }) {
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = root.current;
    if (!el || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;

    const q = gsap.utils.selector(el) as Q;
    const finePointer = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
    const narrow = window.matchMedia('(max-width: 820px)').matches;

    const ctx = gsap.context(() => {
      // Parallax: the card and the rings drift against the scroll while the panel is on screen.
      const drift = narrow ? 8 : 20;
      const scrub = { trigger: el, start: 'top bottom', end: 'bottom top', scrub: true };

      // The panel grows with the scroll: a scrubbed clip-path from a small inset window to the full panel.
      gsap
        .timeline({
          defaults: { ease: 'none' },
          scrollTrigger: { trigger: el.closest('.feature') ?? el, start: 'top bottom', end: narrow ? 'top 62%' : 'top 52%', scrub: true },
        })
        .fromTo(
          el,
          { clipPath: narrow ? 'inset(4% 6% 4% 6% round 16px)' : 'inset(14% 16% 14% 16% round 16px)' },
          { clipPath: 'inset(0% 0% 0% 0% round 22px)' },
          0,
        )
        .fromTo(q('.fx-bg'), { scale: 1.3 }, { scale: 1 }, 0);
      // The phone card stays put: only the flat product cards drift and rise with the scroll.
      if (el.dataset.story !== 'app') gsap.fromTo(q('.feat-float'), { y: drift }, { y: -drift, ease: 'none', force3D: false, snap: { y: 1 }, scrollTrigger: scrub });
      gsap.fromTo(q('.fx-rings'), { y: -0.6 * drift }, { y: 0.6 * drift, ease: 'none', scrollTrigger: scrub });

      const entry = gsap
        .timeline({ paused: true, defaults: { ease: 'expo.out' } })
        .fromTo(q('.fx-glow'), { opacity: 0, scale: 0.55 }, { opacity: 1, scale: 1, duration: 1.8 }, 0)
        .fromTo(q('.fx-t, .fx-b'), { scaleX: 0 }, { scaleX: 1, duration: 1.3, stagger: 0.1 }, 0)
        .fromTo(q('.fx-l, .fx-r'), { scaleY: 0 }, { scaleY: 1, duration: 1.3, stagger: 0.1 }, 0.1)
        .fromTo(q('.fx-ring'), { opacity: 0, scale: 0.7 }, { opacity: 1, scale: 1, duration: 1.5, stagger: 0.14 }, 0.06)
        .fromTo(q('.fx-mark'), { opacity: 0, scale: 0.2 }, { opacity: 1, scale: 1, duration: 0.6, stagger: 0.06 }, 0.6)
        ;
      if (el.dataset.story !== 'app') entry.fromTo(q('.feat-frag'), { y: 56, opacity: 0 }, { y: 0, opacity: 1, duration: 1.2 }, 0.08);
      const sheets = q('.fx-sheet');
      if (sheets.length) entry.from(sheets, { y: 0, scale: 1, opacity: 0, duration: 1.3, stagger: 0.08 }, 0.4);

      const story = el.dataset.story === 'app' ? undefined : STORIES[el.dataset.story as FeatureStory]?.(q);
      let played = false;
      if (story) {
        entry.add(() => {
          story.play();
        }, 0.55);
        story.eventCallback('onComplete', () => {
          played = true;
        });
      }

      ScrollTrigger.create({ trigger: el, start: narrow ? 'top 90%' : 'top 85%', once: true, onEnter: () => entry.play() });

      if (story && finePointer) {
        const replay = q('[data-replay]');
        let busy = false;
        const onEnter = (e: PointerEvent) => {
          if (e.pointerType !== 'mouse' || !played || busy || story.isActive()) return;
          busy = true;
          gsap.to(replay, {
            opacity: 0,
            duration: 0.18,
            ease: 'power1.in',
            onComplete: () => {
              story.restart();
              gsap.to(replay, { opacity: 1, duration: 0.26, ease: 'power1.out' });
              busy = false;
            },
          });
        };
        el.addEventListener('pointerenter', onEnter);
        return () => el.removeEventListener('pointerenter', onEnter);
      }
    }, el);

    return () => ctx.revert();
  }, []);

  return (
    <div ref={root} data-story={story} className="feat-art" aria-hidden>
      <div className="fx" aria-hidden>
        <div className="fx-bg" />
        <div className="fx-glow" />
        <div className="fx-rings">
          <i className="fx-ring" />
          <i className="fx-ring fx-ring-2" />
        </div>
        <i className="fx-line fx-t" />
        <i className="fx-line fx-b" />
        <i className="fx-line fx-l" />
        <i className="fx-line fx-r" />
        <i className="fx-mark fx-m1" />
        <i className="fx-mark fx-m2" />
        <i className="fx-mark fx-m3" />
        <i className="fx-mark fx-m4" />
      </div>
      <div className="feat-float">
        {/* The two faint sheets sit behind a flat card; a phone has its own outline, so it gets none. */}
        {story !== 'app' && (
          <>
            <i className="fx-sheet fx-s2" aria-hidden />
            <i className="fx-sheet fx-s1" aria-hidden />
          </>
        )}
        <div className="feat-frag">{children}</div>
      </div>
    </div>
  );
}
