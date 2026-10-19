import { Check, Minus } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { ShinyText } from './ShinyText';

/* Only the GymFlow column is a product fact (checked against the app). The "other
   platforms" column is a generic, hedged comparison: no competitor is named, and the
   footnote says features vary by product. */
const ROWS = [
  { feature: 'WhatsApp reminders built in', other: 'Often a paid add-on' },
  { feature: 'Fast on a phone over 4G', other: 'Often desktop first' },
  { feature: 'Member app with streaks and rewards', other: 'Often not included' },
  { feature: 'Workout programs for members', other: 'Often not included' },
  { feature: 'Inventory and stock tracking', other: 'Often a separate tool' },
  { feature: 'Dues and renewals tracked', other: 'Varies' },
  { feature: 'Import members from Excel or CSV', other: 'Varies' },
] as const;

export function WhyGymFlow() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });

  return (
    <section
      id="why"
      ref={scope}
      aria-labelledby="why-title"
      className="scroll-mt-24 px-5 py-20 md:px-8 md:py-24"
    >
      <div className="mx-auto max-w-[1200px]">
        <span className="reveal eyebrow">Why GymFlow</span>
        <h2 id="why-title" className="reveal display-2 mt-4 max-w-[900px] text-balance">
          Why{' '}
          <em className="display-accent">
            <ShinyText text="GymFlow" speed={2.8} spread={120} />
          </em>{' '}
          and not another platform?
        </h2>
        <p className="reveal lead mt-5 max-w-[560px]">
          Made for small gym owners here, so the things you do every day take fewer taps.
        </p>

        <div className="reveal card mt-10 overflow-hidden">
          <table className="w-full border-collapse text-left">
            <thead>
              <tr className="border-b border-border-subtle bg-subtle text-[12px] uppercase tracking-widest text-muted-foreground">
                <th scope="col" className="px-5 py-4 font-medium md:px-8">
                  What you get
                </th>
                <th scope="col" className="w-[28%] px-3 py-4 font-semibold text-accent-text md:px-6">
                  GymFlow
                </th>
                <th scope="col" className="w-[30%] px-3 py-4 font-medium md:px-6">
                  Other platforms
                </th>
              </tr>
            </thead>
            <tbody>
              {ROWS.map(({ feature, other }) => (
                <tr key={feature} className="border-b border-border-subtle last:border-b-0">
                  <th
                    scope="row"
                    className="px-5 py-5 text-[15px] font-medium text-foreground md:px-8 md:text-[16px]"
                  >
                    {feature}
                  </th>
                  <td className="px-3 py-5 md:px-6">
                    <span className="inline-flex items-center gap-2 text-[14px] font-medium text-foreground">
                      <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-accent">
                        <Check aria-hidden className="h-3.5 w-3.5 text-white" strokeWidth={3} />
                      </span>
                      <span className="hidden sm:inline">Included</span>
                      <span className="sr-only sm:hidden">Included</span>
                    </span>
                  </td>
                  <td className="px-3 py-5 text-[13px] text-muted-foreground md:px-6 md:text-[14px]">
                    <span className="inline-flex items-start gap-2">
                      <Minus aria-hidden className="mt-0.5 h-4 w-4 shrink-0" />
                      {other}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <p className="reveal mt-4 text-[13px] text-muted-foreground">
          &ldquo;Other platforms&rdquo; describes common gym software in general. Features vary by product.
        </p>
      </div>
    </section>
  );
}
