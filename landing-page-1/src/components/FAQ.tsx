import { useState } from 'react';
import { ChevronDown } from 'lucide-react';
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
    a: 'Upload your CSV or Excel file and GymFlow matches your column headings to its own fields, then shows a preview so you can correct anything before saving. Nothing is written until you confirm, and most gyms finish a few hundred members in under 15 minutes.',
  },
  {
    q: "Is my gym's data safe?",
    a: "Each gym's records are isolated and reachable only from your own account. Data is encrypted in transit, backed up regularly, and never shared with other gyms or sold on.",
  },
  {
    q: 'How do I reach support?',
    a: 'Over WhatsApp, phone, or email. Priority support is part of the plan, so you reach the people who build GymFlow rather than a ticket queue.',
  },
] as const;

export function FAQ() {
  /*
    Two scopes rather than one on the section, because the header and the list want
    different reveal behaviour.

    The header is a group that arrives together, so it keeps the default: one
    trigger for the scope, targets staggered. The list is tall enough that a single
    trigger would fire while the lower cards were still well below the fold, so
    those would animate unseen and sit at rest by the time they were reached.
    perElement gives each card its own trigger, which is how the reference site
    behaves: measured there, cards four and five held at opacity 0 until scrolled
    to, while the first three had already resolved.
  */
  const headerScope = useReveal<HTMLDivElement>({ stagger: 0.08 });
  const listScope = useReveal<HTMLUListElement>({ perElement: true, start: 'top 90%' });

  // First item open, matching the reference — it also proves the rows expand.
  const [open, setOpen] = useState<number | null>(0);

  return (
    <section id="faq" aria-labelledby="faq-title" className="px-5 py-24 md:px-8 md:py-28">
      {/* Narrow and centred, where this used to be a 1240px two-column split with a
          sticky intro. A single column keeps question and answer on one measure and
          puts the header above the content it introduces. */}
      <div className="mx-auto max-w-[820px]">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div ref={headerScope} className="text-center">
          <span className="reveal eyebrow">Frequently asked questions</span>
          <h2 id="faq-title" className="reveal display-2 mt-4 text-balance">
            Everything you <span className="text-muted-foreground">need to know.</span>
          </h2>
          <p className="reveal lead mx-auto mt-5 max-w-[520px]">
            Still unsure about something? Ask us directly and we will walk you through
            it.
          </p>
          <div className="reveal mt-8 flex flex-wrap items-center justify-center gap-3">
            <a href={APP_URL} className="btn btn-primary">
              Start free trial
            </a>
            <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn-outline">
              Contact support
            </a>
          </div>
        </div>

        {/* ── Accordion ─────────────────────────────────────────────────── */}
        {/* Separate cards with a gap, not rows divided by hairlines. gap-3 matches
            the reference; the card itself is the project's own .card, so the radius,
            surface and border come from the design system rather than being
            restated here. */}
        <ul ref={listScope} className="mt-14 flex flex-col gap-3">
          {FAQS.map((item, index) => {
            const expanded = open === index;
            const panelId = `faq-panel-${index}`;
            const buttonId = `faq-button-${index}`;

            return (
              <li
                key={item.q}
                className="reveal card transition-colors hover:border-border-strong"
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
                    onClick={() => setOpen(expanded ? null : index)}
                    className="flex w-full items-center justify-between gap-4 p-5 text-left sm:p-6"
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
                    {/* Indented to the button's padding so the answer lines up under
                        the question. No top padding: the button's own bottom padding
                        already separates them. */}
                    <p className="px-5 pb-5 text-[14.5px] leading-relaxed text-muted-foreground sm:px-6 sm:pb-6">
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
