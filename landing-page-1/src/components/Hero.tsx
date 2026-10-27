import { HeroVideo } from './HeroVideo';
import { HeroDemo } from './HeroDemo';
import { FREE_MEMBER_LIMIT, PLANS, formatINR } from '../data/plans';

const APP_URL = 'https://app.gymflow.sbs';

/* Facts only, read from plans.ts so a price is never typed twice. */
const FACTS = [
  '14-day free trial, no credit card',
  `Free for up to ${FREE_MEMBER_LIMIT} members`,
  `${formatINR(PLANS[0].price)} a month after that, no GST added`,
] as const;

/**
 * Copy on the left, the product moment on the right (DESIGN.md). The copy does not animate: the
 * headline is the largest paint, and it should be there on the first frame. HeroDemo carries the
 * page's one piece of motion.
 */
export function Hero() {
  // aria-labelledby makes the section a named landmark.
  return (
    <section aria-labelledby="hero-title" className="hero-surface relative overflow-hidden px-5 pt-[116px] pb-16 md:px-8 md:pt-[136px]">
      <div className="mx-auto grid max-w-[1200px] items-center gap-14 lg:grid-cols-[1.05fr_0.95fr] lg:gap-16">
        <div>
          {/* The trailing spaces keep the words apart for text extractors, which join the block
              spans without one; at a line end the space collapses. */}
          <h1 id="hero-title" className="display-1 text-foreground">
            <span className="block">{'Gym management '}</span>
            <span className="block">{'that runs from '}</span>
            <span className="block">your phone.</span>
          </h1>

          <p className="hero-sub lead mt-7 max-w-[520px]">
            For independent gyms in India. Members, fees, attendance and WhatsApp reminders in one place,
            instead of a register book and your memory.
          </p>

          <div className="mt-8 flex flex-col gap-3 sm:flex-row">
            <a href={APP_URL} className="btn btn-accent btn-lg">
              Start free trial
            </a>
            <a href="/pricing" className="btn btn-outline btn-lg">
              See pricing
            </a>
          </div>

          <ul className="mt-8 grid gap-2 text-[14px] text-muted-foreground sm:max-w-[520px]">
            {FACTS.map(fact => (
              <li key={fact} className="flex items-baseline gap-2.5">
                <span aria-hidden className="h-[3px] w-3 shrink-0 translate-y-[-3px] rounded-full bg-accent" />
                {fact}
              </li>
            ))}
          </ul>
        </div>

        <HeroDemo />
      </div>

      {/* The one-minute product film, under the first screen. .hero-frame is the wrapper HeroVideo
          measures and pushes below the fold on wider screens. */}
      <div className="hero-frame mt-20 md:mt-24">
        <HeroVideo />
      </div>
    </section>
  );
}
