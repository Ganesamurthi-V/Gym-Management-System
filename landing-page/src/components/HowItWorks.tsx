import { Section } from './layout/Section';
import { Magnet, Rise } from './fx';
import '../styles/howitworks.css';
import { PLANS } from '../data/plans';

const APP_URL = 'https://app.gymflow.sbs';

/* Three steps, each a title and one plain sentence. Still an <ol>, so the order is carried by the
   markup. Only what the app does today: the import wizard takes Excel, CSV and XLS files, and plans
   and payments are set up inside the app. */
const STEPS = [
  {
    title: 'Create your gym account',
    desc: 'Sign up and set up your gym in the app.',
  },
  {
    title: 'Import your members',
    desc: 'Bring your list in from an Excel, CSV or XLS file, or add members one by one.',
    more: { label: 'More on importing and exporting members', href: '/import-export' },
  },
  {
    title: 'Start managing your gym',
    desc: 'Set up plans and payments, then run attendance and WhatsApp reminders from your phone.',
  },
] as const;

export function HowItWorks() {
  return (
    <Section id="how" labelledBy="steps-title">
      <h2 id="steps-title" className="display-2 max-w-[18ch] min-w-0 text-balance [overflow-wrap:break-word]">
        Get started in three steps
      </h2>

      <ol className="mt-12 flex flex-col gap-4 md:mt-16">
        {STEPS.map((step, i) => (
          <Rise as="li" key={step.title} delay={i * 0.06}>
            <div className="hiw-row grid items-center gap-5 md:grid-cols-[minmax(0,auto)_minmax(0,1fr)_minmax(0,260px)] md:gap-10">
              <span aria-hidden className="hiw-num">{i + 1}</span>
              <div className="min-w-0">
                <h3 className="display-3 text-balance">
                  {i + 1}. {step.title}
                </h3>
                <p className="mt-2 max-w-[52ch] text-[16px] leading-relaxed text-muted-foreground md:text-[18px]">
                  {step.desc}
                </p>
                {'more' in step && (
                  <p className="mt-1">
                    <a
                      href={step.more.href}
                      className="inline-flex min-h-[44px] items-center text-[16px] font-medium text-accent-text underline-offset-2 hover:underline"
                    >
                      {step.more.label}
                    </a>
                  </p>
                )}
              </div>
              <div aria-hidden className="min-w-0 md:justify-self-end">
                {i === 0 && <span className="slip hiw-chip">app.gymflow.sbs</span>}
                {i === 1 && <span className="slip hiw-chip">Excel, CSV or XLS</span>}
                {i === 2 && (
                  <span className="flex flex-wrap gap-2">
                    {PLANS.map(plan => (
                      <span key={plan.id} className="slip hiw-chip">{plan.label}</span>
                    ))}
                  </span>
                )}
              </div>
            </div>
          </Rise>
        ))}
      </ol>

      <Magnet className="mt-10 inline-block">
        <a href={APP_URL} className="btn btn-primary btn-lg">
          Start free trial
        </a>
      </Magnet>
    </Section>
  );
}
