import { ArrowRight } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

const APP_URL = 'https://app.gymflow.sbs';

const TRUST_CHIPS = [
  '500+ gyms',
  '14-day free trial',
  'No credit card',
  'Cancel anytime',
] as const;

/**
 * Closing call to action, sized and stacked to straddle the footer panel.
 *
 * The section carries no bottom padding: the card's lower edge is the section's
 * lower edge, and the footer is pulled up over it with a negative margin. z-10
 * keeps the card above the panel, since the footer comes later in the document
 * and would otherwise paint on top.
 */
export function CTA() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });

  return (
    <section ref={scope} className="relative z-10 px-5 md:px-8">
      {/* Narrower than the footer panel below it, so the accent shows on both
          sides of the overlap rather than the card covering the panel's full
          width. */}
      <div className="relative mx-auto max-w-[920px] overflow-hidden rounded-card-lg border border-border-subtle bg-frame px-6 py-16 text-center shadow-[0_28px_70px_-32px_color-mix(in_srgb,var(--foreground)_28%,transparent)] md:px-14 md:py-20">
        {/* Accent wash rising from the bottom edge, which is the edge that sits
            on the footer panel — it ties the two together instead of the card
            reading as a separate slab. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-0 opacity-[0.05]"
        />

        <div className="relative">
          <h2
            className="reveal mx-auto max-w-[680px] text-balance font-medium leading-[1.08] tracking-[-0.03em] text-foreground"
            style={{ fontSize: 'clamp(30px, 4.2vw, 52px)' }}
          >
            Stop managing members. Start growing your gym.
          </h2>

          <p className="reveal mx-auto mt-5 max-w-[500px] text-[15.5px] leading-relaxed text-muted-foreground">
            Join 500+ gym owners already using GymFlow across India.
          </p>

          <div className="reveal mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <a href={APP_URL} className="btn btn-accent btn-lg">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="#pricing" className="btn btn-outline btn-lg">
              See pricing
            </a>
          </div>

          <ul className="reveal mt-9 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
            {TRUST_CHIPS.map(chip => (
              <li
                key={chip}
                className="flex items-center gap-2 text-[12.5px] font-medium text-muted-foreground"
              >
                <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                {chip}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
}
