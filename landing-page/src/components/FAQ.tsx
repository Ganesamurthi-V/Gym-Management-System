import { useState } from 'react';
import { Section } from './layout/Section';
import '../styles/faq.css';
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

/* Hover only means something with a mouse. Touch screens fire a synthetic mouseenter on
   tap, and there a tap has to toggle, so the two behaviours are told apart here. */
const canHover = () => window.matchMedia('(hover: hover) and (pointer: fine)').matches;

export function FAQ() {
  // First item open, matching the reference — it also proves the rows expand.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <Section id="faq" labelledBy="faq-title">
      <div className="grid gap-12 lg:grid-cols-12 lg:gap-16">
        <div className="min-w-0 lg:col-span-5">
          <div className="lg:sticky lg:top-28">
            <h2 id="faq-title" className="display-2 min-w-0 text-balance [overflow-wrap:break-word]">
              Gym management software FAQ
            </h2>
            <p className="lead mt-5 max-w-[40ch]">
              Straight answers about pricing, setup, WhatsApp reminders and your data.
            </p>
            <div className="mt-7 flex flex-wrap items-center gap-3">
              <a href={APP_URL} className="btn btn-primary">
                Get Started
              </a>
              <a href="#support" className="btn btn-outline">
                Contact Support
              </a>
            </div>
          </div>
        </div>

        {/* Accordion: 1px ruled rows. */}
        <ul className="min-w-0 border-b border-border-subtle lg:col-span-7">
          {FAQS.map((item, index) => {
            const expanded = open === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;

            return (
              <li
                key={item.q}
                onMouseEnter={() => {
                  if (canHover()) setOpen(index);
                }}
                data-open={expanded || undefined}
                className="faq-row border-t border-border-subtle"
              >
                <h3>
                  {/* A real button inside the heading, keeping aria-expanded and aria-controls.
                      The padding lives on the button so the whole row is the hit area. */}
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    // With a mouse, hover has already opened the row, so a click must not
                    // close it again; it still toggles on touch and for keyboard users.
                    onClick={() => setOpen(expanded && !canHover() ? null : index)}
                    className="faq-trigger flex w-full items-center justify-between gap-6 py-6 text-left"
                  >
                    <span className="min-w-0 font-display text-[18px] font-medium leading-snug text-foreground md:text-[20px]">
                      {item.q}
                    </span>
                    {/* A plus that turns into a minus on open (transform only, see faq.css). */}
                    <span aria-hidden className="faq-glyph" />
                  </button>
                </h3>

                {/* The answer stays in the DOM when collapsed: the FAQPage JSON-LD in index.html
                    quotes every answer, and structured data describing text a visitor cannot find
                    on the page is treated as spam. `hidden` collapses it (height snaps); on open
                    the paragraph fades in over a 6px drop (opacity + transform, faq.css). */}
                <div id={panelId} role="region" aria-labelledby={buttonId} hidden={!expanded}>
                  <p className="faq-answer max-w-[58ch] pb-6 text-base leading-relaxed text-muted-foreground">
                    {item.a}
                  </p>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </Section>
  );
}
