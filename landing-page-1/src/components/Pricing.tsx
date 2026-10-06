import {
  ArrowRight,
  BadgeCheck,
  Check,
  CreditCard,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { useReveal } from '../lib/useReveal';
import RubberSegment from './ui/RubberSegment';
import Counter from './ui/Counter';

const APP_URL = 'https://app.gymflow.sbs';

/* The three billing tiers a gym owner can buy, matching the in-app subscription
   (platform_settings in the product DB). These must stay in step with the numbers
   rendered in app/owner/subscription — they are the same product.

   `months` drives the savings maths below, so the percentages can never drift from
   the prices: the saving is measured against paying the 1-month rate for that many
   months, not typed in by hand.

   Labels are the word forms (Monthly / Half-yearly / Yearly). The middle tier is
   deliberately NOT called "Quarterly": it is a 6-month plan (₹6,999), so "Quarterly"
   would misdescribe what the customer is charged for. Only the real three tiers are
   here — there is no 3-month plan in the product, and offering one the checkout
   cannot fulfil would break activation. */
const TIERS = [
  { id: 'monthly', label: 'Monthly', price: 1999, months: 1, unit: '/ month', tagline: 'Billed monthly.' },
  { id: 'half_yearly', label: 'Half-yearly', price: 6999, months: 6, unit: '/ 6 months', tagline: 'Billed once every 6 months.' },
  { id: 'yearly', label: 'Yearly', price: 12999, months: 12, unit: '/ year', tagline: 'Billed once a year.' },
] as const;

type TierId = (typeof TIERS)[number]['id'];

/** The 1-month price is the reference rate every saving is measured against. */
const MONTHLY_RATE = TIERS[0].price;

/* Counter (rolling-digit) sizing, shared by the ₹ glyph and the odometer so they
   stay the same height. Fixed px because Counter measures its strip height from a
   number, not a CSS clamp. */
const PRICE_FONT_SIZE = 38;

/* React Bits Counter renders one slot per entry in `places` and never hides a
   leading zero, so a fixed [10000,1000,…] would print ₹1,999 as "01999". Sizing
   the array to the current value's digit count keeps monthly at 4 slots and the
   6-month / yearly prices at 4–5, and the odometer still animates because only the
   values inside the shared slots change between two 4-digit tiers. */
function placesFor(value: number): number[] {
  const digits = Math.max(1, Math.floor(Math.log10(Math.max(1, value))) + 1);
  return Array.from({ length: digits }, (_, i) => 10 ** (digits - 1 - i));
}

/** Whole-percent saving vs paying the monthly rate for the same span. 0 for monthly. */
function savingPercent(tier: (typeof TIERS)[number]): number {
  const atMonthlyRate = MONTHLY_RATE * tier.months;
  if (atMonthlyRate <= tier.price) return 0;
  return Math.round((1 - tier.price / atMonthlyRate) * 100);
}

/* One line per module that actually ships. "Smart area detection" used to sit in
   this list and has been removed everywhere it appeared, including the JSON-LD
   featureList in index.html and public/llms.txt — a plan that says "all features"
   cannot list one that is not there. The member app took its place: app/m carries
   workouts, progress and rewards, and the owner side manages it from
   app/owner/member-app. */
const INCLUDED = [
  'Member management',
  'Payments & dues',
  'Attendance tracking',
  'Member app & workouts',
  'Reports & analytics',
  'Unlimited WhatsApp reminders',
  'CSV / Excel import & export',
  'Priority support',
] as const;

const ACTIVATION_STEPS = [
  {
    icon: Smartphone,
    title: 'Make the payment',
    desc: 'Pay for your chosen plan using any UPI app, net banking, or card.',
  },
  {
    icon: Upload,
    title: 'Upload the screenshot',
    desc: 'Open the Payments page and attach your payment screenshot.',
  },
  {
    icon: BadgeCheck,
    title: 'Get activated',
    desc: 'We verify it and switch your account on shortly after.',
  },
] as const;

export function Pricing() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });

  // The selected billing term. Opens on Monthly so the card first shows the lowest
  // entry price; the visitor sees all three terms and can switch to the longer,
  // cheaper-per-month plans.
  const [selected, setSelected] = useState<TierId>('monthly');
  const activeTier = TIERS.find(t => t.id === selected) ?? TIERS[0];
  const activeSaving = savingPercent(activeTier);

  return (
    <section
      id="pricing"
      ref={scope}
      aria-labelledby="pricing-title"
      className="has-dots px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="grid gap-x-16 gap-y-10 lg:grid-cols-2 lg:gap-x-20">
          {/* ── Header ────────────────────────────────────────────────────── */}
          {/* Left-aligned, and in the same grid as the cards. The section used to be a
              centred heading over a 920px pair, which was the odd one out between
              left-aligned sections on either side of it. The copy and the activation
              steps now sit on the left and the plan on the right, the same split as
              the WhatsApp section, and on a phone the order is heading, plan, steps. */}
        <div className="lg:col-start-1 lg:row-start-1">
          <span className="reveal eyebrow">Pricing</span>
          <h2 id="pricing-title" className="reveal display-2 mt-4 text-balance">
            One plan. <span className="text-muted-foreground">Everything included.</span>
          </h2>
          <p className="reveal lead mt-5 max-w-[520px]">
            No per-member charges, no setup fee, and no modules to unlock later. Start with
            a 14-day free trial — no credit card needed.
          </p>
        </div>

          {/* Plan card — filled accent, because this is the one thing on the page
              a visitor is meant to act on.

              No `reveal` on this card, deliberately: it holds the RubberSegment, whose
              thumb geometry is measured on mount. GSAP's reveal starts the card faded
              and mid-transform, and measuring the segment in that state left the thumb
              mis-clipped until an interaction. Rendering the card in its final layout
              from first paint removes that whole timing race; the section heading above
              still reveals, so the entrance still reads as animated. */}
          <div className="card-accent relative flex flex-col overflow-hidden p-4 md:p-5 lg:col-start-2 lg:row-span-2 lg:row-start-1 lg:self-start lg:sticky lg:top-28">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-pill bg-accent-ink/10 px-3.5 py-1.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-accent-ink">
                GymFlow Pro
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-ink px-3 py-1.5 text-[11px] font-medium text-accent">
                <Check className="h-3 w-3" strokeWidth={3} />
                All features
              </span>
            </div>

            {/* Price line. The saving figure sits to the RIGHT of the unit (the red-box
                spot) as plain text — no pill — with the percentage on the same rolling
                Counter odometer as the price, so 42 -> 46 rolls when the term changes. */}
            <div className="mt-5 flex flex-wrap items-end gap-x-1 gap-y-2">
              {/* Rupee glyph kept out of the odometer (Counter renders digits only). */}
              <span
                className="font-medium leading-none tracking-[-0.04em] text-accent-ink"
                style={{ fontSize: PRICE_FONT_SIZE }}
              >
                ₹
              </span>
              {/* React Bits rolling-digit Counter: the price digits spring to their new
                  place when the billing term changes. `places` covers up to 5 digits
                  (max ₹12,999); leading-zero places collapse via placesFor.
                  Gradients are transparent — the default black fade would band the
                  blue accent card. */}
              <Counter
                value={activeTier.price}
                places={placesFor(activeTier.price)}
                fontSize={PRICE_FONT_SIZE}
                padding={4}
                gap={0}
                horizontalPadding={0}
                textColor="var(--accent-ink)"
                fontWeight={500}
                gradientFrom="transparent"
                gradientTo="transparent"
                counterStyle={{ letterSpacing: '-0.04em' }}
              />
              <span className="pb-1.5 text-[14px] text-accent-ink/80">{activeTier.unit}</span>

              {/* Saving figure — plain text, right of the unit, only when the term saves. */}
              {activeSaving > 0 && (
                <span className="mb-1 ml-2 inline-flex items-center gap-0.5 text-[13px] font-semibold text-accent-ink">
                  <Counter
                    value={activeSaving}
                    places={placesFor(activeSaving)}
                    fontSize={13}
                    padding={2}
                    gap={0}
                    horizontalPadding={0}
                    textColor="var(--accent-ink)"
                    fontWeight={600}
                    gradientFrom="transparent"
                    gradientTo="transparent"
                  />
                  % off
                </span>
              )}
            </div>
            <p className="mt-3 text-[13px] text-accent-ink/80">
              {activeTier.tagline} Unlimited members, unlimited WhatsApp messages, every
              module.
            </p>

            {/* Billing-term selector — React Bits' RubberSegment: a draggable segmented
                control whose thumb stretches and springs between terms. Selecting a term
                (click, drag-and-release, or arrow keys) updates the headline price, unit
                and saving pill above via onChange -> setSelected.

                Themed to the blue plan card: the thumb is the white accent-ink surface the
                CTA uses, its text is the card's blue accent, and the resting track/text are
                translucent accent-ink so unselected terms read as quiet-on-blue. Each label
                carries its own "Save X%" badge so the discounts stay visible. */}
            <div className="mt-5">
              <RubberSegment
                aria-label="Billing term"
                value={selected}
                onChange={next => setSelected(next as TierId)}
                size="lg"
                radius={16}
                trackColor="color-mix(in srgb, var(--accent-ink) 12%, transparent)"
                thumbColor="var(--accent-ink)"
                textColor="var(--accent-ink)"
                activeTextColor="var(--accent)"
                items={TIERS.map(tier => ({
                  value: tier.id,
                  // Just the term name — the saving % lives only on the price line above.
                  label: <span className="font-semibold">{tier.label}</span>,
                }))}
              />
            </div>

            <div className="my-5 h-px bg-accent-ink/15" />

            <ul className="grid gap-x-6 gap-y-2 sm:grid-cols-2">
              {INCLUDED.map(item => (
                <li key={item} className="flex items-center gap-2.5">
                  <span className="grid h-4.5 w-4.5 shrink-0 place-items-center rounded-full bg-accent-ink">
                    <Check className="h-2.5 w-2.5 text-accent" strokeWidth={4} />
                  </span>
                  <span className="text-[13.5px] text-accent-ink">{item}</span>
                </li>
              ))}
            </ul>

            {/*
              mt-auto, so the CTA is pinned to the card's bottom edge.

              The two cards are grid siblings and the row takes the taller one's
              height, which is the activation card: measured, it is naturally about
              135px taller at 1440. Without this that 135px landed underneath the
              trial line as a gap below the last thing in the card, which reads as a
              layout fault. Anchoring the CTA collects the slack above it instead,
              between the feature list and the buttons, where extra room in a pricing
              card looks deliberate. pt-7 is the floor for when the heights do match,
              as they do once the cards stack on mobile.

              btn-lg stays: on mobile these are full-width, and the larger tap target
              is the reason index.css scopes its shrink to the hero only.
            */}
            <div className="mt-auto flex flex-col gap-3 pt-6">
              <a
                href={APP_URL}
                className="btn btn-lg w-full border border-accent-ink bg-accent-ink text-accent hover:bg-accent-ink/90"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </a>
            </div>

            <p className="mt-4 flex items-center justify-center gap-2 text-[11.5px] text-accent-ink/80">
              <ShieldCheck className="h-3.5 w-3.5" />
              14-day free trial first · Cancel anytime
            </p>
          </div>

          {/* Activation flow */}
          {/* Padding and rhythm track the plan card's. The two are grid siblings, so
              the row takes the taller one's height and the shorter card stretches to
              match: shrinking only one would just move the empty space, not remove
              it. */}
          <div className="reveal card flex flex-col p-6 md:p-8 lg:col-start-1 lg:row-start-2">
            <h3 className="display-3">Simple 3-step activation</h3>
            <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
              Payments are verified manually, so there is no card on file and nothing
              charges you automatically.
            </p>

            <ol className="mt-7 flex flex-col gap-6">
              {ACTIVATION_STEPS.map((step, index) => {
                const Icon = step.icon;
                return (
                  <li key={step.title} className="relative flex gap-4">
                    {/* Connector between markers, skipped on the last row */}
                    {index < ACTIVATION_STEPS.length - 1 && (
                      <span
                        aria-hidden
                        className="absolute left-[21px] top-11 h-[calc(100%+4px)] w-px bg-border-subtle"
                      />
                    )}
                    <span className="relative z-10 grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-subtle">
                      <Icon className="h-4.5 w-4.5 text-accent-text" />
                    </span>
                    {/* Number on its own line so the title and the description
                        share one left edge instead of stepping in and out. */}
                    <span className="min-w-0">
                      <span className="block font-mono text-[10.5px] tracking-wider text-muted-foreground">
                        {String(index + 1).padStart(2, '0')}
                      </span>
                      <span className="mt-1 block text-[14.5px] font-medium text-foreground">
                        {step.title}
                      </span>
                      <span className="mt-1.5 block text-[13px] leading-relaxed text-muted-foreground">
                        {step.desc}
                      </span>
                    </span>
                  </li>
                );
              })}
            </ol>

            <div className="mt-auto pt-7">
              <div className="flex items-start gap-3 rounded-2xl border border-border-subtle bg-subtle p-4">
                <span className="grid h-8 w-8 shrink-0 place-items-center rounded-xl bg-accent-soft">
                  <CreditCard className="h-4 w-4 text-accent-text" />
                </span>
                <span>
                  <span className="block text-[13px] font-medium text-foreground">
                    No UPI?
                  </span>
                  <span className="mt-0.5 block text-[12px] leading-relaxed text-muted-foreground">
                    Pay from any app you already use and upload the screenshot — it works
                    the same way.
                  </span>
                </span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
