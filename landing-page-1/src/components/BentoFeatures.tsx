import type { ReactNode } from 'react';
import { Check, CheckCircle2, CreditCard, LayoutDashboard, Users } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import BorderGlow from './BorderGlow';
import { MemberAppCard } from './MemberAppCard';

/* Illustrative figures for the mock interfaces below — they demonstrate the
   layout, they are not claims about any particular gym.
 
   Label and value only. Each tile used to carry a third line ("+12 this month",
   "Reminders queued"), which put twelve pieces of text in one row of four tiles
   and made this the densest thing on the page for the least return — a couple of
   them were not even deltas, just restated notes. */
const DASHBOARD_STATS = [
  { label: 'Active members', value: '248' },
  { label: "Today's collection", value: '₹12,400' },
  { label: 'Expiring in 7 days', value: '9' },
  { label: 'Outstanding dues', value: '₹18,600' },
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
  { initials: 'DM', name: 'Divya M.', plan: 'Monthly', status: 'Active' },
] as const;

const PAYMENT_ROWS = [
  { name: 'Arun R.', mode: 'UPI', amount: '₹5,000' },
  { name: 'Priya S.', mode: 'Cash', amount: '₹1,500' },
  { name: 'Vijay K.', mode: 'UPI', amount: '₹9,500' },
] as const;

