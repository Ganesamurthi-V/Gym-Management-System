import { Check } from 'lucide-react';
import { useState } from 'react';
import RubberSegment from './ui/RubberSegment';
import Counter from './ui/Counter';
import { Magnet, Rise, SpotlightSurface } from './fx';
import { Section } from './layout/Section';
import {
  FREE_MEMBER_LIMIT,
  PLANS,
  formatINR,
  perMonth,
  savingPercent,
} from '../data/plans';
import '../styles/pricing.css';

const APP_URL = 'https://app.gymflow.sbs';

const [MONTHLY, YEARLY] = PLANS;

/* Counter (rolling-digit) sizing, shared by the rupee glyph and the odometer so they
   stay the same height. Fixed px because Counter measures its strip height from a number. */
const PRICE_FONT_SIZE = 80;

/* Counter renders one slot per entry in `places` and never hides a leading zero, so
   the slots are sized to the current value's digit count (₹999 -> 3, ₹9 -> 1). */
function placesFor(value: number): number[] {
  const digits = Math.max(1, Math.floor(Math.log10(Math.max(1, value))) + 1);
  return Array.from({ length: digits }, (_, i) => 10 ** (digits - 1 - i));
}

/* A price from 1,000 up is two odometers around a comma (9 , 999), so the display matches
   formatINR (₹9,999). Both odometers stay mounted across the switch so the digits roll. */
function Price({ value }: { value: number }) {
  const thousands = Math.floor(value / 1000);
  const rest = thousands > 0 ? value % 1000 : value;
  const common = {
    fontSize: PRICE_FONT_SIZE,
    padding: 8,
    gap: 0,
    horizontalPadding: 0,
    fontWeight: 600,
    counterStyle: { letterSpacing: '0.004em' },
  } as const;
  return (
    <span className="inline-flex items-end font-display">
      {thousands > 0 && (
        <>
          <Counter value={thousands} places={placesFor(thousands)} {...common} />
          <span className="pb-2 leading-none" style={{ fontSize: PRICE_FONT_SIZE / 2 }}>
            ,
          </span>
        </>
      )}
      <Counter value={rest} places={thousands > 0 ? [100, 10, 1] : placesFor(value)} {...common} />
    </span>
  );
}

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
  const [term, setTerm] = useState<'monthly' | 'yearly'>('monthly');
  const cards = [FREE_CARD, PAID_CARDS[term]];

  return (
    <Section id="pricing" labelledBy="pricing-title" tone="paper">
      <h2 id="pricing-title" className="display-2 mx-auto max-w-[20ch] min-w-0 text-balance text-center [overflow-wrap:break-word]">
        Simple pricing, free up to 50 members
      </h2>

      <div className="mt-10 flex justify-center">
        <RubberSegment
          aria-label="Billing term"
          value={term}
          onChange={next => setTerm(next as 'monthly' | 'yearly')}
          size="lg"
          radius={12}
          inset={4}
          trackColor="var(--key-face)"
          items={PLANS.map(plan => ({
            value: plan.id,
            label:
              plan.id === 'yearly' ? (
                <span className="inline-flex items-center gap-2 font-medium">
                  {plan.label}
                  <span className="rounded-md bg-accent-soft px-2 py-0.5 text-sm font-medium text-accent-text">
                    Save {savingPercent(plan)}%
                  </span>
                </span>
              ) : (
                <span className="font-medium">{plan.label}</span>
              ),
          }))}
        />
      </div>

      <div className="mx-auto mt-12 grid max-w-[1040px] items-stretch gap-6 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)] lg:gap-8">
        {cards.map(card => {
          const isFree = card.id === 'free';
          const panel = (
            <div className={`flex h-full flex-col ${isFree ? 'plan-free plastic' : 'plan-pro plastic'}`}>
              <div className={isFree ? 'plan-head' : 'plan-head plan-head--pro'}>
                <h3 className="display-3">{card.name}</h3>
                <p key={isFree ? 'free' : term} className="plan-swap mt-1 text-base text-muted-foreground">
                  {card.tagline}
                </p>
              </div>

              <div className="plan-body flex flex-1 flex-col">
                <div className="flex items-end gap-2 font-display">
                  {isFree ? (
                    <span className="figure-xl" style={{ fontSize: PRICE_FONT_SIZE }}>{formatINR(card.price)}</span>
                  ) : (
                    // Stable key for the paid slot: a key that changes with the term would
                    // remount the panel and its Counter, so the digits would jump, not roll.
                    <span className="flex items-end figure-xl">
                      <span className="plan-rupee pb-1 leading-none" style={{ fontSize: PRICE_FONT_SIZE }}>
                        ₹
                      </span>
                      <Price value={card.price} />
                    </span>
                  )}
                  <span className="pb-2 font-sans text-base font-medium text-muted-foreground">{card.unit}</span>
                </div>
                <p key={isFree ? 'free-note' : term} className="plan-swap mt-1 min-h-6 text-base text-muted-foreground">
                  {card.note}
                </p>

                {isFree ? (
                  <a href={APP_URL} className="btn btn-outline btn-lg mt-6 w-full">
                    {card.cta}
                  </a>
                ) : (
                  <Magnet className="mt-6">
                    <a href={APP_URL} className="btn btn-primary btn-lg w-full">
                      {card.cta}
                    </a>
                  </Magnet>
                )}

                <ul className="mt-8">
                  {card.features.map(item => (
                    <li key={item} className="plan-row">
                      <Check className="plan-check h-4 w-4" strokeWidth={2.5} aria-hidden />
                      <span className="text-base">{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          );
          return isFree ? (
            <Rise key="free">{panel}</Rise>
          ) : (
            <Rise key="paid" delay={0.08}>
              <SpotlightSurface className="plan-pro-wrap h-full">{panel}</SpotlightSurface>
            </Rise>
          );
        })}
      </div>

      <p className="mx-auto mt-8 max-w-[1040px] text-base text-muted-foreground">
        No GST is added. The price you see is the price you pay. The free plan is capped at{' '}
        {FREE_MEMBER_LIMIT} members.
      </p>
    </Section>
  );
}
