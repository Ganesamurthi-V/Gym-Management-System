import type { ReactNode } from 'react';
import { CalendarClock, IndianRupee, LifeBuoy, MessageCircle, MonitorSmartphone, ShieldCheck, type LucideIcon } from 'lucide-react';
import { Rise } from './fx';
import { CenterHead, Section } from './layout/Section';

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
    text: 'GymFlow runs in a web browser, so there is nothing to install and no equipment to buy.',
  },
  {
    icon: CalendarClock,
    title: 'Follows India time',
    text: 'Days follow India time, so a late evening visit counts for that day. Expiry and payment due reminders are checked once a day, at about 9 AM.',
  },
  {
    icon: ShieldCheck,
    title: 'Your data is yours',
    text: "Each gym's data is kept separate and encrypted in transit. Export members, attendance and payments to Excel any time, and delete your gym's data from account settings.",
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

export function BuiltForIndia() {
  return (
    <Section id="india" labelledBy="india-title" tone="chalk">
      <CenterHead
        title={
          <h2 id="india-title" className="display-2 text-balance">
            Built for independent gyms in India
          </h2>
        }
        lead="Made for gyms and fitness studios run by their owners, with rupees, UPI, WhatsApp and any phone in mind."
      />

      <ul className="mt-12 grid gap-x-10 gap-y-12 md:mt-16 md:grid-cols-2 lg:grid-cols-3 lg:gap-x-12">
        {FACTS.map((fact, i) => (
          <Rise as="li" key={fact.title} delay={(i % 3) * 0.06} className="flex h-full flex-col border-t border-border-subtle pt-6">
            {/* Every card is the same stack at the same offsets: fixed icon tile, then title, then text, all on one left edge. */}
            <span className="grid size-10 shrink-0 place-items-center rounded-xl border border-border-subtle text-accent-text">
              <fact.icon aria-hidden className="size-5" strokeWidth={1.75} />
            </span>
            <h3 className="mt-4 font-display text-[19px] font-medium leading-snug tracking-[-0.02em] text-foreground">
              {fact.title}
            </h3>
            <p className="mt-2 text-pretty text-[16px] leading-relaxed text-muted-foreground">{fact.text}</p>
          </Rise>
        ))}
      </ul>

      <p className="mt-12 text-center text-[16px] text-muted-foreground md:mt-16">
        Run a yoga, Zumba or dance studio?{' '}
        <a href="/fitness-studio-management-software" className="font-medium text-accent-text underline-offset-2 hover:underline">
          See how GymFlow fits a studio
        </a>
        .
      </p>
    </Section>
  );
}
