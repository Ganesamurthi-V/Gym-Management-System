import { useState } from 'react';
import { WhatsAppThread } from './WhatsAppThread';
import { MESSAGE_TYPES } from './whatsappMessages';
import { CenterHead, CheckList, Section } from './layout/Section';
import { Rise } from './fx';
import { FREE_MEMBER_LIMIT, WHATSAPP_ADDON_PRICE, formatINR } from '../data/plans';
import '../styles/whatsapp.css';

/* Every line below matches featurePages.ts ('whatsapp' and 'fees-and-dues' entries): first expiry reminder
   18 days out, come-back messages for up to 18 days, payment and expiry reminders every 3 days up to 7
   times, checked once a day at about 9 AM India time. Nothing here is a number the product does not state. */
const SCHEDULE = [
  {
    title: 'Welcome',
    text: 'Sent once when you add a member, with their plan, start date and member ID.',
  },
  {
    title: 'Payment due',
    text: 'Sent while a member has an amount pending. It names the amount and repeats until the due is paid in full.',
  },
  {
    title: 'Expiry reminders',
    text: 'Start 18 days before the plan ends and tell the member how many days are left.',
  },
  {
    title: 'Renewal confirmation',
    text: 'Sent when you record the renewal, with the plan and the date it is valid until. The remaining expiry reminders stop.',
  },
  {
    title: 'Membership expired',
    text: 'If the member has not renewed, messages after the end date ask them to come back, for up to 18 days.',
  },
  {
    title: 'Birthday wishes',
    text: 'Sent on the member’s birthday, if you saved their date of birth.',
  },
] as const;

const SCHEDULE_FACTS = [
  'Reminders are checked once a day, in the morning, about 9 AM India time.',
  'Expiry, expired and payment due messages repeat every 3 days, up to 7 times, then stop.',
  'Only members with a valid 10-digit mobile number receive messages.',
  'Messages go out from GymFlow’s WhatsApp Business number, so there is nothing for you to connect.',
] as const;

const PLAN_FACTS = [
  'Monthly and yearly plans send unlimited WhatsApp messages.',
  `The free plan, for up to ${FREE_MEMBER_LIMIT} members, gets WhatsApp messages with the ${formatINR(WHATSAPP_ADDON_PRICE)} a month add-on.`,
] as const;

export function WhatsAppSection() {
  const [index, setIndex] = useState(0);
  const active = MESSAGE_TYPES[index];

  return (
    <Section id="whatsapp" labelledBy="whatsapp-title" tone="tint">
      <CenterHead
        title={
          <h2 id="whatsapp-title" className="display-2 text-balance">
            WhatsApp reminders that send automatically
          </h2>
        }
        lead="Welcome, payment due, expiry, renewal, expired and birthday messages go out on their own, with no per-message charge from GymFlow on paid plans."
      />

      <div className="mx-auto mt-8 w-fit max-w-full">
        <CheckList items={PLAN_FACTS} />
      </div>

      <div className="mt-14 grid gap-14 md:mt-20 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-7">
          <h3 className="display-3 text-balance">The message schedule</h3>

          <ol className="wa-line mt-8">
            {SCHEDULE.map((item, i) => (
              <Rise as="li" key={item.title} delay={i * 0.06} className="wa-step">
                <h4 className="font-display text-[20px] font-medium leading-[28px] tracking-[-0.02em] text-foreground">{item.title}</h4>
                <p className="mt-1 max-w-[52ch] text-[16px] leading-relaxed text-muted-foreground">{item.text}</p>
              </Rise>
            ))}
          </ol>

          <div className="mt-10 border-t border-border-subtle pt-8">
            <CheckList items={SCHEDULE_FACTS} />
          </div>
        </div>

        {/* The phone sits inside one white frame with nothing behind or over it. The picker swaps the
            sample message; the phone keeps its size, so the page does not jump. */}
        <Rise delay={0.08} className="mx-auto w-full min-w-0 max-w-[460px] lg:sticky lg:top-28 lg:col-span-5 lg:max-w-none lg:self-start">
          <h3 className="display-3 text-balance">What a member sees</h3>
          <div className="panel panel-lg mt-6 p-3 sm:p-6">
            <div role="group" aria-label="Choose a sample message" className="wa-pick">
              {MESSAGE_TYPES.map((type, i) => (
                <button
                  key={type.id}
                  type="button"
                  aria-pressed={i === index}
                  onClick={() => setIndex(i)}
                  className="wa-pick-btn"
                >
                  {type.title}
                </button>
              ))}
            </div>
            <div className="mx-auto mt-5 w-full max-w-[300px]">
              <WhatsAppThread messages={[active.message]} label={active.label} />
            </div>
          </div>
        </Rise>
      </div>

      <p className="mt-12 text-center">
        <a
          href="/whatsapp"
          className="inline-flex min-h-[44px] items-center text-[16px] font-medium text-accent-text underline-offset-2 hover:underline"
        >
          How WhatsApp reminders work
        </a>
      </p>
    </Section>
  );
}
