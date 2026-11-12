import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Section } from './layout/Section';
import { FREE_MEMBER_LIMIT, PLANS, WHATSAPP_ADDON_PRICE, formatINR, savingPercent } from '../data/plans';

const [MONTHLY, YEARLY] = PLANS;

const APP_URL = 'https://app.gymflow.sbs';


/**
 * Kept verbatim in sync with the FAQPage JSON-LD in index.html. Structured data
 * describing text a visitor cannot find on the page is treated as spam, so if
 * you edit copy here, edit it there in the same commit.
 */
const FAQS = [
  {
    q: 'Is there free gym management software?',
    a: 'Yes. GymFlow has a free forever plan for up to 50 members, with member management, fees and dues, attendance tracking and member import. A 14-day trial with every feature unlocked comes first, with no credit card required.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes. GymFlow has a 14-day free trial with every feature unlocked and no credit card required. Import your members, send WhatsApp reminders, and run the trial before you decide.',
  },
  {
    q: 'How much does gym management software cost in India?',
    a: `GymFlow costs ${formatINR(MONTHLY.price)} per month or ${formatINR(YEARLY.price)} for a year (save ${savingPercent(YEARLY)}%), with every feature, unlimited members, and unlimited WhatsApp messages. A free forever plan covers up to ${FREE_MEMBER_LIMIT} members, and gyms on it can add WhatsApp reminders for ${formatINR(WHATSAPP_ADDON_PRICE)} per month. No GST, no per-member charges, and no setup fee.`,
  },
  {
    q: 'Are WhatsApp messages really unlimited?',
    a: 'Yes, on the GymFlow paid plans. Welcome messages, renewal reminders, and payment due alerts are all included, so there is no per-message charge. On the free plan, WhatsApp reminders are a ₹299 per month add-on.',
  },
  {
    q: 'How do I send gym membership expiry reminders on WhatsApp?',
    a: 'GymFlow sends them automatically on WhatsApp. The first expiry reminder goes out 18 days before the plan ends, then one every 3 days, up to 7 times, until you record the renewal. On the free plan this needs the ₹299 per month WhatsApp add-on.',
  },
  {
    q: 'Can I move my existing members from Excel?',
    a: 'Yes. Upload your CSV or Excel file and GymFlow matches your column headings to its own fields, then shows a preview so you can correct anything before saving. Nothing is written until you confirm.',
  },
  {
    q: 'Does GymFlow work with biometric fingerprint and face attendance devices?',
    a: 'Yes. GymFlow works with fingerprint and face attendance devices that have an ADMS or Cloud Server (push) setting. When a member punches on the device, GymFlow records the check-in automatically. Fingerprint and face data stay on the device and are never sent to GymFlow. Setup takes about 15 minutes.',
  },
  {
    q: 'Can I track gym attendance without a biometric device?',
    a: 'Yes. The GymFlow check-in kiosk is a web page on a phone, tablet or computer at your desk. Members type their member ID, and GymFlow records check-in and check-out times. No turnstile, scanner or fingerprint device is needed, and you can add one later.',
  },
  {
    q: 'Is GymFlow suitable for a small gym?',
    a: 'Yes. GymFlow is built for independent gyms in India, and the free plan covers up to 50 members. It is built for one gym, not a chain of branches. Start with the 14-day trial, with every feature unlocked.',
  },
  {
    q: "Is my gym's data safe?",
    a: "GymFlow keeps each gym's data separate, and you sign in with your own account. Data is encrypted in transit. You can export members, attendance and payments to Excel, and delete your gym's data from account settings.",
  },
  {
    q: 'How fast does support reply?',
    a: 'Every GymFlow paid plan includes direct founder support. Message us on WhatsApp or email support@gymflow.sbs and we reply within 24 hours.',
  },
  {
    q: 'How do I reach support?',
    a: 'Over WhatsApp, phone, or email. You talk to the person who builds GymFlow rather than a ticket queue, and we reply within 24 hours. Support in English and Tamil.',
  },
  {
    q: 'Where can I check if GymFlow is working?',
    a: 'Our public status page at status.gymflow.sbs shows whether GymFlow is running normally and lists any issues we are working on. If it shows all clear and something still looks wrong, message us on WhatsApp or email support@gymflow.sbs.',
  },
] as const;

/* Every answer is open: an accordion hides the one thing a visitor came for, and the answers are also what the
   FAQPage JSON-LD in index.html quotes, so they stay visible text. Two columns on the page's split line. */
/* Every question is a drawer. With a mouse it opens while the pointer is over it; a click or tap (and Enter or Space)
   holds it open or closed. An opening drawer pushes the cards below it in its own column down; it never overlaps or
   hides another question. All answers stay in the page text either way. */
export function FAQ() {
  const [open, setOpen] = useState<string | null>(null);

  return (
    <Section id="faq" labelledBy="faq-title" tone="paper">
      <div className="sec-head flex flex-col items-center gap-6">
        <div>
          <h2 id="faq-title" className="h2">
            Gym management software FAQ
          </h2>
          <p className="lead">Straight answers about pricing, setup, WhatsApp reminders and your data.</p>
        </div>
        <div className="flex flex-wrap justify-center gap-3">
          <a href={APP_URL} className="btn btn-primary">
            Start free trial
          </a>
          <a href="#support" className="btn btn-outline">
            Contact support
          </a>
        </div>
      </div>

      <div className="faq-grid">
        {[FAQS.slice(0, Math.ceil(FAQS.length / 2)), FAQS.slice(Math.ceil(FAQS.length / 2))].map((col, c) => (
          <ul key={c} className="faq-col">
            {col.map((item, j) => {
          const i = c === 0 ? j : Math.ceil(FAQS.length / 2) + j;
          const isOpen = open === item.q;
          return (
            <li key={item.q} className="faq-item" data-open={isOpen || undefined}>
              <h3 className="h4">
                <button
                  type="button"
                  id={`faq-q-${i}`}
                  aria-expanded={isOpen}
                  aria-controls={`faq-a-${i}`}
                  onClick={() => setOpen(isOpen ? null : item.q)}
                  className="faq-q"
                >
                  {item.q}
                  <ChevronDown aria-hidden className="faq-chev size-5 shrink-0" strokeWidth={2} />
                </button>
              </h3>
              <div id={`faq-a-${i}`} role="region" aria-labelledby={`faq-q-${i}`} className="faq-a">
                <div>
                  <p>{item.a}</p>
                </div>
              </div>
            </li>
          );
            })}
          </ul>
        ))}
      </div>
    </Section>
  );
}
