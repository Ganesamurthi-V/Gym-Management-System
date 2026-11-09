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
    q: 'Is there a free trial?',
    a: 'Yes — 14 days with every feature unlocked and no credit card required. Import your members, send WhatsApp reminders, and run the 14-day free trial before you decide.',
  },
  {
    q: 'How much does GymFlow cost?',
    a: `Start free: the free forever plan covers up to ${FREE_MEMBER_LIMIT} members. Paid plans are ${formatINR(MONTHLY.price)} per month or ${formatINR(YEARLY.price)} for a year (save ${savingPercent(YEARLY)}%), with every feature, unlimited members, and unlimited WhatsApp messages. Gyms on the free plan can add WhatsApp reminders for ${formatINR(WHATSAPP_ADDON_PRICE)} per month. No GST, no per-member charges, and no setup fee.`,
  },
  {
    q: 'Are WhatsApp messages really unlimited?',
    a: 'Yes, on the paid plans. Welcome messages, renewal reminders, and payment due alerts are all included, so there is no per-message charge. On the free plan, WhatsApp reminders are a ₹299 per month add-on.',
  },
  {
    q: 'Can I move my existing members from Excel?',
    a: 'Upload your CSV or Excel file and GymFlow matches your column headings to its own fields, then shows a preview so you can correct anything before saving. Nothing is written until you confirm.',
  },
  {
    q: "Is my gym's data safe?",
    a: "Each gym's data is kept separate, and you sign in with your own account. Data is encrypted in transit. You can export members, attendance and payments to Excel, and delete your gym's data from account settings.",
  },
  {
    q: 'How fast does support reply?',
    a: 'Every paid plan includes direct founder support. Message us on WhatsApp or email support@gymflow.sbs and we reply within 24 hours.',
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
