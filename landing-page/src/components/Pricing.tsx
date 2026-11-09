import { Check } from 'lucide-react';
import { useState } from 'react';
import { Section } from './layout/Section';
import {
  FREE_MEMBER_LIMIT,
  PLANS,
  WHATSAPP_ADDON_PRICE,
  formatINR,
  perMonth,
  savingPercent,
} from '../data/plans';

const APP_URL = 'https://app.gymflow.sbs';

const [MONTHLY, YEARLY] = PLANS;

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
  unit: '/ forever',
  cta: 'Start free',
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
    cta: 'Start free trial',
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
    cta: 'Start free trial',
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
    <Section id="pricing" labelledBy="pricing-title" tone="chalk">
      <div className="sec-head flex flex-col items-center gap-6">
        <h2 id="pricing-title" className="h2" style={{ maxWidth: '22ch' }}>
          Simple pricing, free forever up to 50 members
        </h2>
        <div role="group" aria-label="Billing term" className="seg">
          {PLANS.map(plan => (
            <button key={plan.id} type="button" aria-pressed={term === plan.id} onClick={() => setTerm(plan.id)}>
              {plan.label}
              {plan.id === 'yearly' && <span className="ml-2 text-[14px] opacity-80">Save {savingPercent(plan)}%</span>}
            </button>
          ))}
        </div>
      </div>

      <div className="plans">
        {cards.map(card => (
          <div key={card.id} className={`panel plan ${card.highlight ? 'plan--pro' : ''}`}>
            <h3 className="h3">{card.name}</h3>
            <p className="mt-1 text-[16px] text-muted-foreground">{card.tagline}</p>
            <div className="plan__price">
              <span>{formatINR(card.price)}</span>
              <small>{card.unit}</small>
            </div>
            <p className="mt-2 min-h-6 text-[16px] text-muted-foreground">{card.note}</p>
            <a href={APP_URL} className={`btn mt-4 w-full ${card.highlight ? 'btn-primary' : 'btn-outline'}`}>
              {card.cta}
            </a>
            <ul className="plan__list">
              {card.features.map(item => (
                <li key={item}>
                  <Check aria-hidden className="mt-[3px] size-4 shrink-0 text-accent-text" strokeWidth={2.5} />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <p className="mt-8 text-center text-[16px] text-muted-foreground">
        No GST is added. The price you see is the price you pay. On the free plan, WhatsApp reminders are{' '}
        {formatINR(WHATSAPP_ADDON_PRICE)} a month.
      </p>
    </Section>
  );
}
