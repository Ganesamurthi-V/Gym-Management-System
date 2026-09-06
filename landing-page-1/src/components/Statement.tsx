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
      // Opacity rather than colour: it composites on the GPU and, unlike a
      // colour tween, it does not cache a resolved theme value that would go
      // stale the moment someone flips the theme mid-scroll.
      gsap.fromTo(
        '.statement-word',
        { opacity: 0.2 },
        {
          opacity: 1,
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

  return (
    <section ref={scope} className="px-5 py-24 md:px-8 md:py-32">
      <p className="mx-auto max-w-[960px] text-center text-[clamp(22px,3.2vw,40px)] font-medium leading-[1.35] tracking-[-0.02em] text-foreground">
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
    </section>
  );
}
