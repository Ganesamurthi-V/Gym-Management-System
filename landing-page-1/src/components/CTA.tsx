import { ArrowRight } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

const APP_URL = 'https://app.gymflow.sbs';

const TRUST_CHIPS = [
  '500+ gyms',
  '14-day free trial',
  'No credit card',
  'Cancel anytime',
] as const;

export function CTA() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });

  return (
    <section ref={scope} className="px-5 pb-24 md:px-8 md:pb-28">
      <div className="relative mx-auto max-w-[1240px] overflow-hidden rounded-card-lg border border-border-subtle bg-foreground px-6 py-20 text-center md:px-16 md:py-24">
        {/* Lime wash from the bottom, so the block reads as the end of the page
            rather than another card. */}
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 bottom-0 h-[70%]"
          style={{
            background:
              'radial-gradient(ellipse at 50% 100%, color-mix(in srgb, var(--accent) 30%, transparent) 0%, transparent 70%)',
          }}
        />
        <div
          aria-hidden
          className="dot-grid pointer-events-none absolute inset-0 opacity-[0.06]"
        />

        <div className="relative">
          <h2
            className="reveal mx-auto max-w-[760px] text-balance font-medium leading-[1.08] tracking-[-0.03em] text-background"
            style={{ fontSize: 'clamp(32px, 5vw, 60px)' }}
          >
            Stop managing members. Start growing your gym.
          </h2>

          <p
            className="reveal mx-auto mt-6 max-w-[520px] text-[16px] leading-relaxed"
            style={{ color: 'color-mix(in srgb, var(--background) 70%, transparent)' }}
          >
            Join 500+ gym owners already using GymFlow across Tamil Nadu and Puducherry.
          </p>

          <div className="reveal mt-10 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center sm:justify-center">
            <a href={APP_URL} className="btn btn-accent btn-lg">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </a>
            <a
              href="#pricing"
              className="btn btn-lg border bg-transparent"
              style={{
                borderColor: 'color-mix(in srgb, var(--background) 28%, transparent)',
                color: 'var(--background)',
              }}
            >
              See pricing
            </a>
          </div>

          <ul className="reveal mt-10 flex flex-wrap items-center justify-center gap-x-6 gap-y-2.5">
            {TRUST_CHIPS.map(chip => (
              <li
                key={chip}
                className="flex items-center gap-2 text-[12.5px] font-medium"
                style={{ color: 'color-mix(in srgb, var(--background) 60%, transparent)' }}
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
