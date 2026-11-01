import { TiltFrame } from './fx';
import '../styles/memberapp.css';
import { Activity, BatteryFull, CheckCircle2, CreditCard, Dumbbell, Flame, QrCode, Signal } from 'lucide-react';

/** The four tiles of the real member Home, in the app's order. */
const QUICK_ACTIONS = [
  { label: 'Plan', icon: CreditCard },
  { label: 'Visits', icon: Activity },
  { label: 'Workout', icon: Dumbbell },
  { label: 'My Card', icon: QrCode },
] as const;

/** Member app: just the phone visual (the switcher in BentoFeatures carries the words). */
export function MemberAppCard() {
  return (
    <TiltFrame max={2} className="ma-stage mx-auto">
      <div className="ma-scale">
        <div className="ma-phone h-[520px]">
          <PhoneMock />
        </div>
      </div>
    </TiltFrame>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * CSS-built iPhone frame. Drawn rather than shipped as an image so it stays
 * crisp at any DPI and the screen inside can use live tokens.
 *
 * role="img" collapses the mock to a single label for assistive tech — without
 * it a screen reader reads illustrative member data as though it were page
 * content.
 */
function PhoneMock() {
  return (
    <div
      role="img"
      aria-label="The GymFlow member app Home screen on a phone. It greets the member, shows an active membership with 24 days left, a 12-day attendance streak, a weekly goal ring at 3 of 5 days, and quick actions for plan, visits, workout and member card."
      className="relative"
      style={{ height: '100%' }}
    >
      {/* Side buttons — small dark ticks against the card, purely decorative */}
      <span
        aria-hidden
        className="absolute -left-[2.5px] top-[88px] h-10 w-[3px] rounded-l-sm bg-[var(--ma-bezel)]"
      />
      <span
        aria-hidden
        className="absolute -right-[2.5px] top-[110px] h-[60px] w-[3px] rounded-r-sm bg-[var(--ma-bezel)]"
      />

      {/* Bezel. Screen radius is bezel radius minus the 10px band, which keeps
          the two roundings concentric. */}
      <div className="relative h-full rounded-[24px] bg-[var(--ma-bezel)] p-[8px]">
        <div className="device-screen relative flex h-full flex-col overflow-hidden rounded-[16px] px-4 pt-10 text-left">
          <span
            aria-hidden
            className="absolute left-1/2 top-2.5 h-[21px] w-[80px] -translate-x-1/2 rounded-full bg-[var(--ma-bezel)]"
          />

          {/* Status bar either side of the island, and a home-indicator line along the bottom.
              The bottom offset clears the BLEED crop (plus the bezel), so the bar
              sits on the visible part of the screen instead of under the card edge. */}
          <span aria-hidden className="absolute left-5 top-[11px] text-[10px] font-semibold text-[var(--ma-ink)]">
            9:41
          </span>
          <span
            aria-hidden
            className="absolute right-4 top-[11px] flex items-center gap-1 text-[9px] font-semibold text-[var(--ma-ink)]"
          >
            <Signal className="h-3 w-3" strokeWidth={2.5} />
            87%
            <BatteryFull className="h-3.5 w-3.5" />
          </span>
          <span
            aria-hidden
            className="absolute inset-x-0 bottom-0 z-10 flex items-start justify-center border-t border-[var(--ma-line)] bg-white pt-1"
            style={{ height: '28px' }}
          >
            <span className="h-1 w-20 rounded-full bg-[color-mix(in_oklab,var(--ma-ink)_80%,transparent)]" />
          </span>

          {/* A faithful, trimmed copy of the real member Home (app/m/home): greeting,
              membership status banner, streak and weekly-goal cards, quick actions.
              Colours are the app's own light-theme values (emerald status, slate text,
              brand-blue goal ring), set literally because the device screen stays
              light whatever theme the landing page is in. */}
          <div className="-mx-4 flex-1 bg-[var(--ma-bg)] px-3.5 pt-1">
            <p className="text-[10px] font-medium text-[var(--ma-muted)]">Welcome back,</p>
            <p className="text-[17px] font-bold leading-tight tracking-tight text-[var(--ma-ink)]">Karthik</p>
            <p className="mt-0.5 text-[9px] text-[var(--ma-faint)]">Iron Temple Fitness</p>

            <div className="mt-2.5 flex items-center gap-2 rounded-xl border border-[var(--ma-okline)] bg-[var(--ma-okbg)] p-2.5">
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-lg bg-white/70 text-[var(--ma-ok)]">
                <CheckCircle2 className="h-4 w-4" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[11px] font-bold text-[var(--ma-ok)]">Active</span>
                <span className="block text-[9px] font-bold text-[var(--ma-ok)]">24 days left</span>
                <span className="block text-[9px] text-[var(--ma-muted)]">Quarterly plan</span>
                <span className="block text-[9px] text-[var(--ma-muted)]">Expires 12 Nov 2026</span>
              </span>
              <span className="text-[var(--ma-chev)]">›</span>
            </div>

            <div className="mt-2.5 grid grid-cols-2 gap-2">
              <div className="rounded-xl border border-[var(--ma-line)] bg-white p-2.5">
                <p className="flex items-center gap-1 text-[9px] font-semibold text-[var(--ma-muted)]">
                  <Flame className="h-3 w-3 text-[var(--ma-flame)]" />
                  Streak
                </p>
                <p className="mt-1 text-[20px] font-black leading-none text-[var(--ma-ink)]">
                  12 <span className="text-[9px] font-semibold text-[var(--ma-muted)]">days</span>
                </p>
                <p className="mt-1 text-[8.5px] font-semibold text-[var(--ma-ok)]">Checked in today</p>
              </div>
              <div className="flex items-center gap-2 rounded-xl border border-[var(--ma-line)] bg-white p-2.5">
                <span className="relative h-9 w-9 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-9 w-9 -rotate-90" aria-hidden>
                    <circle cx="18" cy="18" r="14.5" fill="none" strokeWidth="4" stroke="var(--ma-track)" />
                    <circle
                      cx="18"
                      cy="18"
                      r="14.5"
                      fill="none"
                      strokeWidth="4"
                      strokeLinecap="round"
                      stroke="var(--ma-brand)"
                      strokeDasharray="91.1"
                      strokeDashoffset="36.4"
                    />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-[9px] font-black text-[var(--ma-ink)]">
                    3/5
                  </span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[9px] font-semibold text-[var(--ma-muted)]">Goal</span>
                  <span className="block text-[9px] font-bold leading-snug text-[var(--ma-ink2)]">2 more days</span>
                </span>
              </div>
            </div>

            <p className="mt-2.5 text-[10px] font-semibold text-[var(--ma-ink2)]">Quick actions</p>
            <div className="mt-1.5 grid grid-cols-4 gap-1.5">
              {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
                <span
                  key={label}
                  className="flex flex-col items-center gap-1 rounded-xl border border-[var(--ma-line)] bg-white py-2"
                >
                  <span className="grid h-6 w-6 place-items-center rounded-lg bg-[var(--ma-tile)] text-[var(--ma-brand)]">
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-[8px] font-semibold text-[var(--ma-ink3)]">{label}</span>
                </span>
              ))}
            </div>

            <div className="mt-2.5 rounded-xl bg-gradient-to-br from-[var(--ma-blue1)] to-[var(--ma-blue2)] p-3 text-white">
              <p className="text-[9px] font-semibold text-[var(--ma-blue-ink)]">Iron Temple Fitness</p>
              <p className="mt-0.5 text-[12px] font-bold">Your fitness journey</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
