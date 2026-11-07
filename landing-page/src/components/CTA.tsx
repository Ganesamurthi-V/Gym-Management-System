import { Check } from 'lucide-react';
import { SUPPORT_PROMISE } from '../data/support';
import '../styles/close.css';

const APP_URL = 'https://app.gymflow.sbs';

const TRUST_CHIPS = ['14-day free trial', 'No credit card', 'Cancel anytime'] as const;

/**
 * Closing call to action: the one Royal Blue band, left aligned on the page's wrap, the main action in the
 * same wording as the nav and the hero. The band keeps the white button the .band-accent rules give it.
 */
export function CTA() {
  return (
    <section aria-labelledby="cta-title" className="band-accent close-cta">
      <div className="wrap text-center">
        <h2 id="cta-title" className="h2 mx-auto" style={{ fontSize: 'clamp(2.5rem, 6vw, 5rem)', maxWidth: '16ch' }}>
          Start your free trial today
        </h2>
        <p className="lead mx-auto mt-6 max-w-[48ch]">{SUPPORT_PROMISE}</p>
        <div className="mt-10 flex flex-col justify-center gap-3 sm:flex-row">
          <a href={APP_URL} className="btn btn-primary">
            Start free trial
          </a>
          <a href="/pricing" className="btn btn-outline">
            See pricing
          </a>
        </div>
        <ul className="mt-10 flex flex-wrap justify-center gap-x-8 gap-y-2">
          {TRUST_CHIPS.map(chip => (
            <li key={chip} className="flex items-center gap-2 text-[16px] font-medium">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              {chip}
            </li>
          ))}
        </ul>
      </div>
    </section>
  );
}
