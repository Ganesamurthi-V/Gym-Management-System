import type { ReactNode } from 'react';
import { BellRing, Check, Wallet } from 'lucide-react';
import { ACCENT_GLOW } from '../lib/borderGlowPresets';
import { useReveal } from '../lib/useReveal';
import BorderGlow from './BorderGlow';
import { MemberAppCard } from './MemberAppCard';

/* Illustrative figures for the mock interfaces below — they demonstrate the
   layout, they are not claims about any particular gym.

   Four cards, one idea each: a big heading, one line, and a single visual. This
   used to be five cards that each carried a title, a subtitle and a small fake UI
   with a dozen rows, labels and chips — about forty things to read at once. The
   blue phone card and the blue payments card sit on opposite corners, so the
   accent alternates across the grid instead of two saturated blocks sitting
   together. Member management is folded into the dashboard line rather than
   getting a card of its own. */
const STATS = [
  { label: 'Active members', value: '248' },
  { label: "Today's collection", value: '₹12,400' },
] as const;

const ATTENDANCE_ROWS = [
  { name: 'Ganesh V.', time: '6:12 AM' },
  { name: 'Divya M.', time: '6:40 AM' },
] as const;

export function BentoFeatures() {
  const scope = useReveal<HTMLElement>({ perElement: true, y: 36, duration: 0.8, start: 'top 88%' });

  return (
    <section
      id="features"
      ref={scope}
      aria-labelledby="features-title"
      /* contain-visible: the BorderGlow halo paints up to 40px outside each card,
         and the default `contain: paint` on section would clip it flat. */
      className="has-dots contain-visible px-5 py-10 md:px-8 md:py-14"
    >
      <div className="mx-auto w-full max-w-[1200px]">
        <div className="mx-auto flex max-w-[900px] flex-col items-center text-center">
          <span className="reveal eyebrow">Core modules</span>
          <h2 id="features-title" className="reveal display-2 mt-4 text-balance">
            Everything your gym needs,
            <br />
            <span className="text-muted-foreground">nothing it doesn&apos;t.</span>
          </h2>
          <p className="reveal lead mt-5 max-w-[560px]">
            Members, payments, attendance and WhatsApp reminders in one place, with a member app
            included.
          </p>
        </div>

        {/* Three columns at lg: the phone card takes the first and both rows, the
            dashboard takes the other two on top, and attendance and payments share
            the bottom row. At md the phone still spans both rows beside a single
            column, and payments goes full width so the last row has no hole. */}
        <div className="mt-6 grid grid-cols-1 gap-3 md:grid-cols-2 lg:mt-8 lg:grid-cols-[1.3fr_1fr_1fr]">
          <MemberAppCard />

          <Card
            className="lg:col-span-2 lg:min-h-[300px]"
            title="Live dashboard"
            desc="Members, collections and dues on one screen."
          >
            <div className="mt-4 grid grid-cols-2 gap-3 lg:mt-auto">
              {STATS.map(stat => (
                <div key={stat.label} className="rounded-2xl border border-border-subtle bg-subtle p-4">
                  <p className="text-[13px] text-muted-foreground">{stat.label}</p>
                  <p className="mt-1.5 text-[24px] font-medium leading-none tracking-tight text-foreground tabular-nums md:text-[28px]">
                    {stat.value}
                  </p>
                </div>
              ))}
            </div>
          </Card>

          <Card className="lg:min-h-[320px]" title="One-tap attendance" desc="Mark today in a tap.">
            <div className="mt-4 flex flex-col gap-2 lg:mt-auto">
              {ATTENDANCE_ROWS.map(row => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-2xl border border-border-subtle bg-subtle px-4 py-2.5"
                >
                  <span className="flex items-center gap-3">
                    <span className="grid h-6 w-6 place-items-center rounded-full bg-accent">
                      <Check className="h-3.5 w-3.5 text-accent-ink" strokeWidth={3} />
                    </span>
                    <span className="text-[15px] font-medium text-foreground">{row.name}</span>
                  </span>
                  <span className="font-mono text-[12px] text-muted-foreground">{row.time}</span>
                </div>
              ))}
            </div>
          </Card>

          {/* Accent card, same treatment as the phone card: the heading and line in
              accent-ink, and the visual as translucent pills rather than a second
              set of bordered rows. */}
          <div className="reveal grid md:col-span-2 lg:col-span-1 lg:min-h-[320px]">
            <BorderGlow as="article" className="glow-card-accent" contentClassName="p-5 md:p-6" {...ACCENT_GLOW}>
              <h3 className="text-[22px] font-medium leading-[1.1] tracking-tight text-accent-ink md:text-[24px]">
                Payments &amp; dues
              </h3>
              <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-accent-ink/80">
                Cash, UPI or card. Reminders sent for you.
              </p>
              <div className="mt-4 flex flex-col gap-2 lg:mt-auto">
                <Pill icon={<Wallet className="h-4 w-4" />} text="₹18,600 pending" />
                <Pill icon={<BellRing className="h-4 w-4" />} text="14 reminders sent" />
              </div>
            </BorderGlow>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

function Pill({ icon, text }: { icon: ReactNode; text: string }) {
  return (
    <div className="flex items-center gap-3 rounded-2xl bg-accent-ink/15 px-4 py-2.5 text-accent-ink">
      {icon}
      <span className="text-[16px] font-medium">{text}</span>
    </div>
  );
}

function Card({
  title,
  desc,
  children,
  className = '',
}: {
  title: string;
  desc: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    /* `reveal` sits on a wrapper rather than on the card itself: the GSAP tween
       writes an inline transform and does not clear it on completion, which would
       outrank .glow-card's own transform and kill both the hover lift and the
       layer promotion. The wrapper is the grid item, so it carries the column
       span; `grid` makes its single child stretch to the full row height. */
    <div className={`reveal grid ${className}`}>
      {/* fillOpacity 0: only the rim lights on hover. */}
      <BorderGlow as="article" contentClassName="p-5 md:p-6" fillOpacity={0}>
        <h3 className="text-[22px] font-medium leading-[1.1] tracking-tight text-foreground md:text-[24px]">{title}</h3>
        <p className="mt-2 max-w-[320px] text-[14px] leading-relaxed text-muted-foreground">{desc}</p>
        {children}
      </BorderGlow>
    </div>
  );
}
