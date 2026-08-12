'use client'

import { useState } from 'react'
import { ChevronLeft, ChevronRight, CalendarCheck, Clock, Check, Minus } from 'lucide-react'

const DOW = ['M', 'T', 'W', 'T', 'F', 'S', 'S']

interface AttendanceRecord {
  id: string
  date: string
  session?: string | null
  check_out_time?: string | null
  created_at?: string | null
}

interface Props {
  checkedInDates: string[]
  records: AttendanceRecord[]
}

/**
 * Build weeks (Mon-Sun) for the given month.
 * Each week is an array of 7 cells.
 */
function buildWeeks(year: number, month: number, checkedInSet: Set<string>, todayStr: string) {
  const daysInMonth = new Date(year, month + 1, 0).getDate()
  // Day of week for the 1st: 0=Sun, we want Mon=0
  const firstDow = (new Date(year, month, 1).getDay() + 6) % 7

  type Cell = { day: number | null; dateStr: string | null; checked: boolean; isToday: boolean; isPast: boolean }
  const weeks: Cell[][] = []
  let currentWeek: Cell[] = []

  // Pad the first week
  for (let i = 0; i < firstDow; i++) {
    currentWeek.push({ day: null, dateStr: null, checked: false, isToday: false, isPast: false })
  }

  for (let d = 1; d <= daysInMonth; d++) {
    const dateStr = `${year}-${String(month + 1).padStart(2, '0')}-${String(d).padStart(2, '0')}`
    const isPast = dateStr < todayStr
    currentWeek.push({ day: d, dateStr, checked: checkedInSet.has(dateStr), isToday: dateStr === todayStr, isPast })

    if (currentWeek.length === 7) {
      weeks.push(currentWeek)
      currentWeek = []
    }
  }

  // Pad the last week
  if (currentWeek.length > 0) {
    while (currentWeek.length < 7) {
      currentWeek.push({ day: null, dateStr: null, checked: false, isToday: false, isPast: false })
    }
    weeks.push(currentWeek)
  }

  return weeks
}

