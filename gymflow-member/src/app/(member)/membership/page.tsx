import Link from 'next/link'
import { CheckCircle2, AlertCircle, Clock, CreditCard, QrCode } from 'lucide-react'
import {
  getMemberWithGym,
  getMemberMemberships,
  computeMembershipState,
} from '@/lib/member-data'
import { formatDate, formatPlan, formatCurrency } from '@/lib/member-utils'

export const revalidate = 0

export default async function MembershipPage() {
  const data = await getMemberWithGym()
  if (!data) return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load membership data.</p></div>
  const { member } = data
  const memberships = await getMemberMemberships(member.id)
  const { status, daysLeft, latest } = computeMembershipState(memberships)

  const statusConfig = {
    active:   { label: 'Active',         cls: 'status-active',    icon: CheckCircle2, progress: 100 },
    expiring: { label: 'Expiring Soon',  cls: 'status-expiring',  icon: AlertCircle,  progress: 20 },
    expired:  { label: 'Expired',        cls: 'status-expired',   icon: AlertCircle,  progress: 0 },
    none:     { label: 'No Membership',  cls: 'bg-slate-100 text-slate-600 border border-slate-200', icon: Clock, progress: 0 },
  }
  const cfg = statusConfig[status]

  // Progress bar width based on days left vs plan duration
  let progressPct = 0
  if (latest && status !== 'expired') {
    const totalDays = Math.ceil(
      (new Date(latest.end_date).getTime() - new Date(latest.start_date).getTime()) / 86400000
    )
    progressPct = totalDays > 0 ? Math.max(0, Math.min(100, Math.round(((daysLeft ?? 0) / totalDays) * 100))) : 0
  }

  return (
    <div className="page-container py-6">

      <header className="mb-5 flex items-center justify-between">
        <div>
          <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
          <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">Membership</h1>
        </div>
        <Link
          href="/membership/card"
          className="flex items-center gap-1.5 rounded-xl bg-brand-50 px-3 py-2 text-xs font-bold text-brand-700 transition-colors active:bg-brand-100"
        >
          <QrCode className="h-4 w-4" />
          My Card
        </Link>
      </header>

      {/* Current membership card */}
      {latest ? (
        <section className="card mb-5 overflow-hidden">
          <div className="bg-gradient-to-r from-brand-500 to-brand-600 p-5 text-white">
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-bold uppercase tracking-widest text-brand-100">Current Plan</p>
                <p className="mt-1 text-2xl font-bold">{formatPlan(latest.plan)}</p>
              </div>
              <span className={`rounded-full border px-3 py-1 text-xs font-bold ${cfg.cls}`}>
                {cfg.label}
              </span>
            </div>
            {daysLeft !== null && daysLeft > 0 && (
              <div className="mt-4">
                <div className="mb-1.5 flex items-center justify-between text-xs text-brand-100">
                  <span>{daysLeft} day{daysLeft === 1 ? '' : 's'} remaining</span>
                  <span>Expires {formatDate(latest.end_date)}</span>
                </div>
                <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/20">
                  <div
                    className="h-full rounded-full bg-white transition-all"
                    style={{ width: `${progressPct}%` }}
                  />
                </div>
              </div>
            )}
          </div>

          <div className="grid grid-cols-2 divide-x divide-slate-100 border-t border-slate-100">
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Start Date</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(latest.start_date)}</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">End Date</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{formatDate(latest.end_date)}</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Amount Paid</p>
              <p className="mt-1 text-sm font-semibold text-slate-800">{formatCurrency(latest.amount)}</p>
            </div>
            <div className="p-4">
              <p className="text-[10px] font-bold uppercase tracking-wide text-slate-400">Payment Mode</p>
              <p className="mt-1 text-sm font-semibold capitalize text-slate-800">{latest.payment_mode}</p>
            </div>
          </div>
        </section>
      ) : (
        <section className="card mb-5 flex flex-col items-center py-10 text-center">
          <div className="mb-3 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100">
            <CreditCard className="h-7 w-7 text-slate-400" />
          </div>
          <p className="text-sm font-bold text-slate-700">No active membership</p>
          <p className="mt-1 text-xs text-slate-500">Contact your gym to get started.</p>
        </section>
      )}

      {/* Pending dues */}
      {member.pending_amount > 0 && (
        <div className="mb-5 rounded-2xl border border-red-200 bg-red-50 p-4">
          <p className="text-sm font-bold text-red-700">
            Pending dues: {formatCurrency(member.pending_amount)}
          </p>
          <p className="mt-0.5 text-xs text-red-600">Please settle at your gym.</p>
        </div>
      )}

      {/* Membership history */}
      {memberships.length > 1 && (
        <section>
          <h2 className="mb-3 text-sm font-semibold text-slate-700">History</h2>
          <div className="card divide-y divide-slate-100 overflow-hidden">
            {memberships.slice(1).map((m) => (
              <div key={m.id} className="flex items-center justify-between px-4 py-3">
                <div>
                  <p className="text-sm font-semibold text-slate-700">{formatPlan(m.plan)}</p>
                  <p className="text-xs text-slate-400">
                    {formatDate(m.start_date)} – {formatDate(m.end_date)}
                  </p>
                </div>
                <p className="text-sm font-bold text-slate-600">{formatCurrency(m.amount)}</p>
              </div>
            ))}
          </div>
        </section>
      )}

    </div>
  )
}
