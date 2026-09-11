import {
  ArrowRight,
  BadgeCheck,
  Check,
  CreditCard,
  ShieldCheck,
  Smartphone,
  Upload,
} from 'lucide-react';
import { useReveal } from '../lib/useReveal';

const APP_URL = 'https://app.gymflow.sbs';

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
    desc: 'Pay ₹3,000 using any UPI app, net banking, or card.',
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

  return (
    <section
      id="pricing"
      ref={scope}
      aria-labelledby="pricing-title"
      className="px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="mx-auto max-w-[640px] text-center">
          <span className="reveal eyebrow">Pricing</span>
          <h2 id="pricing-title" className="reveal display-2 mt-4 text-balance">
            One plan. <span className="text-muted-foreground">Everything included.</span>
          </h2>
          <p className="reveal lead mx-auto mt-5 max-w-[520px]">
            No per-member charges, no setup fee, and no modules to unlock later. Start with
            a 14-day free trial — no credit card needed.
          </p>
        </div>

        {/* ── Plan + activation ─────────────────────────────────────────── */}
        {/* Capped well inside the section's 1240px. The pair used to run the full
            width, which on a wide screen stretched a card holding one price and
            eight short lines across 1240px and left it looking mostly empty. */}
        <div className="mx-auto mt-12 grid max-w-[1040px] gap-4 lg:grid-cols-[1.1fr_1fr] lg:gap-5">
          {/* Plan card — filled accent, because this is the one thing on the page
              a visitor is meant to act on. */}
          <div className="reveal card-accent relative flex flex-col overflow-hidden p-6 md:p-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="inline-flex items-center gap-2 rounded-pill bg-accent-ink/10 px-3.5 py-1.5 font-mono text-[10.5px] font-medium uppercase tracking-wider text-accent-ink">
                GymFlow Pro
              </span>
              <span className="inline-flex items-center gap-1.5 rounded-pill bg-accent-ink px-3 py-1.5 text-[11px] font-medium text-accent">
                <Check className="h-3 w-3" strokeWidth={3} />
                All features
              </span>
            </div>

            <div className="mt-6 flex items-end gap-2">
              {/* Down from clamp(56px, 8vw, 88px). At 88px the price was taller than
                  the section heading above it and set the whole card's scale; the
                  figure still needs to dominate the card, not the page. */}
              <span
                className="font-medium leading-none tracking-[-0.04em] text-accent-ink"
                style={{ fontSize: 'clamp(42px, 5.5vw, 64px)' }}
              >
                ₹3,000
              </span>
              <span className="pb-1.5 text-[14px] text-accent-ink/80">/ month</span>
            </div>
            <p className="mt-3 text-[13px] text-accent-ink/80">
              Unlimited members. Unlimited WhatsApp messages. Every module, on every
              account.
            </p>

            <div className="my-6 h-px bg-accent-ink/15" />

            <ul className="grid gap-x-6 gap-y-2.5 sm:grid-cols-2">
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
            <div className="mt-auto flex flex-col gap-3 pt-7 sm:flex-row">
              <a
                href={APP_URL}
                className="btn btn-lg flex-1 border border-accent-ink bg-accent-ink text-accent hover:bg-accent-ink/90"
              >
                Start free trial
                <ArrowRight className="h-4 w-4" />
              </a>
              <a
                href={APP_URL}
                className="btn btn-lg flex-1 border border-accent-ink/25 bg-transparent text-accent-ink hover:bg-accent-ink/10"
              >
                Pay ₹3,000 now
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
          <div className="reveal card flex flex-col p-6 md:p-8">
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
