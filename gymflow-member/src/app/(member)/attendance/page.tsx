import { CalendarCheck, CalendarDays, Flame, TrendingUp } from 'lucide-react'
import { getMemberWithGym, getMemberAttendance } from '@/lib/member-data'
import { formatDateShort } from '@/lib/member-utils'

export const revalidate = 0

// Days of the week header
const DOW = ['S', 'M', 'T', 'W', 'T', 'F', 'S']

function buildMonthCalendar(year: number, month: number, checkedInDates: Set<string>) {
  const firstDay = new Date(year, month, 1).getDay()
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  const today = new Date().toISOString().slice(0, 10)
  const cells: { day: number | null; dateStr: string | null; checked: boolean; isToday: boolean }[] = []

  // Empty cells before first day
  for (let i = 0; i < firstDay; i++) cells.push({ day: null, dateStr: null, checked: false, isToday: false })

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    cells.push({ day: d, dateStr, checked: checkedInDates.has(dateStr), isToday: dateStr === today })
  }
  return cells
}

export default async function AttendancePage() {
  const data = await getMemberWithGym()
  if (!data) return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load attendance data.</p></div>
  const { member } = data
  const { records, thisMonthCount, thisWeekCount, totalCount, checkedInDates } = await getMemberAttendance(member.id)

  const now = new Date()
  const cells = buildMonthCalendar(now.getFullYear(), now.getMonth(), checkedInDates)

  const monthName = now.toLocaleString('en-IN', { month: 'long', year: 'numeric' })

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

      {/* Calendar */}
      <section className="card mb-5 p-4">
        <p className="mb-3 text-center text-sm font-bold text-slate-700">{monthName}</p>
        {/* Day headers */}
        <div className="mb-1 grid grid-cols-7 text-center">
          {DOW.map((d, i) => (
            <span key={i} className="text-[10px] font-bold text-slate-400">{d}</span>
          ))}
        </div>
        {/* Date cells */}
        <div className="grid grid-cols-7 gap-y-1 text-center">
          {cells.map((cell, i) => {
            if (!cell.day) return <span key={i} />
            return (
              <span
                key={i}
                className={`mx-auto flex h-8 w-8 items-center justify-center rounded-full text-xs font-semibold
                  ${cell.checked
                    ? 'bg-brand-500 text-white'
                    : cell.isToday
                    ? 'border border-brand-300 text-brand-600'
                    : 'text-slate-600'
                  }`}
              >
                {cell.day}
              </span>
            )
          })}
        </div>
        <p className="mt-3 text-center text-[10px] text-slate-400">
          <span className="inline-block h-2.5 w-2.5 rounded-full bg-brand-500 align-middle mr-1" />
          Check-in recorded
        </p>
      </section>

      {/* Recent records */}
      {records.length > 0 ? (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent check-ins</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {records.slice(0, 30).map((r) => (
              <div key={r.id} className="flex items-center justify-between px-4 py-3">
                <div className="flex items-center gap-3">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                    <CalendarCheck className="h-4 w-4" />
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-slate-800">{formatDateShort(r.date)}</p>
                    <p className="text-xs capitalize text-slate-400">{r.session ?? 'Check-in'} session</p>
                  </div>
                </div>
                {r.check_out_time && (
                  <p className="text-xs text-slate-400">
                    Out {new Date(r.check_out_time).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}
                  </p>
                )}
              </div>
            ))}
          </div>
        </section>
      ) : (
        <div className="card flex flex-col items-center py-10 text-center">
          <CalendarCheck className="mb-2 h-10 w-10 text-slate-300" />
          <p className="text-sm font-bold text-slate-600">No check-ins recorded yet</p>
          <p className="mt-1 text-xs text-slate-400">Your attendance history will appear here.</p>
        </div>
      )}

    </div>
  )
}
