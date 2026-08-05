import { BarChart3, CalendarCheck, TrendingUp, Award } from 'lucide-react'
import {
  getMemberWithGym,
  getMemberMemberships,
  getMemberAttendance,
  computeMembershipState,
} from '@/lib/member-data'
import { formatDate, formatPlan } from '@/lib/member-utils'

export const revalidate = 0

export default async function ProgressPage() {
  const { member } = await getMemberWithGym()

  const [memberships, attendance] = await Promise.all([
    getMemberMemberships(member.id),
    getMemberAttendance(member.id),
  ])

  const { status, latest } = computeMembershipState(memberships)

  const stats = [
    { label: 'Total check-ins',  value: attendance.totalCount,    icon: CalendarCheck, colour: 'text-brand-600',   bg: 'bg-brand-50' },
    { label: 'This month',       value: attendance.thisMonthCount, icon: TrendingUp,    colour: 'text-emerald-600', bg: 'bg-emerald-50' },
    { label: 'This week',        value: attendance.thisWeekCount,  icon: BarChart3,     colour: 'text-orange-500',  bg: 'bg-orange-50' },
    { label: 'Memberships',      value: memberships.length,        icon: Award,         colour: 'text-violet-600',  bg: 'bg-violet-50' },
  ]

  return (
    <div className="page-container py-6">

      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">My Progress</h1>
      </header>

      {/* Stats grid */}
      <div className="mb-5 grid grid-cols-2 gap-3">
        {stats.map(({ label, value, icon: Icon, colour, bg }) => (
          <div key={label} className="card p-4">
            <span className={`mb-2 flex h-9 w-9 items-center justify-center rounded-xl ${bg} ${colour}`}>
              <Icon className="h-4 w-4" />
            </span>
            <p className="text-2xl font-bold text-slate-900">{value}</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-400">{label}</p>
          </div>
        ))}
      </div>

      {/* Current plan summary */}
      {latest && (
        <section className="card mb-5 p-4">
          <p className="mb-3 text-xs font-bold uppercase tracking-widest text-slate-400">Current Plan</p>
          <div className="flex items-center justify-between">
            <div>
              <p className="text-base font-bold text-slate-900">{formatPlan(latest.plan)}</p>
              <p className="text-xs text-slate-500">
                {formatDate(latest.start_date)} – {formatDate(latest.end_date)}
              </p>
            </div>
            <span className={`rounded-full px-3 py-1 text-xs font-bold
              ${status === 'active' ? 'bg-emerald-100 text-emerald-700' :
                status === 'expiring' ? 'bg-amber-100 text-amber-700' :
                'bg-red-100 text-red-700'}`}>
              {status.charAt(0).toUpperCase() + status.slice(1)}
            </span>
          </div>
        </section>
      )}

      <div className="card flex flex-col items-center py-8 text-center">
        <BarChart3 className="mb-2 h-10 w-10 text-slate-200" />
        <p className="text-sm font-semibold text-slate-600">Detailed progress charts</p>
        <p className="mt-1 text-xs text-slate-400">Body measurements and advanced analytics coming soon.</p>
      </div>

    </div>
  )
}
