import { TiltFrame } from './fx';
import '../styles/memberapp.css';
import {
  Activity,
  Bell,
  ChartColumn,
  CheckCircle2,
  ChevronRight,
  Dumbbell,
  Flame,
  House,
  IndianRupee,
  Scale,
  Signal,
  Trophy,
  User,
  Wifi,
} from 'lucide-react';

/** The five tabs of the member app's bottom bar, in the app's order. */
const TABS = [
  { label: 'Home', icon: House },
  { label: 'Workout', icon: Dumbbell },
  { label: 'Progress', icon: ChartColumn },
  { label: 'Rewards', icon: Trophy },
  { label: 'Profile', icon: User },
] as const;

/** The two quick actions of the member Home. */
const QUICK_ACTIONS = [
  { label: 'Attendance', icon: Activity },
  { label: 'Body progress', icon: Scale },
] as const;

/** Member app: just the phone visual (the switcher in BentoFeatures carries the words). */
export function MemberAppCard({ compact = false }: { compact?: boolean }) {
  /* Compact (the home page's feature card): the phone at its drawn 256px size, no tilt. */
  if (compact) {
    return (
      <div aria-hidden className="pointer-events-none h-full select-none overflow-clip pt-6">
        <div className="ma-phone mx-auto h-[548px] w-[256px]">
          <PhoneMock />
        </div>
      </div>
    );
  }
  return (
    <TiltFrame max={2} className="ma-stage mx-auto">
      <div className="ma-scale">
        <div className="ma-phone h-[548px]">
          <PhoneMock />
        </div>
      </div>
    </TiltFrame>
  );
}

/* ─────────────────────────────────────────────────────────────────────────── */

/**
 * CSS-built phone frame with the real member app Home inside it (greeting, quote, pending payment, today's
 * workout, streak and weekly goal, membership status, quick actions, bottom tabs). Drawn rather than shipped
 * as an image so it stays crisp at any DPI. Sample data.
 *
 * role="img" collapses the mock to a single label for assistive tech, so a screen reader does not read
 * illustrative member data as though it were page content.
 */
