import { CenterHead, CheckList, Section } from './layout/Section';
import { Magnet, Rise } from './fx';
import '../styles/howitworks.css';
import { FREE_MEMBER_LIMIT } from '../data/plans';

const APP_URL = 'https://app.gymflow.sbs';

interface Step {
  title: string;
  desc: string;
  facts: readonly string[];
  more?: { label: string; href: string };
}

/* Three steps, each a title, a plain sentence and a few checked facts. Still an <ol>, so the order is carried by
   the markup and the numeral is decoration. Only what the app does today (featurePages.ts): the import wizard
   takes Excel, CSV and XLS files and shows a preview first; fees are recorded by cash, UPI or card; the
   attendance kiosk is a page on a phone or tablet at the desk. */
const STEPS: readonly Step[] = [
  {
    title: 'Create your gym account',
    desc: 'Sign up and set up your gym in the app.',
    facts: [
      'Sign up at app.gymflow.sbs, in any web browser.',
      '14-day free trial, no credit card needed.',
      `Free forever for up to ${FREE_MEMBER_LIMIT} members.`,
    ],
  },
  {
    title: 'Import your members',
    desc: 'Bring your list in from an Excel, CSV or XLS file, or add members one by one.',
    facts: [
      'See a preview before anything is saved.',
      'Phone numbers are tidied to 10 digits, and any that cannot be fixed are flagged.',
      'Export your members to Excel whenever you need a copy.',
    ],
    more: { label: 'More on importing and exporting members', href: '/import-export' },
  },
  {
    title: 'Start managing your gym',
    desc: 'Set up plans and payments, then run attendance and WhatsApp reminders from your phone.',
    facts: [
      'Record fees by cash, UPI or card and keep track of pending dues.',
      'Members check in at a front-desk kiosk on a phone or tablet.',
      'Welcome, expiry and payment due messages go out on WhatsApp by themselves.',
    ],
  },
];

export function HowItWorks() {
  return (
    <Section id="how" labelledBy="steps-title" tone="paper">
      <CenterHead
        title={
          <h2 id="steps-title" className="display-2 text-balance">
            Get started in three steps
          </h2>
        }
        lead="Sign up, bring in your members and run the gym from your phone. It works in a web browser, so there is nothing to install."
      />

      <ol className="hiw-steps mt-14 md:mt-20">
        {STEPS.map((step, i) => (
          <Rise as="li" key={step.title} delay={i * 0.06} className="min-w-0">
            <span aria-hidden className="hiw-num">{i + 1}</span>
            <h3 className="display-3 mt-6 text-balance">{step.title}</h3>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground md:text-[17px]">{step.desc}</p>
            <CheckList items={step.facts} className="mt-6" />
            {step.more && (
              <p className="mt-3">
                <a
                  href={step.more.href}
                  className="inline-flex min-h-[44px] items-center text-[16px] font-medium text-accent-text underline-offset-2 hover:underline"
                >
                  {step.more.label}
                </a>
              </p>
            )}
          </Rise>
        ))}
      </ol>

      <div className="mt-16 flex justify-center md:mt-20">
        <Magnet strength={0.12}>
          <a href={APP_URL} className="btn btn-primary btn-lg">
            Start free trial
          </a>
        </Magnet>
      </div>
    </Section>
  );
}
