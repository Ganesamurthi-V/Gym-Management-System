import { CalendarCheck, ChartColumn, IndianRupee, MessageCircle, Upload, Users } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { ShinyText } from './ShinyText';

/* Each row is a problem an owner has today and what GymFlow does about it. The "does" side is
   limited to behaviour already stated on the feature pages: the 18-day reminder start, the 7-day
   absence list, the 10-digit number tidy-up on import. No outcome figures. */
const ROWS = [
  {
    icon: CalendarCheck,
    problem: 'Nobody noticed the plan had ended',
    fix: 'Every member shows as Active, Expiring or Expired, and expiry reminders start 18 days before the end date.',
  },
  {
    icon: IndianRupee,
    problem: 'Who owes how much?',
    fix: 'Part payments stay on the member as a pending due, with a list of who owes what.',
  },
  {
    icon: MessageCircle,
    problem: 'Typing the same reminder again and again',
    fix: 'Welcome, renewal, expiry, payment due and birthday messages go out on WhatsApp by themselves.',
  },
  {
    icon: Users,
    problem: 'The register shows who came, not who stopped',
    fix: 'A report lists members with a current plan who have not checked in for 7 days or more.',
  },
  {
    icon: Upload,
    problem: 'Messy lists and phone numbers',
    fix: 'Import an Excel or CSV file, see a preview before anything is saved, and numbers are tidied to 10 digits.',
  },
  {
    icon: ChartColumn,
    problem: 'No clear picture of the month',
    fix: 'Five plain-English reports on members, money, dues, expiries and attendance, with a PDF to download.',
  },
] as const;

export function Problems() {
  const scope = useReveal<HTMLElement>({ perElement: true, y: 28, duration: 0.7, start: 'top 90%' });

  return (
    <section id="problems" ref={scope} aria-labelledby="problems-title" className="scroll-mt-24 px-5 py-20 md:px-8 md:py-24">
      <div className="mx-auto max-w-[1200px]">
        <div className="mx-auto flex max-w-[760px] flex-col items-center text-center">
          <span className="reveal eyebrow">What goes wrong without it</span>
          <h2 id="problems-title" className="reveal display-2 mt-4 text-balance">
            {'The problems GymFlow '}
            <em className="display-accent">
              <ShinyText text="solves" speed={2.8} spread={120} />
            </em>
          </h2>
          <p className="reveal lead mt-5 max-w-[560px]">
            The everyday jobs that eat an owner&rsquo;s week, and what GymFlow does about each one.
          </p>
        </div>

        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {ROWS.map(row => {
            const Icon = row.icon;
            return (
              <li key={row.problem} className="reveal card flex flex-col p-6">
                <span className="grid h-11 w-11 place-items-center rounded-2xl border border-border-subtle bg-subtle">
                  <Icon aria-hidden className="h-5 w-5 text-accent-text" />
                </span>
                <h3 className="mt-5 text-[15.5px] font-medium tracking-tight text-foreground">{row.problem}</h3>
                <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{row.fix}</p>
              </li>
            );
          })}
        </ul>

        {/* An illustration, not a customer story: labelled as such so nobody reads it as one. */}
        <div className="reveal card mx-auto mt-10 max-w-[760px] p-6 md:p-8">
          <p className="eyebrow text-accent-text">Example, not a customer</p>
          <h3 className="mt-3 text-[17px] font-medium tracking-tight text-foreground">
            A member whose plan ends on the 30th
          </h3>
          <ol className="mt-4 flex flex-col gap-3 text-[14px] leading-relaxed text-muted-foreground">
            <li>
              <strong className="font-medium text-foreground">The 12th:</strong> the first expiry reminder goes out on
              WhatsApp, saying how many days are left.
            </li>
            <li>
              <strong className="font-medium text-foreground">The 20th:</strong> you record the renewal. A renewal
              confirmation goes out and the remaining reminders stop.
            </li>
            <li>
              <strong className="font-medium text-foreground">If they do not renew:</strong> after the 30th, messages
              asking them to come back continue for up to 18 days.
            </li>
          </ol>
        </div>
      </div>
    </section>
  );
}