function PhoneMock() {
  return (
    <div
      role="img"
      aria-label="The GymFlow member app Home screen on a phone: a greeting, a pending payment with a Pay now button, today's workout with a Start workout button, a streak and a weekly goal ring, the active membership with days left, quick actions for attendance and body progress, and a bottom bar with Home, Workout, Progress, Rewards and Profile."
      className="relative"
      style={{ height: '100%' }}
    >
      <span aria-hidden className="absolute -left-[2.5px] top-[88px] h-10 w-[3px] rounded-l-sm bg-[var(--ma-bezel)]" />
      <span aria-hidden className="absolute -right-[2.5px] top-[110px] h-[60px] w-[3px] rounded-r-sm bg-[var(--ma-bezel)]" />

      <div className="relative h-full rounded-[24px] bg-[var(--ma-bezel)] p-[8px]">
        <div className="device-screen relative flex h-full flex-col overflow-hidden rounded-[16px] text-left">
          {/* Status bar: the app's own black bar with time on the left and signal and battery on the right. */}
          <div aria-hidden className="flex h-[22px] shrink-0 items-center justify-between bg-[var(--ma-bezel)] px-3 text-[9px] font-semibold text-white">
            <span>20:56</span>
            <span className="flex items-center gap-1">
              <Wifi className="h-2.5 w-2.5" strokeWidth={2.5} />
              <Signal className="h-2.5 w-2.5" strokeWidth={2.5} />
              66%
            </span>
          </div>

          <div className="flex-1 overflow-hidden bg-white px-3 pt-2.5">
            {/* Greeting and bell */}
            <div className="flex items-start justify-between">
              <div>
                <p className="text-[9px] text-[var(--ma-muted)]">Good evening</p>
                <p className="text-[17px] font-bold leading-tight tracking-tight text-[var(--ma-ink)]">Hi Ganesh</p>
                <p className="text-[8.5px] text-[var(--ma-faint)]">Ganesh</p>
              </div>
              <Bell className="mt-1 h-4 w-4 text-[var(--ma-ink)]" strokeWidth={1.75} />
            </div>

            <p className="mt-2 border-l-2 border-[var(--ma-brand)] pl-2 text-[9px] leading-snug text-[var(--ma-ink2)]">
              Do what is hard today and life gets easier later.
            </p>

            {/* Pending payment */}
            <div className="mt-2 flex items-center gap-1.5 rounded-lg border border-[#fde68a] bg-[#fffbeb] p-2">
              <IndianRupee className="h-3 w-3 shrink-0 text-[#b45309]" />
              <p className="min-w-0 flex-1 text-[8.5px] leading-snug text-[var(--ma-ink2)]">
                <b className="text-[#b45309]">₹2,500 pending.</b> Pay it here or at the gym front desk.
              </p>
              <span className="shrink-0 rounded-md border border-[#fde68a] bg-[#fef3c7] px-1.5 py-1 text-[8.5px] font-bold text-[#b45309]">
                Pay now
              </span>
            </div>

            {/* Today's workout */}
            <div className="mt-2 rounded-xl bg-[var(--ma-brand)] p-2.5 text-white">
              <p className="flex items-center gap-1 text-[8.5px] font-semibold text-white/85">
                <Dumbbell className="h-2.5 w-2.5" />
                Today&apos;s workout
              </p>
              <p className="mt-1 text-[14px] font-bold leading-tight">Strength Builder</p>
              <p className="mt-0.5 text-[8.5px] leading-snug text-white/85">
                4 exercises · Overhead Press, Dumbbell Lateral Raise, Face Pull
              </p>
              <span className="mt-2 inline-flex items-center gap-0.5 rounded-lg bg-white px-2 py-1 text-[9px] font-bold text-[var(--ma-brand)]">
                Start workout
                <ChevronRight className="h-2.5 w-2.5" />
              </span>
            </div>

            {/* Streak and weekly goal */}
            <div className="mt-2 grid grid-cols-2 overflow-hidden rounded-xl border border-[var(--ma-line)]">
              <div className="p-2">
                <p className="flex items-center gap-1 text-[8.5px] font-semibold text-[var(--ma-muted)]">
                  <Flame className="h-2.5 w-2.5 text-[var(--ma-flame)]" />
                  Streak
                </p>
                <p className="mt-0.5 text-[18px] font-black leading-none text-[var(--ma-ink)]">
                  0 <span className="text-[8.5px] font-semibold text-[var(--ma-muted)]">days</span>
                </p>
                <p className="mt-1 text-[7.5px] leading-snug text-[var(--ma-muted)]">Check in to start a streak</p>
              </div>
              <div className="flex items-center gap-1.5 border-l border-[var(--ma-line)] p-2">
                <span className="relative h-8 w-8 shrink-0">
                  <svg viewBox="0 0 36 36" className="h-8 w-8 -rotate-90" aria-hidden>
                    <circle cx="18" cy="18" r="14.5" fill="none" strokeWidth="4.5" stroke="#10b981" />
                  </svg>
                  <span className="absolute inset-0 grid place-items-center text-[8.5px] font-black text-[var(--ma-ink)]">4/4</span>
                </span>
                <span className="min-w-0">
                  <span className="block text-[7.5px] font-semibold text-[var(--ma-muted)]">Weekly goal</span>
                  <span className="block text-[8.5px] font-bold leading-tight text-[var(--ma-ok)]">Goal reached</span>
                  <span className="block text-[7.5px] text-[var(--ma-muted)]">Last 7 days</span>
                </span>
              </div>
            </div>

            {/* Membership */}
            <div className="mt-2 flex items-center gap-2 rounded-xl border border-[var(--ma-okline)] bg-[var(--ma-okbg)] p-2">
              <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-white/70 text-[var(--ma-ok)]">
                <CheckCircle2 className="h-3.5 w-3.5" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-[9.5px] font-bold text-[var(--ma-ok)]">Active · 334 days left</span>
                <span className="block text-[8px] text-[var(--ma-muted)]">Annual plan · expires 4 Oct 2027</span>
              </span>
              <ChevronRight className="h-3 w-3 text-[var(--ma-chev)]" />
            </div>

            {/* Quick actions */}
            <p className="mt-2 text-[10px] font-semibold text-[var(--ma-ink2)]">Quick actions</p>
            <div className="mt-1 grid grid-cols-2 gap-1.5">
              {QUICK_ACTIONS.map(({ label, icon: Icon }) => (
                <span key={label} className="flex items-center gap-1.5 rounded-xl border border-[var(--ma-line)] bg-white p-1.5">
                  <span className="grid h-6 w-6 shrink-0 place-items-center rounded-lg bg-[var(--ma-tile)] text-[var(--ma-ink3)]">
                    <Icon className="h-3 w-3" />
                  </span>
                  <span className="text-[8.5px] font-semibold leading-tight text-[var(--ma-ink)]">{label}</span>
                </span>
              ))}
            </div>
          </div>

          {/* Bottom tabs */}
          <div aria-hidden className="grid shrink-0 grid-cols-5 border-t border-[var(--ma-line)] bg-white pb-1.5 pt-1.5">
            {TABS.map(({ label, icon: Icon }, i) => (
              <span
                key={label}
                className={`flex flex-col items-center gap-0.5 text-[7px] font-semibold ${i === 0 ? 'text-[var(--ma-brand)]' : 'text-[var(--ma-faint)]'}`}
              >
                <Icon className="h-3.5 w-3.5" strokeWidth={i === 0 ? 2.25 : 1.75} />
                {label}
              </span>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
