import { Check } from 'lucide-react';
import { SUPPORT_PROMISE } from '../data/support';
import { AsciiLogo } from './ascii';
import { Magnet, Rise } from './fx';
import '../styles/close.css';

const APP_URL = 'https://app.gymflow.sbs';

const TRUST_CHIPS = [
  '14-day free trial',
  'No credit card',
  'Cancel anytime',
] as const;

/**
 * Closing call to action: the one blue band on the page, white ink, centred. The primary key is white
 * with blue ink (the band-accent rules in index.css), magnetic toward a fine pointer. The ASCII logo
 * sits below the actions as a quiet texture (close.css turns the canvas white).
 */
export function CTA() {
  return (
    <section aria-labelledby="cta-title" className="band-accent close-cta relative overflow-clip px-5 md:px-8">
      <div className="mx-auto flex max-w-[1200px] flex-col items-center text-center">
        <Rise>
          <h2
            id="cta-title"
            className="display-1 mx-auto max-w-[16ch] min-w-0 text-balance text-foreground [overflow-wrap:break-word]"
          >
            Start your free trial today
          </h2>
        </Rise>

        <p className="lead mx-auto mt-6 max-w-[48ch]">{SUPPORT_PROMISE}</p>

        <div className="mt-10 flex flex-col items-stretch justify-center gap-4 sm:flex-row sm:items-center">
          <Magnet>
            <a href={APP_URL} className="btn btn-primary btn-lg w-full sm:w-auto">
              Start free trial
            </a>
          </Magnet>
          <a href="/pricing" className="btn btn-outline btn-lg">
            See pricing
          </a>
        </div>

        <ul className="mt-10 flex flex-wrap items-center justify-center gap-x-8 gap-y-2">
          {TRUST_CHIPS.map(chip => (
            <li key={chip} className="flex items-center gap-2 text-[16px] font-medium">
              <Check className="h-4 w-4 shrink-0" aria-hidden />
              {chip}
            </li>
          ))}
        </ul>

        <div className="close-ascii mt-20 w-full max-w-[960px]">
          <AsciiLogo cols={120} />
        </div>
      </div>
    </section>
  );
}
