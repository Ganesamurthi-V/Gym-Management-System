import type { ReactNode } from 'react';
import {
  BarChart3,
  Check,
  CheckCircle2,
  CreditCard,
  FileUp,
  LayoutDashboard,
  MapPin,
  Search,
  TrendingUp,
  Users,
} from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import BorderGlow from './BorderGlow';

/* Illustrative figures for the mock interfaces below — they demonstrate the
   layout, they are not claims about any particular gym. */
const DASHBOARD_STATS = [
  { label: 'Active members', value: '248', delta: '+12 this month' },
  { label: "Today's collection", value: '₹12,400', delta: '9 payments' },
  { label: 'Expiring in 7 days', value: '9', delta: 'Reminders queued' },
  { label: 'Outstanding dues', value: '₹18,600', delta: 'Across 14 members' },
] as const;

const EXPIRING_ROWS = [
  { initials: 'VD', name: 'Vignesh D.', plan: 'Monthly', due: 'Today' },
  { initials: 'NV', name: 'Naveen V.', plan: 'Quarterly', due: '3 days' },
] as const;

const ATTENDANCE_ROWS = [
  { name: 'Karthik R.', time: '6:12 AM' },
  { name: 'Divya M.', time: '6:40 AM' },
  { name: 'Suresh K.', time: '7:05 AM' },
] as const;

const MEMBER_ROWS = [
  { initials: 'AR', name: 'Arun R.', plan: 'Quarterly', status: 'Active' },
  { initials: 'PS', name: 'Priya S.', plan: 'Monthly', status: 'Expiring' },
  { initials: 'VK', name: 'Vijay K.', plan: 'Annual', status: 'Active' },
] as const;

const IMPORT_COLUMNS = [
  { source: 'Name', mapped: 'Full name' },
  { source: 'Mobile', mapped: 'Phone' },
  { source: 'Locality', mapped: 'Area' },
  { source: 'Fee paid', mapped: 'Payment' },
] as const;

/** Relative bar heights for the revenue chart mock. */
const REVENUE_BARS = [42, 58, 51, 70, 64, 86] as const;

