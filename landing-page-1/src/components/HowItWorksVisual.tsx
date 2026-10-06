import { Check, Download, FileSpreadsheet, MessageCircle } from 'lucide-react';

/**
 * The picture beside the How it works steps: one small product screen per step,
 * cross-fading as the reader moves down the list.
 *
 * It exists so this section has the same shape as the WhatsApp section before it:
 * copy on one side, the product on the other. Without it the steps were a column
 * of text next to nothing, which is what made the two sections read as unrelated.
 *
 * These are drawn, not screenshots, so they follow the page theme and stay sharp
 * at any size. Each shows only what its step's copy claims. aria-hidden: the steps
 * already say all of this in words.
 */

const row = 'flex items-center gap-3 rounded-xl border border-border-subtle bg-background px-3.5 py-3';
const label = 'font-mono text-[10px] font-medium uppercase tracking-[0.12em] text-muted-foreground';

function Onboard() {
  return (
    <>
      <div className="flex items-center justify-between">
        <span className={label}>Set up your gym · step 2 of 6</span>
        <span className="flex items-center gap-1.5 text-[11px] font-medium text-muted-foreground">
          <Check className="h-3.5 w-3.5 text-accent-text" />
          Autosaved
        </span>
      </div>
      <div className="mt-3 flex gap-1.5">
        {[0, 1, 2, 3, 4, 5].map(i => (
          <span key={i} className={`h-1.5 flex-1 rounded-full ${i < 2 ? 'bg-accent' : 'bg-border-subtle'}`} />
        ))}
      </div>
      <div className="mt-5 grid gap-2.5">
        <div className={row}>
          <span className="w-24 shrink-0 text-[12px] text-muted-foreground">Gym name</span>
          <span className="text-[13.5px] font-medium text-foreground">Fit Zone Gym</span>
        </div>
        {[
          ['Monthly', '₹1,500'],
          ['Quarterly', '₹4,000'],
          ['Annual', '₹12,000'],
        ].map(([plan, price]) => (
          <div key={plan} className={row}>
            <span className="w-24 shrink-0 text-[12px] text-muted-foreground">Plan</span>
            <span className="text-[13.5px] font-medium text-foreground">{plan}</span>
            <span className="ml-auto font-mono text-[12.5px] text-foreground">{price}</span>
          </div>
        ))}
      </div>
    </>
  );
}

