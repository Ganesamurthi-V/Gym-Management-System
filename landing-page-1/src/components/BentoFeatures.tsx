import type { ReactNode } from 'react';
import { Check, CheckCircle2, CreditCard, LayoutDashboard, Users } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import BorderGlow from './BorderGlow';
import { MemberAppCard } from './MemberAppCard';

/* Illustrative figures for the mock interfaces below — they demonstrate the
   layout, they are not claims about any particular gym. */
const DASHBOARD_STATS = [
  { label: 'Active members', value: '248', delta: '+12 this month' },
  { label: "Today's collection", value: '₹12,400', delta: '9 payments' },
  { label: 'Expiring in 7 days', value: '9', delta: 'Reminders queued' },
  { label: 'Outstanding dues', value: '₹18,600', delta: 'Across 14 members' },
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

export function BentoFeatures() {
  const scope = useReveal<HTMLElement>({ stagger: 0.07 });

  return (
    <section
      id="features"
      ref={scope}
      /* contain-visible: the BorderGlow halo paints up to 40px outside each card,
         and the default `contain: paint` on section would clip it flat.

         min-h-screen rather than h-screen, paired with a flex-1 grid: on a tall
         viewport the grid stretches so the section fills exactly one screen, and
         on a short one the section grows instead of squeezing the cards into an
         overflow. */
      className="contain-visible px-5 py-14 md:px-8 md:py-16 lg:flex lg:min-h-screen lg:flex-col lg:py-9"
    >
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col">
        {/* ── Header ────────────────────────────────────────────────────── */}
        {/* display-3 rather than display-2, and tighter margins: the section is
            budgeted to one viewport, and at display-2 the header alone took 234px
            of that. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[560px]">
            <span className="reveal eyebrow">Core modules</span>
            <h2 className="reveal display-3 mt-3 text-balance">
              Everything your gym needs,
              <br />
              <span className="text-muted-foreground">nothing it doesn&apos;t.</span>
            </h2>
          </div>
          <p className="reveal max-w-[330px] text-sm leading-relaxed text-muted-foreground lg:text-right">
            Built specifically for the workflows of independent gyms across India.
          </p>
        </div>

        {/* ── Bento grid ──────────────────────────────────────────────────
            Four columns at lg, the first slightly wider to hold the phone. The
            member app card spans both rows there, so the eight cells are filled
            by five cards: phone (2) + dashboard (2) + attendance + members +
            payments (2). The implicit rows are auto-sized, which means
            align-content stretches them to fill a tall grid but never shrinks one
            below its content. */}
        <div className="mt-8 grid flex-1 grid-cols-1 gap-4 md:grid-cols-2 lg:mt-6 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          {/* Member app — first, and the full height of the grid from md up */}
          <MemberAppCard />

          {/* Dashboard — two columns wide at lg, where its stat row sits four
              across. Below that it is a single column and the stats fall to 2x2. */}
          <BentoCard
            className="lg:col-span-2"
            icon={LayoutDashboard}
            title="Dashboard & live stats"
            desc="Active members, today's collection, memberships expiring soon and total dues — the whole picture on one screen."
          >
            <div className="flex flex-1 flex-col justify-center gap-2.5">
              {/* lg, not sm: `sm:` keys off the viewport rather than the card, so
                  four across in a single md column gave each tile ~62px and values
                  like ₹12,400 overflowed. */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
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

            </div>
          </BentoCard>

          {/* Attendance — the one fully filled block in this row, so the accent
              lands once and reads as intentional */}
          <article className="reveal card-accent flex flex-col p-6">
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-ink" />
              <h3 className="text-[16px] font-medium tracking-tight text-accent-ink">
                One-tap attendance
              </h3>
            </div>
            <p className="mt-2 text-[13.5px] leading-relaxed text-accent-ink/80">
              Mark today in a tap. Pull up any member&apos;s history.
            </p>

            <div className="mt-5 flex flex-1 flex-col justify-center gap-2">
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
                  {/* /90, not the /80 used elsewhere on this card: the row's own
                      bg-accent-ink/10 lifts the surface to rgb(52,96,220), and
                      that costs enough contrast to put /80 at 4.09:1, under AA. */}
                  <span className="font-mono text-[11px] text-accent-ink/90">
                    {row.time}
                  </span>
                </div>
              ))}
            </div>

          </article>

          {/* Members — two columns at lg. The span sits here rather than on
              Payments because these rows absorb the extra width like a table,
              where the Payments panel is one thin progress bar that reads as
              sparse when stretched. */}
          <BentoCard
            className="lg:col-span-2"
            icon={Users}
            title="Member management"
            desc="Add, edit and search member details in seconds."
          >
            <div className="flex flex-1 flex-col justify-center gap-2">
              {MEMBER_ROWS.map(row => (
                <div
                  key={row.name}
                  className="flex items-center gap-3 rounded-xl border border-border-subtle bg-subtle px-3 py-2.5"
                >
                  <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-accent-soft font-mono text-[10px] font-medium text-accent-text">
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
                        ? 'bg-accent-soft text-accent-text'
                        : 'bg-subtle text-muted-foreground ring-1 ring-border-strong'
                    }`}
                  >
                    {row.status}
                  </span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Payments — fills the last cell of the second row */}
          <BentoCard
            icon={CreditCard}
            title="Payments & dues"
            desc="Record cash, UPI or card payments, see what's pending, and nudge members on WhatsApp."
          >
            {/* The member app card sets a tall row. Rather than stretch the panel
                to fill it — which either spreads the three items to the far edges
                or leaves a large empty bordered box — the panel keeps its natural
                height and is centred, the same way the member rows above are. */}
            <div className="flex flex-1 flex-col justify-center">
              <div className="rounded-2xl border border-border-subtle bg-subtle p-4">
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
                  <span className="rounded-pill bg-accent-soft px-2 py-0.5 font-medium text-accent-text">
                    14 reminders sent
                  </span>
                </div>
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
      <BorderGlow as="article" contentClassName="p-6">
        {/* Icon sits inline with the title rather than in a 40px chip above it.
            The chip and its margin cost 60px of card height, which the
            one-viewport budget cannot spare, and the icon reads the same here. */}
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-accent-text" />
          <h3 className="text-[16px] font-medium tracking-tight text-foreground">
            {title}
          </h3>
        </div>
        <p className="mt-2 text-[13.5px] leading-relaxed text-muted-foreground">{desc}</p>
        {/* The mock area grows to fill whatever height the grid row gives this
            card, so a short mock never leaves a gap in the middle of the card.
            Each mock opts into stretching via flex-1 on its own root. */}
        <div className="mt-5 flex flex-1 flex-col">{children}</div>
      </BorderGlow>
    </div>
  );
}