export function BentoFeatures() {
  const scope = useReveal<HTMLElement>({ stagger: 0.07 });

  return (
    <section
      id="features"
      ref={scope}
      aria-labelledby="features-title"
      /* contain-visible: the BorderGlow halo paints up to 40px outside each card,
         and the default `contain: paint` on section would clip it flat.

         min-h-screen rather than h-screen, paired with a flex-1 grid: on a tall
         viewport the grid stretches so the section fills exactly one screen, and
         on a short one the section grows instead of squeezing the cards into an
         overflow. */
      className="has-dots contain-visible px-5 py-14 md:px-8 md:py-16 lg:flex lg:min-h-screen lg:flex-col lg:py-9"
    >
      {/* justify-center pairs with the de-stretched grid: the section still holds
          a full screen, but the header+grid group sits centred in it rather than
          pinned to the top with dead space underneath. */}
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col lg:justify-center">
        {/* ── Header ────────────────────────────────────────────────────── */}
        {/* display-3 rather than display-2, and tighter margins: the section is
            budgeted to one viewport, and at display-2 the header alone took 234px
            of that. */}
        <div>
          <div className="max-w-[560px]">
            <span className="reveal eyebrow">Core modules</span>
            <h2 id="features-title" className="reveal display-3 mt-3 text-balance">
              Everything your gym needs,
              <br />
              <span className="text-muted-foreground">nothing it doesn&apos;t.</span>
            </h2>
          </div>
        </div>

        {/* ── Bento grid ──────────────────────────────────────────────────
            Four columns at lg, the first slightly wider to hold the phone. The
            member app card spans both rows there, so the eight cells are filled
            by five cards: phone (2) + dashboard (2) + attendance + payments +
            members (2).

            The two wide cards sit on opposite sides of the grid, and that is the
            whole point of the arrangement. Previously Dashboard and Members were
            both 2-wide in column 2, and Attendance and Payments were both 1-wide
            in column 4, so every vertical seam lined up and the thing read as a
            three-column table rather than a bento. Putting the narrow card on the
            left of row 2 and the wide card on the right staggers the seams: row 1
            breaks after column 3, row 2 after column 2.

            Done with lg:order rather than by reordering the JSX, so the stacking
            order below lg stays the narrative one — members before payments.

            No flex-1 here on purpose: with it, the grid stretched to eat whatever
            height min-h-screen left over, so on a tall viewport the cards grew
            with the window instead of being sized by their content. The rows are
            auto-sized now, so a card is as tall as what is in it and no taller.
            The column below centres the group, which is what absorbs the slack
            that the stretch used to. */}
        <div className="mt-8 grid grid-cols-1 gap-4 md:grid-cols-2 lg:mt-6 lg:grid-cols-[1.2fr_1fr_1fr_1fr]">
          {/* Member app — first, and the full height of the grid from md up */}
          <MemberAppCard />

          {/* Dashboard — two columns wide at lg, where its stat row sits four
              across. Below that it is a single column and the stats fall to 2x2. */}
          {/* The old desc here was a comma-list of the four tile labels sitting
              directly beneath it — "active members, today's collection,
              memberships expiring soon and total dues" — so the reader parsed the
              same four things twice. Deleting it outright left the card with a
              floating row of tiles and ~115px of dead air, so the slot earns its
              place back by carrying the point instead of the labels. */}
          <BentoCard
            className="lg:col-span-2"
            icon={LayoutDashboard}
            title="Dashboard & live stats"
            desc="The whole picture, on one screen."
          >
            <div className="flex flex-1 flex-col justify-center gap-2.5">
              {/* Four across only from xl, and this is measured rather than
                  guessed. Breakpoints key off the viewport, not the card, so at
                  lg this two-column card is 443px wide and each of four tiles gets
                  93px — 59px of it after padding, against 82px needed for
                  "₹12,400". Both rupee values and two of the labels overflowed.
                  2x2 until xl gives each tile ~196px, which clears comfortably. */}
              <div className="grid grid-cols-2 gap-2.5 xl:grid-cols-4">
                {DASHBOARD_STATS.map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-border-subtle bg-subtle p-4"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </p>
                    {/* 22px, up from the original 21. Dropping the third line
                        freed height and spending it on the number is what makes
                        these readable at a glance — but 24 was too far: at xl a
                        tile has 93px of content and "₹12,400" needs 90 of it at
                        24px, leaving no margin for a longer figure. */}
                    <p className="mt-2.5 text-[22px] font-medium leading-none tracking-tight text-foreground">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

            </div>
          </BentoCard>

          {/* Attendance — a plain card like its neighbours. It used to be the second
              filled-blue block in this grid, next to the member app card, which made
              two saturated blocks compete in one bento. The phone card keeps the
              accent; this one carries it only in the ticks. */}
          <BentoCard
            icon={CheckCircle2}
            title="One-tap attendance"
            desc="Mark today in a tap."
          >
            <div className="flex flex-1 flex-col justify-center gap-2">
              {ATTENDANCE_ROWS.map(row => (
                <div
                  key={row.name}
                  className="flex items-center justify-between rounded-xl border border-border-subtle bg-subtle px-3.5 py-2.5"
                >
                  <span className="flex items-center gap-2.5">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-accent">
                      <Check className="h-3 w-3 text-accent-ink" strokeWidth={3} />
                    </span>
                    <span className="text-[13px] font-medium text-foreground">{row.name}</span>
                  </span>
                  <span className="font-mono text-[11px] text-muted-foreground">{row.time}</span>
                </div>
              ))}
            </div>
          </BentoCard>

          {/* Members — two columns at lg, on the right of row 2. The span sits
              here rather than on Payments because these rows absorb the extra
              width like a table, where the Payments panel is one thin progress
              bar that reads as sparse when stretched. */}
          <BentoCard
            className="lg:order-2 lg:col-span-2"
            icon={Users}
            title="Member management"
            desc="Find and edit anyone in seconds."
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

          {/* Payments — one column, and ordered ahead of Members at lg so it
              takes the left of row 2 directly under the wide Dashboard. */}
          <BentoCard
            className="lg:order-1"
            icon={CreditCard}
            title="Payments & dues"
            desc="Cash, UPI or card. Nudges sent for you."
          >
            {/* The dues summary on top and the last few payments under it: the Members card
                beside this one holds three rows, and with the summary alone this card
                was a single short block floating in the middle of empty space. */}
            <div className="flex flex-1 flex-col gap-3">
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

              <div className="flex flex-1 flex-col justify-end gap-2">
                {PAYMENT_ROWS.map(row => (
                  <div
                    key={row.name}
                    className="flex items-center justify-between rounded-xl border border-border-subtle bg-subtle px-3 py-2"
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <span className="truncate text-[12.5px] font-medium text-foreground">{row.name}</span>
                      <span className="shrink-0 rounded-pill bg-accent-soft px-1.5 py-px font-mono text-[9.5px] uppercase text-accent-text">
                        {row.mode}
                      </span>
                    </span>
                    <span className="shrink-0 text-[12.5px] font-medium text-foreground">{row.amount}</span>
                  </div>
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
  /** Optional: omit it where the mock already says the same thing. */
  desc?: string;
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
      {/* fillOpacity 0: only the rim lights on hover. The inward mesh bleed tinted
          the card interior, which fought the mock UI sitting on top of it. */}
      <BorderGlow as="article" contentClassName="p-5" fillOpacity={0}>
        {/* Icon sits inline with the title rather than in a 40px chip above it.
            The chip and its margin cost 60px of card height, which the
            one-viewport budget cannot spare, and the icon reads the same here. */}
        {/* Icon sits inline with the title rather than in a 40px chip above it.
            The chip and its margin cost 60px of card height, which the
            one-viewport budget cannot spare, and the icon reads the same here.

            17px, up from 16. The largest text in these cards is a stat value at
            21px, so at 16 the title — the layer you actually scan — was being
            outweighed by the detail layer underneath it. */}
        <div className="flex items-center gap-2.5">
          <Icon className="h-4 w-4 shrink-0 text-accent-text" />
          <h3 className="text-[17px] font-medium tracking-tight text-foreground">
            {title}
          </h3>
        </div>

        {/* Tight to the title and a step smaller, so it reads as a subtitle
            rather than a paragraph. Skipped entirely when absent, so a card with
            no desc does not carry an empty <p> and its stray margin. */}
        {desc && (
          <p className="mt-1.5 text-[13px] leading-relaxed text-muted-foreground">{desc}</p>
        )}

        {/* The mock area grows to fill whatever height the grid row gives this
            card, so a short mock never leaves a gap in the middle of the card.
            Each mock opts into stretching via flex-1 on its own root. */}
        <div className="mt-4 flex flex-1 flex-col">{children}</div>
      </BorderGlow>
    </div>
  );
}