function Import() {
  return (
    <>
      <div className="flex items-center gap-3">
        <span className="grid h-9 w-9 place-items-center rounded-xl bg-accent-soft">
          <FileSpreadsheet className="h-4 w-4 text-accent-text" />
        </span>
        <span>
          <span className="block text-[13.5px] font-medium text-foreground">members-2024.xlsx</span>
          <span className="block text-[11.5px] text-muted-foreground">250 rows · columns matched</span>
        </span>
      </div>
      <div className="mt-5 grid gap-2.5">
        <div className="flex px-3.5">
          <span className={`${label} flex-1`}>Your column</span>
          <span className={`${label} flex-1`}>GymFlow field</span>
        </div>
        {[
          ['Member Name', 'Name'],
          ['Mobile No', 'Phone'],
          ['Package', 'Plan'],
          ['Joined On', 'Start date'],
        ].map(([from, to]) => (
          <div key={from} className={row}>
            <span className="flex-1 font-mono text-[12.5px] text-muted-foreground">{from}</span>
            <span className="flex flex-1 items-center gap-2 text-[13.5px] font-medium text-foreground">
              <Check className="h-3.5 w-3.5 text-accent-text" />
              {to}
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Daily() {
  return (
    <>
      <div className="grid grid-cols-3 gap-2.5">
        {[
          ['Checked in', '45'],
          ['Collected', '₹12,400'],
          ['Dues', '₹18,600'],
        ].map(([k, v]) => (
          <div key={k} className="rounded-xl border border-border-subtle bg-background px-3 py-3">
            <span className="block text-[17px] font-medium tracking-tight text-foreground">{v}</span>
            <span className="mt-0.5 block text-[11px] text-muted-foreground">{k}</span>
          </div>
        ))}
      </div>
      <span className={`${label} mt-5 block`}>Expiring this week</span>
      <div className="mt-2.5 grid gap-2.5">
        {[
          ['Vignesh Das', 'Today'],
          ['Karthik R.', '3 days left'],
          ['Deepa Nair', '6 days left'],
        ].map(([name, left]) => (
          <div key={name} className={row}>
            <span className="text-[13.5px] font-medium text-foreground">{name}</span>
            <span className="ml-auto text-[11.5px] text-muted-foreground">{left}</span>
            <span className="flex items-center gap-1.5 rounded-lg bg-whatsapp-soft px-2.5 py-1.5 text-[11px] font-medium text-whatsapp-ink">
              <MessageCircle className="h-3 w-3" />
              Remind
            </span>
          </div>
        ))}
      </div>
    </>
  );
}

function Reports() {
  const bars = [46, 58, 52, 70, 64, 88];
  return (
    <>
      <div className="flex items-center justify-between">
        <span>
          <span className={label}>Collected this month</span>
          <span className="mt-1 block text-[24px] font-medium tracking-tight text-foreground">₹2,41,600</span>
        </span>
        <span className="flex items-center gap-1.5 rounded-lg border border-border-subtle bg-background px-3 py-2 text-[11.5px] font-medium text-foreground">
          <Download className="h-3.5 w-3.5 text-accent-text" />
          PDF
        </span>
      </div>
      <div className="mt-5 flex h-[104px] items-end gap-2.5 rounded-xl border border-border-subtle bg-background px-4 pb-3 pt-4">
        {bars.map((h, i) => (
          <span
            key={i}
            className={`flex-1 rounded-t-md ${i === bars.length - 1 ? 'bg-accent' : 'bg-border-strong'}`}
            style={{ height: `${h}%` }}
          />
        ))}
      </div>
      <div className="mt-2.5 grid grid-cols-2 gap-2.5">
        {[
          ['Who owes me money?', '₹18,600 from 14 members'],
          ['Who is leaving?', '9 ending this week'],
        ].map(([q, a]) => (
          <div key={q} className="rounded-xl border border-border-subtle bg-background px-3 py-3">
            <span className="block text-[11px] text-muted-foreground">{q}</span>
            <span className="mt-1 block text-[12.5px] font-medium leading-snug text-foreground">{a}</span>
          </div>
        ))}
      </div>
    </>
  );
}

const SCREENS = [Onboard, Import, Daily, Reports] as const;
const PATHS = ['onboarding', 'import', 'dashboard', 'reports'] as const;

export function HowItWorksVisual({ active }: { active: number }) {
  return (
    <div aria-hidden className="relative mx-auto w-full max-w-[560px]">
      {/* The accent's bloom, the counterpart of the green one behind the WhatsApp
          phone: same job, this section's own colour. */}
      <div
        className="pointer-events-none absolute inset-0 -z-10 scale-125"
        style={{
          background:
            'radial-gradient(circle at 50% 45%, color-mix(in srgb, var(--accent) 22%, transparent) 0%, transparent 68%)',
          filter: 'blur(12px)',
        }}
      />
      <div className="card overflow-hidden p-1.5 shadow-[0_40px_90px_-40px_rgba(0,0,0,0.35)]">
        <div className="flex items-center gap-1.5 px-3 py-2.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
          <span className="ml-3 font-mono text-[11px] text-muted-foreground">
            app.gymflow.sbs/{PATHS[active]}
          </span>
        </div>
        {/* All four are laid out in the same grid cell, so the frame is as tall as
            the tallest and never changes height as they swap. */}
        <div className="grid rounded-2xl border border-border-subtle bg-muted">
          {SCREENS.map((Screen, i) => (
            <div
              key={PATHS[i]}
              className={`col-start-1 row-start-1 p-6 transition-[opacity,transform] duration-500 ease-out ${
                i === active ? 'opacity-100' : 'pointer-events-none translate-y-2 opacity-0'
              }`}
            >
              <Screen />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
