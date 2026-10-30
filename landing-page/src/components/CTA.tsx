import { ArrowRight } from 'lucide-react';
import { SUPPORT_PROMISE } from '../data/support';

const APP_URL = 'https://app.gymflow.sbs';

const TRUST_CHIPS = [
  '14-day free trial',
  'No credit card',
  'Cancel anytime',
] as const;

/**
 * Closing call to action, sized and stacked to straddle the footer panel.
 *
 * The section carries no bottom padding: the panel's lower edge is the section's
 * lower edge, and the footer is pulled up over it with a negative margin. z-10
 * keeps the panel above the footer, which comes later in the document.
 */
export function CTA() {
  return (
    <section aria-labelledby="cta-title" className="relative z-10 px-5 md:px-8">
      <div className="mx-auto max-w-[1200px] rounded-card-lg bg-accent px-6 py-14 text-accent-ink md:px-12 md:py-16">
        <h2
          id="cta-title"
          className="max-w-[680px] text-balance font-medium leading-[1.08] tracking-[-0.03em]"
          style={{ fontSize: 'clamp(30px, 4.2vw, 52px)' }}
        >
          Stop managing members. Start growing your gym.
        </h2>

        <p className="mt-5 max-w-[500px] text-[15.5px] leading-relaxed opacity-90">
          {SUPPORT_PROMISE}
        </p>

        <div className="mt-9 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <a href={APP_URL} className="btn btn-lg bg-white text-[#14213d]">
            Start free trial
            <ArrowRight className="h-4 w-4" />
          </a>
          <a href="/pricing" className="btn btn-lg border border-white/40 text-white">
            See pricing
          </a>
        </div>

        <ul className="mt-9 flex flex-wrap items-center gap-x-6 gap-y-2.5">
          {TRUST_CHIPS.map(chip => (
            <li key={chip} className="flex items-center gap-2 text-[12.5px] font-medium opacity-90">
              <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-white" />
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