function formatDateFull(dateStr: string): string {
  const d = new Date(dateStr + 'T00:00:00')
  return d.toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

function formatTime(isoStr: string): string {
  return new Date(isoStr).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' })
}

export default function AttendanceCalendar({ checkedInDates, records }: Props) {
  const now = new Date()
  const todayStr = now.toISOString().slice(0, 10)
  const [year, setYear] = useState(now.getFullYear())
  const [month, setMonth] = useState(now.getMonth())
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const checkedInSet = new Set(checkedInDates)
  const weeks = buildWeeks(year, month, checkedInSet, todayStr)

  const monthName = new Date(year, month).toLocaleString('en-IN', { month: 'long', year: 'numeric' })
  const isCurrentMonth = year === now.getFullYear() && month === now.getMonth()

  const selectedRecords = selectedDate ? records.filter(r => r.date === selectedDate) : []

  function goBack() {
    if (month === 0) { setMonth(11); setYear(year - 1) }
    else setMonth(month - 1)
    setSelectedDate(null)
  }

  function goForward() {
    if (month === 11) { setMonth(0); setYear(year + 1) }
    else setMonth(month + 1)
    setSelectedDate(null)
  }

  function goToToday() {
    setYear(now.getFullYear())
    setMonth(now.getMonth())
    setSelectedDate(null)
  }

  function handleDateTap(dateStr: string | null) {
    if (!dateStr) return
    setSelectedDate(selectedDate === dateStr ? null : dateStr)
  }

  return (
    <>
      {/* Attendance Overview card */}
      <section className="card mb-5 p-4">
        {/* Month navigation */}
        <div className="mb-4 flex items-center justify-between">
          <button type="button" onClick={goBack} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors" aria-label="Previous month">
            <ChevronLeft className="h-4 w-4 text-slate-600" />
          </button>
          <button type="button" onClick={goToToday} className="text-sm font-bold text-slate-700 hover:text-brand-600 transition-colors">
            {monthName}
          </button>
          <button type="button" onClick={goForward} disabled={isCurrentMonth} className="flex h-8 w-8 items-center justify-center rounded-lg hover:bg-slate-100 transition-colors disabled:opacity-30 disabled:cursor-not-allowed" aria-label="Next month">
            <ChevronRight className="h-4 w-4 text-slate-600" />
          </button>
        </div>

        {/* Day headers */}
        <div className="mb-2 grid grid-cols-7 text-center">
          {DOW.map((d, i) => (
            <span key={i} className="text-xs font-bold text-slate-500">{d}</span>
          ))}
        </div>

        {/* Weeks grid — circles with checkmark (present) or dash (absent) */}
        <div className="space-y-2">
          {weeks.map((week, wi) => (
            <div key={wi} className="grid grid-cols-7 gap-1">
              {week.map((cell, ci) => {
                if (!cell.day) return <div key={ci} />
                const isSelected = cell.dateStr === selectedDate

                return (
                  <button
                    key={ci}
                    type="button"
                    onClick={() => handleDateTap(cell.dateStr)}
                    className={`
                      mx-auto flex h-9 w-9 items-center justify-center rounded-full transition-all cursor-pointer
                      ${cell.checked
                        ? isSelected
                          ? 'bg-brand-600 shadow-md shadow-brand-200 scale-110'
                          : 'bg-brand-500 hover:bg-brand-600'
                        : cell.isPast
                        ? isSelected
                          ? 'bg-slate-300 scale-110'
                          : 'bg-slate-100 hover:bg-slate-200'
                        : isSelected
                        ? 'bg-slate-200 ring-2 ring-brand-300 scale-110'
                        : 'bg-slate-50 hover:bg-slate-100'
                      }
                    `}
                    aria-label={`${cell.dateStr}${cell.checked ? ' - Present' : cell.isPast ? ' - Absent' : ''}`}
                  >
                    {cell.checked ? (
                      <Check className="h-4 w-4 text-white" strokeWidth={3} />
                    ) : cell.isPast ? (
                      <Minus className="h-3.5 w-3.5 text-slate-400" strokeWidth={2.5} />
                    ) : (
                      <span className="text-[10px] font-semibold text-slate-400">{cell.day}</span>
                    )}
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        {/* Legend */}
        <div className="mt-4 flex items-center justify-center gap-5">
          <div className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-brand-500">
              <Check className="h-2.5 w-2.5 text-white" strokeWidth={3} />
            </span>
            <span className="text-xs text-slate-500">Present</span>
          </div>
          <div className="flex items-center gap-1.5">
            <span className="flex h-4 w-4 items-center justify-center rounded-full bg-slate-100">
              <Minus className="h-2.5 w-2.5 text-slate-400" strokeWidth={2.5} />
            </span>
            <span className="text-xs text-slate-500">Absent</span>
          </div>
        </div>
      </section>

      {/* Details section below */}
      {selectedDate ? (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">{formatDateFull(selectedDate)}</h2>
          {selectedRecords.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {selectedRecords.map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <CalendarCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800 capitalize">{r.session ?? 'Check-in'} session</p>
                      {r.created_at && (
                        <p className="text-xs text-slate-400 flex items-center gap-1 mt-0.5">
                          <Clock className="h-3 w-3" />
                          Check-in: {formatTime(r.created_at)}
                        </p>
                      )}
                    </div>
                  </div>
                  {r.check_out_time && (
                    <p className="text-xs font-medium text-slate-500">Out: {formatTime(r.check_out_time)}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex items-center gap-3 py-3">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-slate-50 text-slate-400">
                <CalendarCheck className="h-4 w-4" />
              </span>
              <p className="text-sm text-slate-500">No check-in recorded on this day</p>
            </div>
          )}
        </section>
      ) : (
        <section className="card p-4">
          <h2 className="mb-3 text-sm font-semibold text-slate-700">Recent check-ins</h2>
          {records.length > 0 ? (
            <div className="divide-y divide-slate-100">
              {records.slice(0, 20).map((r) => (
                <div key={r.id} className="flex items-center justify-between py-3">
                  <div className="flex items-center gap-3">
                    <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
                      <CalendarCheck className="h-4 w-4" />
                    </span>
                    <div>
                      <p className="text-sm font-semibold text-slate-800">{formatDateFull(r.date).split(',').slice(0, 2).join(',')}</p>
                      <p className="text-xs capitalize text-slate-400">{r.session ?? 'Check-in'} session</p>
                    </div>
                  </div>
                  {r.check_out_time && (
                    <p className="text-xs text-slate-400">Out: {formatTime(r.check_out_time)}</p>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="flex flex-col items-center py-10 text-center">
              <CalendarCheck className="mb-2 h-10 w-10 text-slate-300" />
              <p className="text-sm font-bold text-slate-600">No check-ins recorded yet</p>
              <p className="mt-1 text-xs text-slate-400">Your attendance history will appear here.</p>
            </div>
          )}
        </section>
      )}
    </>
  )
}
