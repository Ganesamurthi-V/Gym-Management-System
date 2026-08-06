import Link from 'next/link'
import {
  Activity, CreditCard, Dumbbell, QrCode,
  AlertCircle, CheckCircle2, Clock,
} from 'lucide-react'
import {
  getMemberWithGym,
  getMemberMemberships,
  computeMembershipState,
  recordMemberLogin,
} from '@/lib/member-data'
import { formatDate } from '@/lib/member-utils'

export const revalidate = 0

export default async function HomePage() {
  const data = await getMemberWithGym()
  if (!data) return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load your profile. Please try logging out and back in.</p></div>
  const { member, gym } = data
  const memberships = await getMemberMemberships(member.id)
  const { status, daysLeft, latest } = computeMembershipState(memberships)

  // Stamp login — fire and forget, never blocks render
  void recordMemberLogin(member.id, member.gym_id)

  const firstName = member.name.split(' ')[0]

  const statusConfig = {
    active:   { icon: CheckCircle2, text: `Active · ${daysLeft} days left`,   colour: 'text-emerald-600', bg: 'bg-emerald-50', border: 'border-emerald-200' },
    expiring: { icon: AlertCircle,  text: `Expiring in ${daysLeft} day${daysLeft === 1 ? '' : 's'}`, colour: 'text-amber-600',   bg: 'bg-amber-50',   border: 'border-amber-200' },
    expired:  { icon: AlertCircle,  text: 'Membership expired',               colour: 'text-red-600',     bg: 'bg-red-50',     border: 'border-red-200' },
    none:     { icon: Clock,        text: 'No active membership',              colour: 'text-slate-500',   bg: 'bg-slate-50',   border: 'border-slate-200' },
  }
  const cfg = statusConfig[status]
  const StatusIcon = cfg.icon

  const quickActions = [
    { label: 'Membership', icon: CreditCard,  href: '/membership' },
    { label: 'Attendance', icon: Activity,    href: '/attendance' },
    { label: 'Workout',    icon: Dumbbell,    href: '/workout' },
    { label: 'My Card',    icon: QrCode,      href: '/membership/card' },
  ]

  return (
    <div className="page-container py-6">

      {/* Greeting */}
      <header className="mb-5">
        <p className="text-sm font-medium text-slate-500">Welcome back,</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">{firstName} 👋</h1>
        <p className="mt-1 text-xs text-slate-400">{gym.name}</p>
      </header>

      {/* Membership status banner */}
      <Link
        href="/membership"
        className={`mb-5 flex items-center gap-3 rounded-2xl border p-4 transition-all active:scale-[0.98] ${cfg.bg} ${cfg.border}`}
      >
        <span className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/70 ${cfg.colour}`}>
          <StatusIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className={`text-sm font-bold ${cfg.colour}`}>{cfg.text}</p>
          {latest && (
            <p className="mt-0.5 truncate text-xs text-slate-500">
              {latest.plan.charAt(0).toUpperCase() + latest.plan.slice(1)} plan
              &nbsp;·&nbsp;expires {formatDate(latest.end_date)}
            </p>
          )}
        </div>
        <span className="text-slate-300">›</span>
      </Link>

      {/* Hero card */}
      <section className="mb-5 overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 p-5 text-white shadow-lg shadow-brand-200">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-100">{gym.name}</p>
        <h2 className="mt-2 text-xl font-bold">Your fitness journey</h2>
        <p className="mt-1.5 text-sm leading-relaxed text-brand-100">
          Track your attendance, view your membership, and access your digital card — all in one place.
        </p>
      </section>

      {/* Quick actions */}
      <section aria-labelledby="quick-actions-title">
        <h2 id="quick-actions-title" className="mb-3 text-sm font-semibold text-slate-700">Quick actions</h2>
        <div className="grid grid-cols-4 gap-3">
          {quickActions.map(({ label, icon: Icon, href }) => (
            <Link
              key={href}
              href={href}
              className="card tap-target flex flex-col items-center justify-center gap-1.5 py-4 text-center transition-all active:scale-[0.96]"
            >
              <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon aria-hidden="true" className="h-4 w-4" />
              </span>
              <span className="text-[11px] font-semibold text-slate-600 leading-tight">{label}</span>
            </Link>
          ))}
        </div>
      </section>

    </div>
  )
}
