import { CalendarCheck, CalendarDays, Flame, TrendingUp } from 'lucide-react'
import { getAttendancePageData } from '@/lib/member/member-data'
import { formatDateShort } from '@/lib/member/member-utils'
import { startPageTimer } from '@/lib/perf'
import AttendanceCalendar from './AttendanceCalendar'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function AttendancePage() {
  const done = startPageTimer('attendance')

  const data = await getAttendancePageData()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load attendance data.</p></div>
  }
  const { records, thisMonthCount, thisWeekCount, totalCount, checkedInDates } = data.attendance

  done()

  const stats = [
    { label: 'This week',  value: thisWeekCount,  icon: Flame,         colour: 'text-orange-500', bg: 'bg-orange-50' },
    { label: 'This month', value: thisMonthCount, icon: CalendarDays,  colour: 'text-brand-600',  bg: 'bg-brand-50' },
    { label: 'Total',      value: totalCount,     icon: TrendingUp,    colour: 'text-emerald-600',bg: 'bg-emerald-50' },
  ]

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Attendance</h1>
      </header>

      {/* Stats row */}
      <div className="mb-5 grid grid-cols-3 gap-3">
        {stats.map(({ label, value, icon: Icon, colour, bg }) => (
          <div key={label} className="card flex flex-col items-center py-4 text-center">
            <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${bg} ${colour}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-xl font-bold text-slate-900">{value}</p>
            <p className="mt-0.5 text-[10px] font-semibold text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Calendar — client component with prev/next month navigation + detail below */}
      <AttendanceCalendar
        checkedInDates={[...checkedInDates]}
        records={records.map(r => ({ id: r.id, date: r.date, session: r.session, check_out_time: r.check_out_time, created_at: r.created_at }))}
      />

    </div>
  )
}
