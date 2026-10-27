import { ArrowRight } from 'lucide-react';
import { RuledList, Section, SectionHead, Split } from './layout/Section';

const APP_URL = 'https://app.gymflow.sbs';

/* What the owner gets, stated as what the product does. No time-saved or money-recovered figures:
   there is no customer data behind any. */
const ITEMS = [
  {
    title: 'Less chasing',
    desc: 'Reminders go out on WhatsApp by themselves, and they stop when you record the renewal or the payment.',
  },
  {
    title: 'Know where you stand each morning',
    desc: "The dashboard shows active members, today's collection, memberships expiring soon and total outstanding dues on one screen.",
  },
  {
    title: 'Members get their own app',
    desc: 'A member app with a digital card, workout programs, attendance streaks and leaderboards.',
  },
  {
    title: 'Nothing locked in',
    desc: 'Export members, payments and attendance to Excel any time. Plans are paid by hand and never renew on their own.',
  },
] as const;

const FIGURES = [
  { label: 'Active members', value: '248' },
  { label: "Today's collection", value: '₹12,400' },
  { label: 'Expiring soon', value: '9' },
  { label: 'Outstanding dues', value: '₹18,600' },
] as const;

export function Benefits() {
  return (
    <Section id="benefits" labelledBy="benefits-title" tone="ink">
      <Split
        head={
          <SectionHead
            title={<h2 id="benefits-title" className="display-2 text-balance">{'How GymFlow helps you run your gym'}</h2>}
            lead="The repeating work done for you, a clear view of your gym, and your records always yours."
          >
            <p className="max-w-[520px] text-[15px] text-muted-foreground">
              Try it with your own members: 14-day free trial, every feature, no credit card.
            </p>
            <div className="mt-5 flex flex-col items-stretch gap-3 sm:flex-row sm:items-center">
              <a href={APP_URL} className="btn btn-accent btn-lg">
                Start free trial
                <ArrowRight aria-hidden className="h-4 w-4" />
              </a>
              <a
                href="/features"
                className="btn btn-lg border border-[var(--band-ink-line)] text-[var(--band-ink-fg)]"
              >
                See all features
              </a>
            </div>
          </SectionHead>
        }
      >
        <div
          role="img"
          aria-label="Sample data. The GymFlow dashboard showing active members, today's collection, memberships expiring soon and outstanding dues."
          className="overflow-hidden rounded-[16px] border border-dash-border bg-dash-surface"
        >
          <p className="border-b border-dash-line px-5 py-3 text-[15px] font-semibold text-dash-ink">Dashboard</p>
          <dl className="grid grid-cols-2">
            {FIGURES.map((f, i) => (
              <div
                key={f.label}
                className={`px-5 py-6 ${i % 2 === 0 ? 'border-r border-dash-line' : ''} ${i < 2 ? 'border-b border-dash-line' : ''}`}
              >
                <dt className="text-[13px] font-medium text-dash-ink-muted">{f.label}</dt>
                <dd className="mt-2 text-[32px] font-bold leading-none tabular-nums text-dash-ink">{f.value}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="mt-3 text-[12px] text-muted-foreground">Sample data</p>

        <div className="mt-10">
          <RuledList items={ITEMS.map(i => ({ title: i.title, text: i.desc }))} />
        </div>
      </Split>
    </Section>
  );
}
