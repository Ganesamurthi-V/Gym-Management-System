import { useState } from 'react';
import { WhatsAppThread } from './WhatsAppThread';
import { MESSAGE_TYPES } from './whatsappMessages';
import { Section } from './layout/Section';

/* Every line below matches featurePages.ts ('whatsapp' and 'fees-and-dues' entries): first expiry reminder
   18 days out, come-back messages for up to 18 days, payment and expiry reminders every 3 days up to 7
   times, checked once a day at about 9 AM India time. Nothing here is a number the product does not state. */
const SCHEDULE = [
  { title: 'Welcome', text: 'Sent once when you add a member, with their plan, start date and member ID.' },
  { title: 'Payment due', text: 'Names the amount and repeats until the due is paid in full.' },
  { title: 'Expiry reminders', text: 'Start 18 days before the plan ends and say how many days are left.' },
  { title: 'Renewal confirmation', text: 'Sent when you record the renewal, with the date it is valid until.' },
  { title: 'Membership expired', text: 'Asks the member to come back, for up to 18 days after the end date.' },
  { title: 'Birthday wishes', text: 'Sent on the member’s birthday, if you saved their date of birth.' },
] as const;

/* The one contrasting ground on the page (the graphite band): the phone is the picture, and it is light, so it
   reads against the dark. The picker swaps the sample message; the phone keeps its size, so nothing jumps. */
export function WhatsAppSection() {
  const [index, setIndex] = useState(0);
  const active = MESSAGE_TYPES[index];

  return (
    <Section id="whatsapp" labelledBy="whatsapp-title" tone="ink">
      <div className="sec-head">
        <h2 id="whatsapp-title" className="h2">
          WhatsApp reminders that send automatically
        </h2>
        <p className="lead">
          Welcome, payment due, expiry, renewal, expired and birthday messages go out on their own, with no per-message charge from GymFlow on paid plans.
        </p>
      </div>

      <div className="split">
        <div>
          <ol className="wa-grid">
            {SCHEDULE.map(item => (
              <li key={item.title}>
                <h3 className="h4">{item.title}</h3>
                <p>{item.text}</p>
              </li>
            ))}
          </ol>

          <p className="mt-8 text-[16px] text-muted-foreground">
            Checked once a day, about 9 AM India time.{' '}
            <a href="/whatsapp" className="link">
              <span>How WhatsApp reminders work</span>
            </a>
          </p>
        </div>

        <div className="panel p-5 sm:p-6">
          <div role="group" aria-label="Choose a sample message" className="wa-pick">
            {MESSAGE_TYPES.map((type, i) => (
              <button key={type.id} type="button" aria-pressed={i === index} onClick={() => setIndex(i)} className="wa-pick-btn">
                {type.title}
              </button>
            ))}
          </div>
          <div className="mx-auto mt-5 w-full max-w-[300px]">
            <WhatsAppThread messages={[active.message]} label={active.label} />
          </div>
        </div>
      </div>
    </Section>
  );
}
