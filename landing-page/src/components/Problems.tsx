import { RuledList, Section, SectionHead, Split } from './layout/Section';

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
    <Section id="problems" labelledBy="problems-title">
      <Split
        head={
          <SectionHead
            title={<h2 id="problems-title" className="display-2 text-balance">{'The problems GymFlow solves'}</h2>}
            lead={<>The everyday jobs that eat an owner&rsquo;s week, and what GymFlow does about each one.</>}
          />
        }
      >
        <RuledList items={ROWS.map(r => ({ title: r.problem, text: r.fix }))} />

        {/* An illustration, not a customer story: labelled as such so nobody reads it as one. */}
        <div className="card mt-12 p-6 md:p-8">
          <p className="eyebrow text-accent-text">Example, not a customer</p>
          <h3 className="mt-3 text-[20px] font-bold text-foreground">A member whose plan ends on the 30th</h3>
          <ol className="mt-6 border-l border-border-subtle">
            {STEPS.map(step => (
              <li key={step.when} className="relative pb-6 pl-6 last:pb-0">
                <span
                  aria-hidden
                  className="absolute left-[-5px] top-[7px] h-[9px] w-[9px] rounded-full bg-accent"
                />
                <p className="text-[15px] leading-relaxed text-muted-foreground">
                  <strong className="font-semibold text-foreground">{step.when}:</strong> {step.text}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </Split>
    </Section>
  );
}
