import type { ReactNode } from 'react';
import { Check, CheckCircle2, CreditCard, LayoutDashboard, Users } from 'lucide-react';
import { useReveal } from '../lib/useReveal';
import { ACCENT_GLOW } from '../lib/borderGlowPresets';
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
      className="contain-visible px-5 py-14 md:px-8 md:py-16 lg:flex lg:min-h-screen lg:flex-col lg:py-9"
    >
      {/* justify-center pairs with the de-stretched grid: the section still holds
          a full screen, but the header+grid group sits centred in it rather than
          pinned to the top with dead space underneath. */}
      <div className="mx-auto flex w-full max-w-[1240px] flex-1 flex-col lg:justify-center">
        {/* ── Header ────────────────────────────────────────────────────── */}
        {/* display-3 rather than display-2, and tighter margins: the section is
            budgeted to one viewport, and at display-2 the header alone took 234px
            of that. */}
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-[560px]">
            <span className="reveal eyebrow">Core modules</span>
            <h2 id="features-title" className="reveal display-3 mt-3 text-balance">
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
            payments (2).

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
              {/* lg, not sm: `sm:` keys off the viewport rather than the card, so
                  four across in a single md column gave each tile ~62px and values
                  like ₹12,400 overflowed. */}
              <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
                {DASHBOARD_STATS.map(stat => (
                  <div
                    key={stat.label}
                    className="rounded-2xl border border-border-subtle bg-subtle p-4"
                  >
                    <p className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">
                      {stat.label}
                    </p>
                    {/* 24px, up from 21. Dropping the third line freed height, and
                        spending it on the number rather than leaving it as a gap
                        is what makes these tiles easier to read at a glance. */}
                    <p className="mt-2.5 text-[24px] font-medium leading-none tracking-tight text-foreground">
                      {stat.value}
                    </p>
                  </div>
                ))}
              </div>

            </div>
          </BentoCard>

          {/* Attendance — the one fully filled block in this row, so the accent
              lands once and reads as intentional.

              A BorderGlow like the white cards, not a plain article: its hover
              now tracks the pointer and lights the facing arc instead of
              swapping the whole border at once. ACCENT_GLOW carries the white
              rim; .glow-card-accent the resting rim and text colour. */}
          <BorderGlow
            as="article"
            className="reveal glow-card-accent"
            contentClassName="p-5"
            {...ACCENT_GLOW}
          >
            <div className="flex items-center gap-2.5">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-accent-ink" />
              {/* 17px to match BentoCard's title — this card is hand-rolled
                  rather than going through it, so the size has to be kept in
                  step by hand. */}
              <h3 className="text-[17px] font-medium tracking-tight text-accent-ink">
                One-tap attendance
              </h3>
            </div>
            <p className="mt-1.5 text-[13px] leading-relaxed text-accent-ink/80">
              Mark today in a tap.
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
          </BorderGlow>

          {/* Members — two columns at lg. The span sits here rather than on
              Payments because these rows absorb the extra width like a table,
              where the Payments panel is one thin progress bar that reads as
              sparse when stretched. */}
          <BentoCard
            className="lg:col-span-2"
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

          {/* Payments — fills the last cell of the second row */}
          <BentoCard
            icon={CreditCard}
            title="Payments & dues"
            desc="Cash, UPI or card. Nudges sent for you."
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
