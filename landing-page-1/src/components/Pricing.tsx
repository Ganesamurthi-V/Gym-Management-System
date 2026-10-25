import { ArrowRight, BadgeCheck, Check, Smartphone, Upload } from 'lucide-react';
import { useState } from 'react';
import { useReveal } from '../lib/useReveal';
import { ShinyText } from './ShinyText';
import GlowBorder from './ui/GlowBorder';
import RubberSegment from './ui/RubberSegment';
import Counter from './ui/Counter';
import {
  FREE_MEMBER_LIMIT,
  PLANS,
  formatINR,
  perMonth,
  savingPercent,
} from '../data/plans';

const APP_URL = 'https://app.gymflow.sbs';

const [MONTHLY, YEARLY] = PLANS;

/* Counter (rolling-digit) sizing, shared by the rupee glyph and the odometer so they
   stay the same height. Fixed px because Counter measures its strip height from a number. */
const PRICE_FONT_SIZE = 44;

/* Counter renders one slot per entry in `places` and never hides a leading zero, so
   the slots are sized to the current value's digit count (₹999 -> 3, ₹9,999 -> 4). */
function placesFor(value: number): number[] {
  const digits = Math.max(1, Math.floor(Math.log10(Math.max(1, value))) + 1);
  return Array.from({ length: digits }, (_, i) => 10 ** (digits - 1 - i));
}

const ACTIVATION_STEPS = [
  {
    icon: Smartphone,
    title: 'Make the payment',
    desc: 'Pay for your chosen plan using any UPI app.',
  },
  {
    icon: Upload,
    title: 'Upload the screenshot',
    desc: 'Open the Subscription page in the app and attach your payment screenshot.',
  },
  {
    icon: BadgeCheck,
    title: 'Get activated',
    desc: 'We verify it and switch your account on shortly after.',
  },
] as const;

type Card = {
  id: string;
  name: string;
  tagline: string;
  price: number;
  unit: string;
  note?: string;
  badge?: string;
  cta: string;
  features: readonly string[];
  highlight?: boolean;
};

const FREE_CARD: Card = {
  id: 'free',
  name: 'Free forever',
  tagline: 'Everything you need to get started',
  price: 0,
  unit: '/ month',
  cta: 'Get Free',
  features: [
    `Up to ${FREE_MEMBER_LIMIT} members`,
    'Member management',
    'Fees and dues',
    'Attendance tracking',
    'Import members from Excel or CSV',
  ],
};

/* One paid card whose contents follow the Monthly / Yearly switch above it. */
const PAID_CARDS: Record<'monthly' | 'yearly', Card> = {
  monthly: {
    id: 'monthly',
    name: 'GymFlow Pro',
    tagline: 'Best for the whole gym, billed monthly',
    price: MONTHLY.price,
    unit: '/ month',
    cta: 'Get Monthly',
    features: [
      'Everything in Free and:',
      'Unlimited members',
      'Member app and workouts',
      'Reports and analytics',
      'WhatsApp reminders',
    ],
    highlight: true,
  },
  yearly: {
    id: 'yearly',
    name: 'GymFlow Pro',
    tagline: 'Best value, billed once a year',
    price: YEARLY.price,
    unit: '/ year',
    note: `${formatINR(perMonth(YEARLY))} / month`,
    badge: `Save ${savingPercent(YEARLY)}%`,
    cta: 'Get Yearly',
    features: [
      'Everything in Free and:',
      'Unlimited members, member app and WhatsApp reminders',
      `Save ${formatINR(MONTHLY.price * YEARLY.months - YEARLY.price)} compared with paying monthly`,
      'About 2 months free',
      'Pay once, covered for 12 months',
    ],
    highlight: true,
  },
};

