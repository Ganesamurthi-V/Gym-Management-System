import { ArrowRight } from 'lucide-react';
import { Section, SectionHead, Split } from './layout/Section';
import { MAIL_URL, SUPPORT_EMAIL, SUPPORT_PROMISE, WHATSAPP_URL } from '../data/support';

const APP_URL = 'https://app.gymflow.sbs';

/* Four steps, each a title and one plain sentence. Still an <ol>, so the order is
   carried by the markup. Only what the app does today: the import wizard takes
   Excel, CSV and XLS files, and plans and payments are set up inside the app. */
const STEPS = [
  {
    title: 'Create your gym account',
    desc: 'Sign up and set up your gym in the app.',
  },
  {
    title: 'Import your member records',
    desc: 'Bring your list in from an Excel, CSV or XLS file, or add members one by one.',
    more: { label: 'More on importing and exporting members', href: '/import-export' },
  },
  {
    title: 'Configure memberships and payments',
    desc: 'Set up your plans and payment options inside the app.',
  },
  {
    title: 'Start managing your gym',
    desc: 'Attendance, payments and WhatsApp reminders, all from your phone.',
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how" labelledBy="how-title">
      <Split
        head={
          <SectionHead
            title={<h2 id="how-title" className="display-2 text-balance">{'How to set up GymFlow for your gym'}</h2>}
            lead="Move from spreadsheets and manual records to GymFlow with guided setup and practical support."
          >
            <p className="text-[14px] font-medium text-foreground">{SUPPORT_PROMISE}</p>
            <div className="mt-6 flex flex-col items-stretch gap-3 sm:flex-row sm:flex-wrap sm:items-center">
              <a href={APP_URL} className="btn btn-primary btn-lg">
                Get Started
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={WHATSAPP_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="btn btn-outline btn-lg"
              >
                Talk to Our Team
              </a>
            </div>
            <p className="mt-4 text-[13px] text-muted-foreground">
              or email{' '}
              <a
                href={MAIL_URL}
                className="rounded font-medium text-foreground underline underline-offset-2 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
              >
                {SUPPORT_EMAIL}
              </a>
            </p>
          </SectionHead>
        }
      >
          <ol className="flex flex-col">
            {STEPS.map((step, i) => (
              <li key={step.title} className="flex gap-5 border-t border-border-subtle py-8 first:border-t-0 first:pt-0">
                <span
                  aria-hidden
                  className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-accent text-[18px] font-semibold tabular-nums text-accent-ink"
                >
                  {i + 1}
                </span>
                <div className="min-w-0 pt-1.5">
                  <h3 className="text-balance text-[24px] font-medium leading-[1.15] tracking-[-0.025em] md:text-[32px]">{step.title}</h3>
                  <p className="mt-2.5 max-w-[460px] text-[15px] leading-relaxed text-muted-foreground md:text-[16px]">
                    {step.desc}
                  </p>
                  {'more' in step && (
                    <p className="mt-2 text-[14px]">
                      <a
                        href={step.more.href}
                        className="inline-flex min-h-[44px] items-center rounded font-medium text-accent-text underline underline-offset-2 hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent"
                      >
                        {step.more.label}
                      </a>
                    </p>
                  )}
                </div>
              </li>
            ))}
          </ol>
      </Split>
    </Section>
  );
}
