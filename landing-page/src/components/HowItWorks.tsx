import type { ReactNode } from 'react';
import { Check } from 'lucide-react';
import { Section, SectionHead } from './layout/Section';
import { FREE_MEMBER_LIMIT } from '../data/plans';

const APP_URL = 'https://app.gymflow.sbs';

interface Step {
  title: string;
  desc: string;
  facts: readonly string[];
  art: ReactNode;
  more?: { label: string; href: string };
}

/* Each step shows its own moment as a small piece of the real app, drawn in HTML, so the section is not a row
   of words. Only what the app does today (featurePages.ts): the import wizard takes Excel, CSV and XLS files
   and shows a preview first; the attendance kiosk is a page on a phone or tablet at the desk. */
const STEPS: readonly Step[] = [
  {
    title: 'Create your gym account',
    desc: 'Sign up and set up your gym in the app.',
    facts: ['14-day free trial, no credit card needed.', `Free forever for up to ${FREE_MEMBER_LIMIT} members.`],
    art: (
      <>
        <div className="field">Gym name</div>
        <div className="field mt-2">Mobile number</div>
        <div className="mt-3 flex justify-end">
          <span className="chip">Create account</span>
        </div>
      </>
    ),
  },
  {
    title: 'Import your members',
    desc: 'Bring your list in from an Excel, CSV or XLS file, or add members one by one.',
    facts: ['See a preview before anything is saved.', 'Phone numbers are tidied to 10 digits.'],
    art: (
      <>
        {['Divya Menon', 'Prakash Selvam', 'Sneha Iyer'].map(name => (
          <div key={name} className="row">
            <span>{name}</span>
            <Check aria-hidden className="size-4 text-accent-text" strokeWidth={2.5} />
          </div>
        ))}
        <div className="row">
          <span className="text-muted-foreground">Ready to import</span>
          <span className="chip">Confirm</span>
        </div>
      </>
    ),
    more: { label: 'More on importing and exporting members', href: '/import-export' },
  },
  {
    title: 'Start managing your gym',
    desc: 'Set up plans and payments, then run attendance and WhatsApp reminders from your phone.',
    facts: ['Record fees by cash, UPI or card.', 'Welcome and expiry messages go out on WhatsApp by themselves.'],
    art: (
      <>
        <div className="field">GF0253</div>
        <div className="row mt-2">
          <span>Divya Menon</span>
          <span className="chip">Checked in</span>
        </div>
        <div className="row">
          <span className="text-muted-foreground">Plan</span>
          <span>Expiring in 2 days</span>
        </div>
      </>
    ),
  },
];

export function HowItWorks() {
  return (
    <Section id="how" labelledBy="steps-title" tone="paper">
      <SectionHead
        title={
          <h2 id="steps-title" className="h2">
            Get started in three steps
          </h2>
        }
        lead="Sign up, bring in your members and run the gym from your phone. It works in a web browser, so there is nothing to install."
      />

      <ol className="steps">
        {STEPS.map((step, i) => (
          <li key={step.title} className="min-w-0">
            <div aria-hidden className="panel step-art">
              {step.art}
            </div>
            <p className="font-display text-[16px] font-medium text-accent-text">Step {i + 1}</p>
            <h3 className="h3 mt-1">{step.title}</h3>
            <p className="mt-3 text-[16px] leading-relaxed text-muted-foreground">{step.desc}</p>
            <ul className="facts mt-5">
              {step.facts.map(fact => (
                <li key={fact}>{fact}</li>
              ))}
            </ul>
            {step.more && (
              <a href={step.more.href} className="link mt-2">
                <span>{step.more.label}</span>
              </a>
            )}
          </li>
        ))}
      </ol>

      <div className="mt-12">
        <a href={APP_URL} className="btn btn-primary">
          Start free trial
        </a>
      </div>
    </Section>
  );
}