export function Pricing() {
  const scope = useReveal<HTMLElement>({ stagger: 0.09 });
  const [term, setTerm] = useState<'monthly' | 'yearly'>('monthly');
  const cards = [FREE_CARD, PAID_CARDS[term]];

  return (
    <section
      id="pricing"
      ref={scope}
      aria-labelledby="pricing-title"
      className="has-dots px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        <div className="mx-auto flex max-w-[900px] flex-col items-center text-center">
          <span className="reveal eyebrow">Pricing</span>
          <h2 id="pricing-title" className="reveal display-2 mt-4 text-balance">
            {'Gym management software pricing: '}
            <span className="text-muted-foreground">start free, upgrade when you grow</span>
          </h2>
          <p className="reveal lead mt-5 max-w-[520px]">
            No setup fee and no modules to unlock later.{' '}
            <ShinyText text="Start with a 14-day free trial" speed={2.8} spread={120} /> — no credit
            card needed.
          </p>
        </div>

        {/* Billing-term switch. Not wrapped in `reveal`: the thumb's geometry is measured on
            mount, and an element caught mid-transform measures wrong. */}
        <div className="mt-8 flex justify-center">
          <RubberSegment
            aria-label="Billing term"
            value={term}
            onChange={next => setTerm(next as 'monthly' | 'yearly')}
            size="lg"
            radius={16}
            trackColor="var(--frame)"
            thumbColor="var(--foreground)"
            textColor="var(--muted-foreground)"
            activeTextColor="var(--background)"
            items={PLANS.map(plan => ({
              value: plan.id,
              label:
                plan.id === 'yearly' ? (
                  <span className="inline-flex items-center gap-2 font-semibold">
                    {plan.label}
                    <span className="rounded-pill bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">
                      Save {savingPercent(plan)}%
                    </span>
                  </span>
                ) : (
                  <span className="font-semibold">{plan.label}</span>
                ),
            }))}
          />
        </div>

        <div className="mx-auto mt-12 grid max-w-[860px] gap-4 md:grid-cols-2">
          {cards.map(card => (
            <div
              // Stable key for the paid slot: a key that changes with the term would
              // remount the card and its Counter, so the digits would jump, not roll.
              key={card.id === 'free' ? 'free' : 'paid'}
              className={`reveal flex flex-col p-6 ${card.highlight ? 'card-accent' : 'card'} ${
                card.id === 'free' ? 'relative ring-1 ring-inset ring-foreground/20' : ''
              }`}
            >
              {card.id === 'free' && <GlowBorder />}
              {card.id === 'free' && (
                <span className="absolute -top-3 left-6 rounded-pill bg-accent px-2.5 py-0.5 text-[11px] font-semibold uppercase tracking-wider text-accent-ink">
                  Free lifetime
                </span>
              )}
              {/* Fixed-height header so every price sits on the same line even when a
                  name or tagline wraps. */}
              <div className="min-h-[6.5rem]">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="display-3 !text-[28px]">{card.name}</h3>
                  {card.badge && card.id !== 'yearly' && (
                    <span className="shrink-0 rounded-pill bg-accent px-2 py-0.5 text-xs font-semibold text-accent-ink">
                      {card.badge}
                    </span>
                  )}
                </div>
                <p
                  className={`mt-2 text-[13.5px] ${
                    card.highlight ? 'text-accent-ink/80' : 'text-muted-foreground'
                  }`}
                >
                  {card.tagline}
                </p>
              </div>

              <div className="mt-2 flex items-end gap-1.5">
                {card.id === 'free' ? (
                  <span className="text-[44px] font-medium leading-none tracking-[-0.04em]">
                    {formatINR(card.price)}
                  </span>
                ) : (
                  <>
                    <span
                      className="font-medium leading-none tracking-[-0.04em] text-accent-ink"
                      style={{ fontSize: PRICE_FONT_SIZE }}
                    >
                      ₹
                    </span>
                    {/* Gradients are transparent: the default black fade would band the blue card. */}
                    <Counter
                      value={card.price}
                      places={placesFor(card.price)}
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
                  </>
                )}
                <span className="pb-1 text-[13px] opacity-70">{card.unit}</span>
              </div>
              <p className="mt-1 h-4 text-[12px] opacity-70">{card.note}</p>

              <a
                href={APP_URL}
                className={`btn btn-lg mt-5 w-full ${
                  card.highlight
                    ? 'border border-accent-ink bg-accent-ink text-accent hover:bg-accent-ink/90'
                    : 'border border-foreground/30 hover:border-foreground'
                }`}
              >
                {card.cta}
                <ArrowRight className="h-4 w-4" />
              </a>

              <ul className="mt-6 flex flex-col gap-2.5 border-t border-border-subtle pt-5">
                {card.features.map(item => (
                  <li key={item} className="flex items-start gap-2.5">
                    <Check className="mt-0.5 h-4 w-4 shrink-0" strokeWidth={2.5} />
                    <span className="text-[13.5px]">{item}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <p className="mt-6 text-center text-xs text-muted-foreground">
          No GST is added. The price you see is the price you pay. The free plan is capped at{' '}
          {FREE_MEMBER_LIMIT} members.
        </p>

        <div className="reveal card mx-auto mt-10 max-w-[1100px] p-6 md:p-8">
          <h3 className="display-3">Simple 3-step activation</h3>
          <p className="mt-3 text-[13.5px] leading-relaxed text-muted-foreground">
            Payments are verified manually, so there is no card on file and nothing charges you
            automatically.
          </p>
          <ol className="mt-6 grid gap-6 md:grid-cols-3">
            {ACTIVATION_STEPS.map((step, index) => {
              const Icon = step.icon;
              return (
                <li key={step.title} className="flex gap-4">
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-2xl border border-border-subtle bg-subtle">
                    <Icon className="h-4.5 w-4.5 text-accent-text" />
                  </span>
                  <span className="min-w-0">
                    <span className="block font-mono text-xs tracking-wider text-muted-foreground">
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
        </div>
      </div>
    </section>
  );
}
