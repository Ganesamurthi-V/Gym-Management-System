import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { Section, SectionHead, Split } from './layout/Section';
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
      <Split
        head={
          <SectionHead
            title={<h2 id="faq-title" className="display-2 text-balance">{'Gym software FAQ: everything you need to know'}</h2>}
            lead="Straight answers on pricing, WhatsApp messages and moving your members over."
          >
            <div className="flex flex-wrap items-center gap-3">
              <a href={APP_URL} className="btn btn-primary">
                Get Started
              </a>
              <a href="#support" className="btn btn-outline">
                Contact Support
              </a>
            </div>
          </SectionHead>
        }
      >
        {/* ── Accordion ─────────────────────────────────────────────────── */}
        <ul className="flex flex-col border-b border-border-subtle">
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
                className="border-t border-border-subtle"
              >
                <h3>
                  {/*
                    A real button inside the heading, keeping aria-expanded and
                    aria-controls. The reference puts role="button" tabindex="0" on the
                    card div instead, which gives up the native Enter and Space
                    handling and the implicit role for no visual gain. The padding
                    lives on the button rather than the card so the whole top of the
                    card is the hit area, which is what makes it feel like the card is
                    the control.
                  */}
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    // With a mouse, hover has already opened the card, so a click must not
                    // close it again; it still toggles on touch and for keyboard users.
                    onClick={() => setOpen(expanded && !canHover() ? null : index)}
                    className="flex w-full items-center justify-between gap-4 py-5 text-left"
                  >
                    <span className="text-[15.5px] font-medium tracking-tight text-foreground sm:text-[16.5px]">
                      {item.q}
                    </span>
                    {/*
                      Chevron rotating a half turn, where this used to be a plus
                      rotating 45 degrees into a cross. 300ms to match the measured
                      reference, which took about 260ms to travel 0 to 180.
                    */}
                    <ChevronDown
                      aria-hidden
                      className={`h-5 w-5 shrink-0 text-muted-foreground transition-transform duration-300 ease-out ${
                        expanded ? 'rotate-180' : ''
                      }`}
                    />
                  </button>
                </h3>

                {/*
                  Collapsed with grid-template-rows 0fr -> 1fr rather than
                  max-height, so the row animates to the answer's real height
                  without hard-coding a guess that clips longer copy.

                  The answer stays in the DOM when collapsed. The reference unmounts
                  it and animates height 0 -> auto through Framer Motion, which looks
                  the same but cannot be copied here: the FAQPage JSON-LD in
                  index.html quotes every answer, and structured data describing text
                  a visitor cannot find on the page is treated as spam. Nothing inside
                  is focusable, so leaving it mounted traps no keyboard user.

                  300ms, down from 400. Measured on the reference, open and close both
                  took about 250 to 260ms.
                */}
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="grid transition-all duration-300 ease-out"
                  style={{
                    gridTemplateRows: expanded ? '1fr' : '0fr',
                    opacity: expanded ? 1 : 0,
                  }}
                >
                  <div className="overflow-hidden">
                    <p className="pb-5 text-[14.5px] leading-relaxed text-muted-foreground">
                      {item.a}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Split>
    </Section>
  );
}
