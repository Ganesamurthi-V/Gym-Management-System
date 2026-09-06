import { useState } from 'react';
import { Plus } from 'lucide-react';
import { useReveal } from '../lib/useReveal';

const APP_URL = 'https://app.gymflow.sbs';
const SUPPORT_EMAIL = 'ganesamurthiv@gmail.com';

/**
 * Kept verbatim in sync with the FAQPage JSON-LD in index.html. Structured data
 * describing text a visitor cannot find on the page is treated as spam, so if
 * you edit copy here, edit it there in the same commit.
 */
const FAQS = [
  {
    q: 'Is there a free trial?',
    a: 'Yes — 14 days with every feature unlocked and no credit card required. Import your members, send WhatsApp reminders, and run a full week of operations before you decide.',
  },
  {
    q: 'How much does GymFlow cost?',
    a: '₹3,000 per month, flat. One plan with every feature, unlimited members, and unlimited WhatsApp messages. No per-member charges, no setup fee, and no modules to unlock later.',
  },
  {
    q: 'Are WhatsApp messages really unlimited?',
    a: 'Yes. Welcome messages, renewal reminders, and payment due alerts are all included. Most gym platforms bill ₹0.30 to ₹1 per message, which becomes thousands a month once you pass 200 members.',
  },
  {
    q: 'Can I move my existing members from Excel?',
    a: 'Upload your CSV or Excel file and GymFlow auto-detects the columns, normalises area names, and flags any rows that need review. Most gyms finish a few hundred members in under 15 minutes.',
  },
  {
    q: "Is my gym's data safe?",
    a: "Each gym's records are isolated and reachable only from your own account. Data is encrypted in transit, backed up regularly, and never shared with other gyms or sold on.",
  },
  {
    q: 'Do you offer support in Tamil?',
    a: 'Yes — over WhatsApp, phone, and email, in both Tamil and English. Priority support is part of the plan, so you reach the people who build GymFlow rather than a ticket queue.',
  },
] as const;

export function FAQ() {
  const scope = useReveal<HTMLElement>({ stagger: 0.06 });
  // First item open, matching the template — it also proves the rows expand.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" ref={scope} className="px-5 py-24 md:px-8 md:py-28">
      <div className="mx-auto grid max-w-[1240px] gap-12 lg:grid-cols-[minmax(0,400px)_1fr] lg:gap-20">
        {/* ── Intro ─────────────────────────────────────────────────────── */}
        <div className="lg:sticky lg:top-28 lg:self-start">
          <span className="reveal eyebrow">Frequently asked questions</span>
          <h2 className="reveal display-2 mt-4 text-balance">
            Everything you
            <br />
            <span className="text-muted-foreground">need to know.</span>
          </h2>
          <p className="reveal lead mt-5 max-w-[340px]">
            Still unsure about something? Ask us directly — we answer in Tamil or English.
          </p>
          <div className="reveal mt-8 flex flex-wrap gap-3">
            <a href={APP_URL} className="btn btn-primary">
              Start free trial
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn-outline">
              Contact support
            </a>
          </div>
        </div>

        {/* ── Accordion ─────────────────────────────────────────────────── */}
        <ul className="flex flex-col">
          {FAQS.map((item, index) => {
            const expanded = open === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;

            return (
              <li key={item.q} className="reveal border-t border-border-subtle last:border-b">
                <h3>
                  <button
                    type="button"
                    id={buttonId}
                    aria-expanded={expanded}
                    aria-controls={panelId}
                    onClick={() => setOpen(expanded ? null : index)}
                    className="flex w-full items-start justify-between gap-6 py-6 text-left"
                  >
                    <span
                      className={`text-[16.5px] font-medium tracking-tight transition-colors ${
                        expanded ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      {item.q}
                    </span>
                    <span
                      className={`mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-full border transition-all duration-300 ${
                        expanded
                          ? 'rotate-45 border-accent bg-accent text-accent-ink'
                          : 'border-border-subtle text-muted-foreground'
                      }`}
                    >
                      <Plus className="h-3.5 w-3.5" />
                    </span>
                  </button>
                </h3>

                {/*
                  Collapsed with grid-template-rows 0fr -> 1fr rather than
                  max-height, so the row animates to the answer's real height
                  without hard-coding a guess that clips longer copy.

                  The answer stays in the DOM when collapsed: the FAQPage markup
                  has to correspond to content that is actually on the page, and
                  there are no focusable elements inside to trap a keyboard user.
                */}
                <div
                  id={panelId}
                  role="region"
                  aria-labelledby={buttonId}
                  className="grid transition-all duration-400 ease-out"
                  style={{
                    gridTemplateRows: expanded ? '1fr' : '0fr',
                    opacity: expanded ? 1 : 0,
                  }}
                >
                  <div className="overflow-hidden">
                    <p className="max-w-[620px] pb-7 text-[14.5px] leading-relaxed text-muted-foreground">
                      {item.a}
                    </p>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
