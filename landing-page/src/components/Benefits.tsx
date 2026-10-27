import { ArrowRight, ChartColumn, MessageCircle, Smartphone, Upload } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { ShinyText } from './ShinyText';

const APP_URL = 'https://app.gymflow.sbs';

/* What the owner gets, stated as what the product does. No time-saved or money-recovered figures:
   there is no customer data behind any. */
const ITEMS = [
  {
    icon: MessageCircle,
    title: 'Less chasing',
    desc: 'Reminders go out on WhatsApp by themselves, and they stop when you record the renewal or the payment.',
  },
  {
    icon: ChartColumn,
    title: 'Know where you stand each morning',
    desc: "The dashboard shows active members, today's collection, memberships expiring soon and total outstanding dues on one screen.",
  },
  {
    icon: Smartphone,
    title: 'Members get their own app',
    desc: 'A member app with a digital card, workout programs, attendance streaks and leaderboards.',
  },
  {
    icon: Upload,
    title: 'Nothing locked in',
    desc: 'Export members, payments and attendance to Excel any time. Plans are paid by hand and never renew on their own.',
  },
] as const;

export function Benefits() {
  const scope = useReveal<HTMLElement>({ perElement: true, y: 28, duration: 0.7, start: 'top 90%' });

  return (
    <section id="benefits" ref={scope} aria-labelledby="benefits-title" className="scroll-mt-24 px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto flex max-w-[760px] flex-col items-center text-center">
          <span className="reveal eyebrow">What you get</span>
          <h2 id="benefits-title" className="reveal display-2 mt-4 text-balance">
            {'How GymFlow helps you '}
            <em className="display-accent">
              <ShinyText text="run your gym" speed={2.8} spread={120} />
            </em>
          </h2>
          <p className="reveal lead mt-5 max-w-[560px]">
            The repeating work done for you, a clear view of your gym, and your records always yours.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2">
          {ITEMS.map(item => {
            const Icon = item.icon;
            return (
              <li key={item.title} className="reveal card flex gap-5 p-6">
                <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-subtle">
                  <Icon aria-hidden className="h-5 w-5 text-accent-text" />
                </span>
                <div>
                  <h3 className="text-[15.5px] font-medium tracking-tight text-foreground">{item.title}</h3>
                  <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{item.desc}</p>
                </div>
              </li>
            );
          })}
        </ul>

        <div className="reveal mt-10 flex flex-col items-center gap-4 text-center">
          <p className="max-w-[520px] text-[15px] text-muted-foreground">
            Try it with your own members: 14-day free trial, every feature, no credit card.
          </p>
          <div className="flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
            <a href={APP_URL} className="btn btn-accent btn-lg">
              Start free trial
              <ArrowRight className="h-4 w-4" />
            </a>
            <a href="/features" className="btn btn-outline btn-lg">
              See all features
            </a>
          </div>
        </div>
      </div>
    </section>
  );
}
