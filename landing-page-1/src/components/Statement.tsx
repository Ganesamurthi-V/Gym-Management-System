import { useEffect, useRef } from 'react';
import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { prefersReducedMotion } from '../lib/useReveal';

gsap.registerPlugin(ScrollTrigger);

const STATEMENT =
  'Independent gyms still run on notebooks, WhatsApp groups and memory. ' +
  'GymFlow replaces all of it with one place to track members, collect payments, ' +
  'mark attendance and chase dues — so nothing slips through.';

const WORDS = STATEMENT.split(' ');

export function Statement() {
  const scope = useRef<HTMLElement>(null);

  useEffect(() => {
    if (prefersReducedMotion()) return;

    const ctx = gsap.context(() => {
      // Opacity and blur rather than colour: both composite on the GPU and,
      // unlike a colour tween, neither caches a resolved theme value that would
      // go stale the moment someone flips the theme mid-scroll.
      //
      // The blur is set here rather than in the markup on purpose. If it were a
      // class, the words would render blurred for anyone with reduced motion or
      // with JS still parsing, and the paragraph would be unreadable. Applying
      // it from the tween means the un-animated state is plain sharp text.
      gsap.fromTo(
        '.statement-word',
        { opacity: 0.2, filter: 'blur(8px)' },
        {
          opacity: 1,
          filter: 'blur(0px)',
          ease: 'none',
          stagger: 0.4,
          scrollTrigger: {
            trigger: scope.current,
            start: 'top 78%',
            end: 'bottom 65%',
            scrub: true,
          },
        }
      );
    }, scope);

    return () => ctx.revert();
  }, []);

  // aria-label rather than aria-labelledby: this section is a single statement
  // with no heading of its own, and inventing a visually-hidden heading to point
  // at would add a phantom entry to the document outline.
  return (
    <section
      ref={scope}
      aria-label="What GymFlow replaces"
      className="px-5 py-6 md:px-8 md:py-8"
    >
      {/* The 1240px wrapper is what puts the paragraph's left edge on the same
          line as every other section's content. Left-aligning inside the old
          centred 960px box would have inset it by 140px and aligned with
          nothing. */}
      <div className="mx-auto max-w-[1240px]">
        <p className="max-w-[960px] text-left text-[clamp(22px,3.2vw,40px)] font-medium leading-[1.35] tracking-[-0.02em] text-foreground">
          {WORDS.map((word, index) => (
            <span
              // Words repeat ("and", "to"), so the index has to be part of the key.
              key={`${word}-${index}`}
              className="statement-word inline-block"
            >
              {word}
              {/* A plain trailing space would collapse between inline-blocks. */}
              {index < WORDS.length - 1 && <span>&nbsp;</span>}
            </span>
          ))}
        </p>
      </div>
    </section>
  );
}
