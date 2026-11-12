import { getAttendancePageData } from '@/lib/member/member-data'
import { startPageTimer } from '@/lib/perf'
import { CountUp, FadeIn } from '@/components/ui/motion'
import { MemberTopBar } from '@/components/member/MemberTopBar'
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
    { label: 'This month', value: thisMonthCount },
    { label: 'This week',  value: thisWeekCount },
    { label: 'Total',      value: totalCount },
  ]

  const statTile = (
    <section aria-label="Attendance totals" className="tile mb-4 grid grid-cols-3 divide-x divide-surface-border">
      {stats.map(({ label, value }) => (
        <div key={label} className="min-w-0 p-4">
          <p className="text-3xl font-black leading-none tracking-tight text-slate-900 tabular-nums"><CountUp value={value} /></p>
          <p className="mt-1 text-xs font-semibold text-slate-500">{label}</p>
        </div>
      ))}
    </section>
  )

  return (
    <>
      <MemberTopBar variant="sub" title="Attendance" backHref="/m/home" />

      <div className="page-container pb-6 pt-2">
        <FadeIn>
          {/* Calendar first (client component with prev/next month navigation), then the stat tile, then day detail. */}
          <AttendanceCalendar
            checkedInDates={[...checkedInDates]}
            records={records.map(r => ({ id: r.id, date: r.date, session: r.session, check_out_time: r.check_out_time, created_at: r.created_at }))}
            statsSlot={statTile}
          />
        </FadeIn>
      </div>
    </>
  )
}
