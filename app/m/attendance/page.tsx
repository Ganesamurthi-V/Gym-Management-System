import { CalendarDays, Flame, TrendingUp } from 'lucide-react'
import { getAttendancePageData } from '@/lib/member/member-data'
import { startPageTimer } from '@/lib/perf'
import { CountUp, FadeIn, Stagger, StaggerItem } from '@/components/ui/motion'
import AttendanceCalendar from './AttendanceCalendar'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function AttendancePage() {
  const done = startPageTimer('attendance')

  const data = await getAttendancePageData()
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }
  const { records, thisMonthCount, thisWeekCount, totalCount, checkedInDates } = data.attendance

  done()

  const stats = [
    { label: 'This week',  value: thisWeekCount,  icon: Flame,         colour: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'Total',      value: totalCount,     icon: TrendingUp,    colour: 'text-emerald-600',bg: 'bg-emerald-50' },
  ]

  return (
    <div className="page-container py-6">

      <FadeIn>
        <header className="mb-5">
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
          <h1 className="mt-0.5 text-3xl font-bold tracking-tight text-slate-900">Attendance</h1>
        </header>
      </FadeIn>

      {/* Hero: this month, the one filled brand element; week and total as neutral tiles. */}
      <FadeIn delay={40}>
        <section className="mb-3 rounded-3xl bg-brand-500 p-5 text-white">
          <div className="flex items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-white/80">This month</p>
              <p className="text-6xl font-black leading-none tracking-tighter"><CountUp value={thisMonthCount} /></p>
              <p className="mt-1 text-xs text-white/80">{thisMonthCount === 1 ? 'day attended' : 'days attended'}</p>
            </div>
            <span className="flex h-11 w-11 items-center justify-center rounded-full bg-white/20">
              <CalendarDays aria-hidden="true" className="h-5 w-5" />
            </span>
          </div>
        </section>
      </FadeIn>

      <Stagger className="mb-5 grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, colour, bg }) => (
          <StaggerItem key={label} className="tile p-4">
            <span className={`mb-3 flex h-10 w-10 items-center justify-center rounded-full ${bg} ${colour}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-3xl font-black leading-none tracking-tight text-slate-900"><CountUp value={value} /></p>
            <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
          </StaggerItem>
        ))}
      </Stagger>

      {/* Calendar — client component with prev/next month navigation + detail below */}
      <AttendanceCalendar
        checkedInDates={[...checkedInDates]}
        records={records.map(r => ({ id: r.id, date: r.date, session: r.session, check_out_time: r.check_out_time, created_at: r.created_at }))}
      />

    </div>
  )
}
