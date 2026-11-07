import type { ReactNode } from 'react';
import { CalendarClock, IndianRupee, LifeBuoy, MessageCircle, MonitorSmartphone, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Section, SectionHead } from './layout/Section';

/* Six facts, reworded from featurePages.ts ("Built for independent gyms in India", members, attendance
   and WhatsApp pages) and the FAQ (data safety, support). Nothing here is a metric or a customer claim. */
const FACTS: { icon: LucideIcon; title: string; text: ReactNode }[] = [
  {
    icon: IndianRupee,
    title: 'Fees in rupees',
    text: 'Set your plan fees in rupees and record each payment as cash, UPI or card.',
  },
  {
    icon: MessageCircle,
    title: 'Members reached on WhatsApp',
    text: 'Welcome, renewal, expiry and payment due messages go to the app your members already use.',
  },
  {
    icon: MonitorSmartphone,
    title: 'Works on any phone or computer',
    text: 'GymFlow runs in a web browser: nothing to install and no equipment to buy.',
  },
  {
    icon: CalendarClock,
    title: 'Follows India time',
    text: 'Days follow India time, so a late evening visit counts for that day.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data is yours',
    text: "Each gym's data is kept separate and encrypted in transit. Export it to Excel any time.",
  },
  {
    icon: LifeBuoy,
    title: 'Support that answers you',
    text: (
      <>
        Message us on WhatsApp or email{' '}
        <a href="mailto:support@gymflow.sbs" className="text-accent-text underline-offset-2 hover:underline">
          support@gymflow.sbs
        </a>{' '}
        and we reply within 24 hours.
      </>
    ),
  },
];

/* The fee screen of the owner console, drawn in HTML: a rupee amount and the three ways a payment is recorded,
   UPI picked. It shows the first fact on the list instead of describing it. */
function FeeSlip() {
  return (
    <div aria-hidden className="panel p-6">
      <p className="h4">Record a fee</p>
      <div className="mt-4 divide-y divide-border-subtle text-[16px]">
        <div className="flex items-center justify-between py-3">
          <span className="text-muted-foreground">Member</span>
          <span className="font-medium">Divya Menon</span>
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="text-muted-foreground">Plan</span>
          <span className="font-medium">Monthly</span>
        </div>
        <div className="flex items-center justify-between py-3">
          <span className="text-muted-foreground">Amount</span>
          <span className="font-display text-[24px] font-semibold">₹1,200</span>
        </div>
      </div>
      <div className="mt-4 flex gap-2">
        {['Cash', 'UPI', 'Card'].map(mode => (
          <span
            key={mode}
            className={`flex min-h-[44px] flex-1 items-center justify-center rounded-lg border text-[16px] font-medium ${
              mode === 'UPI' ? 'border-accent bg-accent-soft text-accent-text' : 'border-border-strong text-muted-foreground'
            }`}
          >
            {mode}
          </span>
        ))}
      </div>
    </div>
  );
}

export function BuiltForIndia() {
  return (
    <Section id="india" labelledBy="india-title" tone="chalk">
      <div className="split items-center">
        <SectionHead
          title={
            <h2 id="india-title" className="h2">
              Built for independent gyms in India
            </h2>
          }
          lead="Made for gyms and fitness studios run by their owners, with rupees, UPI, WhatsApp and any phone in mind."
        />
        <FeeSlip />
      </div>

      <ul className="india-facts">
        {FACTS.map(fact => (
          <li key={fact.title}>
            <fact.icon aria-hidden className="size-5 text-accent-text" strokeWidth={1.75} />
            <h3 className="h4 mt-3">{fact.title}</h3>
            <p>{fact.text}</p>
          </li>
        ))}
      </ul>

      <p className="mt-8 text-[16px] text-muted-foreground">
        Run a yoga, Zumba or dance studio?{' '}
        <a href="/fitness-studio-management-software" className="link">
          <span>See how GymFlow fits a studio</span>
        </a>
      </p>
    </Section>
  );
}
