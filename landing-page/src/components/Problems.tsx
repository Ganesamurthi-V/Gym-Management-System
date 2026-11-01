import { Rise, RiseGroup } from './fx';
import { Section } from './layout/Section';
import '../styles/problems.css';

/* Each row is a problem an owner has today and what GymFlow does about it. The "does" side is
   limited to behaviour already stated on the feature pages: the 18-day reminder start, the 7-day
   absence list, the 10-digit number tidy-up on import. No outcome figures. */
const ROWS: { problem: string; fix: string }[] = [
  {
    problem: 'Nobody noticed the plan had ended',
    fix: 'Every member shows as Active, Expiring or Expired, and expiry reminders start 18 days before the end date.',
  },
  {
    problem: 'Who owes how much?',
    fix: 'Part payments stay on the member as a pending due, with a list of who owes what.',
  },
  {
    problem: 'Typing the same reminder again and again',
    fix: 'Welcome, renewal, expiry, payment due and birthday messages go out on WhatsApp by themselves.',
  },
  {
    problem: 'The register shows who came, not who stopped',
    fix: 'A report lists members with a current plan who have not checked in for 7 days or more.',
  },
  {
    problem: 'Messy lists and phone numbers',
    fix: 'Import an Excel or CSV file, see a preview before anything is saved, and numbers are tidied to 10 digits.',
  },
  {
    problem: 'No clear picture of the month',
    fix: 'Five plain-English reports on members, money, dues, expiries and attendance, with a PDF to download.',
  },
];

const STEPS = [
  {
    when: 'The 12th',
    text: 'the first expiry reminder goes out on WhatsApp, saying how many days are left.',
  },
  {
    when: 'The 20th',
    text: 'you record the renewal. A renewal confirmation goes out and the remaining reminders stop.',
  },
  {
    when: 'If they do not renew',
    text: 'after the 30th, messages asking them to come back continue for up to 18 days.',
  },
];

export function Problems() {
  return (
    <Section id="problems" labelledBy="problems-title" tone="paper" className="overflow-clip!">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-x-16 lg:gap-y-16">
        <div className="relative min-w-0 lg:col-span-8 lg:row-start-1">
          <span aria-hidden className="outline-text problems-numeral">
            06
          </span>
          <div className="relative">
            <h2 id="problems-title" className="display-2 max-w-[16ch] min-w-0 break-words">{'The problems GymFlow solves'}</h2>
            <p className="lead mt-5 max-w-[560px]">
              The everyday jobs that eat an owner&rsquo;s week, and what GymFlow does about each one.
            </p>
          </div>
        </div>
        <div className="min-w-0 lg:col-span-8 lg:row-start-2">
          <div aria-hidden className="bar-rule" />
          <div role="table" aria-label="The problems GymFlow solves">
            <div role="rowgroup" className="sr-only">
              <div role="row">
                <span role="columnheader">Problem</span>
                <span role="columnheader">What GymFlow does</span>
              </div>
            </div>
            <RiseGroup role="rowgroup">
              {ROWS.map(r => (
                <div key={r.problem} role="row" className="ledger-row">
                  <p role="cell" className="ledger-problem">
                    {r.problem}
                  </p>
                  <p role="cell" className="ledger-fix">
                    {r.fix}
                  </p>
                </div>
              ))}
            </RiseGroup>
          </div>
          <div aria-hidden className="bar-rule" />
        </div>

        {/* An illustration, not a customer story: labelled as such so nobody reads it as one. It sits beside
            the heading and stays in view while the ledger scrolls. */}
        <aside className="min-w-0 lg:col-span-4 lg:col-start-9 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-28">
          <Rise className="slip p-6 pb-8">
            <h3 className="font-sans text-[20px] font-bold leading-snug normal-case text-foreground">
              A member whose plan ends on the 30th
            </h3>
            <ol className="mt-6 border-l-2 border-border-strong">
              {STEPS.map(step => (
                <li key={step.when} className="relative pb-6 pl-6 last:pb-0">
                  <span aria-hidden className="absolute left-[-6px] top-[7px] h-[10px] w-[10px] bg-accent" />
                  <p className="font-sans text-[16px] leading-relaxed text-muted-foreground">
                    <strong className="font-mono font-medium text-foreground">{step.when}:</strong> {step.text}
                  </p>
                </li>
              ))}
            </ol>
          </Rise>
          <p className="mt-4 text-[14px] text-muted-foreground">Example, not a customer</p>
        </aside>
      </div>
    </Section>
  );
}