export function BentoFeatures() {
  const scope = useReveal<HTMLElement>({ stagger: 0.07 });

  return (
    <section
      id="features"
      ref={scope}
      /* contain-visible: the BorderGlow halo paints up to 40px outside each card,
         and the default `contain: paint` on section would clip it flat. */
      className="contain-visible px-5 py-24 md:px-8 md:py-28"
    >
      <div className="mx-auto max-w-[1240px]">
        {/* ── Header ────────────────────────────────────────────────────── */}
        <div className="flex flex-col gap-6 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[640px]">
            <span className="reveal eyebrow">Core modules</span>
            <h2 className="reveal display-2 mt-4 text-balance">
              Everything your gym needs,
              <br />
              <span className="text-muted-foreground">nothing it doesn&apos;t.</span>
            </h2>
          </div>
          <p className="reveal max-w-[330px] text-sm leading-relaxed text-muted-foreground lg:text-right">
            Built specifically for the workflows of independent gyms in Tamil Nadu and
            Puducherry.
          </p>
        </div>

        {/* ── Bento grid ────────────────────────────────────────────────── */}
        <div className="mt-14 grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          {/* Dashboard — wide */}
          <BentoCard
            className="lg:col-span-2"
            icon={LayoutDashboard}
            title="Dashboard & live stats"
            desc="Active members, today's collection, memberships expiring soon and total dues — the whole picture on one screen."
          >
            <div className="flex flex-1 flex-col gap-2.5">
              <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
                {DASHBOARD_STATS.map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-border-subtle bg-subtle p-3.5"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </p>
                    <p className="mt-2 text-[22px] font-medium leading-none tracking-tight text-foreground">
                      {stat.value}
                    </p>
                    <p className="mt-2 text-[11px] text-muted-foreground">{stat.delta}</p>
                  </div>
                ))}
              </div>

              {/* Expiring strip — mirrors the real dashboard and fills the card
                  with useful content rather than empty space. */}
              <div className="flex flex-1 flex-col rounded-2xl border border-border-subtle bg-subtle p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Expiring this week
                </p>
                <ul className="mt-3 flex flex-1 flex-col justify-center gap-2">
                  {EXPIRING_ROWS.map(row => (
                    <li key={row.name} className="flex items-center gap-3">
                      <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[10px] font-medium text-accent-ink dark:text-accent">
                        {row.initials}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-[13px] font-medium text-foreground">
                          {row.name}
                        </span>
                        <span className="block text-[11px] text-muted-foreground">
                          {row.plan}
                        </span>
                      </span>
                      <span className="shrink-0 font-mono text-[11px] text-muted-foreground">
                        {row.due}
                      </span>
                      <span className="shrink-0 rounded-pill bg-accent-soft px-2.5 py-1 text-[11px] font-medium text-accent-ink dark:text-accent">
                        Remind
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </BentoCard>

          {/* Attendance — the one fully lime block, so the accent lands once and
              reads as intentional */}
          <article className="reveal card-lime flex flex-col p-7">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-ink/10">
              <CheckCircle2 className="h-5 w-5 text-accent-ink" />
            </span>
            <h3 className="mt-5 text-[17px] font-medium tracking-tight text-accent-ink">
              One-tap attendance
            </h3>
            <p className="mt-2 text-[13.5px] leading-relaxed text-accent-ink/70">
              Mark today in a single tap and pull up any member&apos;s history whenever
              you need it.
            </p>

            <div className="mt-6 flex flex-1 flex-col justify-center gap-2">
              {ATTENDANCE_ROWS.map(row => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-xl bg-accent-ink/10 px-3.5 py-2.5"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-accent-ink">
                      <Check className="h-3 w-3 text-accent" strokeWidth={3} />
                    </span>
                    <span className="text-[13px] font-medium text-accent-ink">
                      {row.name}
                    </span>
                  </span>
                  {/* /75 rather than /60 — dark ink on lime at 60% lands just
                      under AA for 11px text. */}
                  <span className="font-mono text-[11px] text-accent-ink/75">
                    {row.time}
                  </span>
                </div>
              ))}
            </div>

            <p className="mt-auto pt-5 font-mono text-[11px] uppercase tracking-wider text-accent-ink/75">
              32 present today
            </p>
          </article>

          {/* Members */}
          <BentoCard
            icon={Users}
            title="Member management"
            desc="Add, edit, search and organise member details with tools built for speed."
          >
            <div className="flex flex-1 flex-col justify-center gap-2">
              {MEMBER_ROWS.map(row => (
                <div
                  key={row.name}
                  className="flex items-center gap-3 rounded-xl border border-border-subtle bg-subtle px-3 py-2.5"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[10px] font-medium text-accent-ink dark:text-accent">
                    {row.initials}
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[13px] font-medium text-foreground">
                      {row.name}
                    </span>
                    <span className="block text-[11px] text-muted-foreground">
                      {row.plan}
                    </span>
                  </span>
                  <span
                    className={`shrink-0 rounded-pill px-2 py-0.5 font-mono text-[10px] uppercase ${
                      row.status === 'Active'
                        ? 'bg-accent-soft text-accent-ink dark:text-accent'
                        : 'bg-subtle text-muted-foreground ring-1 ring-border-strong'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Payments */}
          <BentoCard
            icon={CreditCard}
            title="Payments & dues"
            desc="Record cash, UPI or card payments, see what's pending, and nudge members on WhatsApp."
          >
            <div className="flex flex-1 flex-col justify-between rounded-2xl border border-border-subtle bg-subtle p-4">
              <div className="flex items-baseline justify-between">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Pending dues
                </p>
                <p className="text-[19px] font-medium tracking-tight text-foreground">
                  ₹18,600
                </p>
              </div>
              <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-border-subtle">
                {/* 68% collected — illustrative */}
                <div className="h-full w-[68%] rounded-pill bg-accent" />
              </div>
              <div className="mt-3 flex items-center justify-between text-[11px] text-muted-foreground">
                <span>68% collected</span>
                <span className="rounded-pill bg-accent-soft px-2 py-0.5 font-medium text-accent-ink dark:text-accent">
                  14 reminders sent
                </span>
              </div>
            </div>
          </BentoCard>

          {/* Area detection */}
          <BentoCard
            icon={MapPin}
            title="Smart area detection"
            desc="Area names get suggested and matched as you type, so your records stay consistent."
          >
            <div className="flex flex-1 flex-col rounded-2xl border border-border-subtle bg-subtle p-4">
              <div className="flex items-center gap-2 rounded-pill border border-border-subtle bg-frame px-3 py-2">
                <Search className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                <span className="font-mono text-[12px] text-muted-foreground">
                  villianu
                  <span className="animate-pulse-dot ml-px inline-block h-3.5 w-px translate-y-0.5 bg-foreground align-middle" />
                </span>
              </div>
              <ul className="mt-2.5 space-y-1">
                {['Villianur, Puducherry', 'Villupuram, Tamil Nadu'].map((area, i) => (
                  <li
                    key={area}
                    className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-[12px] ${
                      i === 0
                        ? 'bg-accent-soft font-medium text-accent-ink dark:text-accent'
                        : 'text-muted-foreground'
                    }`}
                  >
                    <MapPin className="h-3 w-3 shrink-0" />
                    {area}
                  </li>
                ))}
              </ul>
            </div>
          </BentoCard>

          {/* Import — wide */}
          <BentoCard
            className="lg:col-span-2"
            icon={FileUp}
            title="Bulk CSV & Excel import"
            desc="Upload the sheet you already keep. GymFlow detects the columns, normalises area names, and flags anything worth a second look."
          >
            <div className="grid flex-1 gap-2.5 sm:grid-cols-2">
              <div className="rounded-2xl border border-border-subtle bg-subtle p-4">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Detected columns
                </p>
                <ul className="mt-3 space-y-1.5">
                  {IMPORT_COLUMNS.map(col => (
                    <li key={col.source} className="flex items-center gap-2 text-[12px]">
                      <span className="font-mono text-muted-foreground">{col.source}</span>
                      <span aria-hidden className="text-muted-foreground">
                        →
                      </span>
                      <span className="font-medium text-foreground">{col.mapped}</span>
                      <Check className="ml-auto h-3.5 w-3.5 text-accent" strokeWidth={3} />
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex flex-col justify-center rounded-2xl border border-border-subtle bg-subtle p-4">
                <p className="text-[13px] font-medium text-foreground">
                  312 members imported
                </p>
                <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-border-subtle">
                  <div className="h-full w-full rounded-pill bg-accent" />
                </div>
                <p className="mt-3 text-[11px] text-muted-foreground">
                  4 rows flagged for review · 0 duplicates created
                </p>
              </div>
            </div>
          </BentoCard>

          {/* Reports */}
          <BentoCard
            icon={BarChart3}
            title="Reports & analytics"
            desc="Monthly revenue, plan mix and area spread — exportable as PDF whenever you need it."
          >
            <div className="flex flex-1 flex-col justify-between rounded-2xl border border-border-subtle bg-subtle p-4">
              <div className="flex items-center justify-between">
                <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                  Revenue, last 6 months
                </p>
                <span className="flex items-center gap-1 text-[11px] font-medium text-accent-ink dark:text-accent">
                  <TrendingUp className="h-3 w-3" />
                  +18%
                </span>
              </div>
              <div
                className="mt-4 flex h-20 items-end gap-1.5"
                role="img"
                aria-label="Bar chart showing monthly revenue trending upward over the last six months."
              >
                {REVENUE_BARS.map((height, i) => (
                  <div
                    key={i}
                    className={`flex-1 rounded-t-md ${
                      i === REVENUE_BARS.length - 1 ? 'bg-accent' : 'bg-border-strong'
                    }`}
                    style={{ height: `${height}%` }}
                  />
                ))}
              </div>
            </div>
          </BentoCard>
        </div>
      </div>
    </section>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

interface BentoCardProps {
  icon: typeof Users;
  title: string;
  desc: string;
  children: ReactNode;
  className?: string;
}

function BentoCard({ icon: Icon, title, desc, children, className = '' }: BentoCardProps) {
  return (
    /* `reveal` sits on a wrapper rather than on the card itself: the GSAP tween
       writes an inline transform and does not clear it on completion, which would
       outrank .glow-card's own transform and kill both the hover lift and the
       layer promotion. The wrapper is the grid item, so it carries the column
       span; `grid` makes its single child stretch to the full row height. */
    <div className={`reveal grid ${className}`}>
      <BorderGlow as="article" contentClassName="p-7">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-accent-soft">
          <Icon className="h-5 w-5 text-accent-ink dark:text-accent" />
        </span>
        <h3 className="mt-5 text-[17px] font-medium tracking-tight text-foreground">
          {title}
        </h3>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{desc}</p>
        {/* The mock area grows to fill whatever height the grid row gives this
            card, so a short mock never leaves a gap in the middle of the card.
            Each mock opts into stretching via flex-1 on its own root. */}
        <div className="mt-6 flex flex-1 flex-col">{children}</div>
      </BorderGlow>
    </div>
  );
}
