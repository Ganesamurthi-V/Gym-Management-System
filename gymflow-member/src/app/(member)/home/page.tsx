import Link from 'next/link'
import { Activity, CreditCard, Dumbbell } from 'lucide-react'

const quickActions = [
  { label: 'Membership', icon: CreditCard, href: '/membership' },
  { label: 'Attendance', icon: Activity, href: '/attendance' },
  { label: 'Workout', icon: Dumbbell, href: '/workout' },
]

export default function HomePage() {
  return (
    <div className="page-container py-6">
      <header className="mb-6">
        <p className="text-sm font-medium text-slate-600">Welcome to</p>
        <h1 className="text-3xl font-bold tracking-tight text-slate-900">GymFlow Member</h1>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">Your secure member app foundation is ready.</p>
      </header>

      <section className="overflow-hidden rounded-2xl bg-gradient-to-br from-brand-500 to-brand-600 p-5 text-white shadow-lg shadow-brand-200">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-100">Member access</p>
        <h2 className="mt-2 text-xl font-semibold">Everything in one place</h2>
        <p className="mt-2 text-sm leading-relaxed text-brand-50">Membership, attendance, workouts, progress, and rewards will appear here as each milestone ships.</p>
      </section>

      <section aria-labelledby="quick-actions-title" className="mt-6">
        <h2 id="quick-actions-title" className="mb-3 text-sm font-semibold text-slate-900">Quick actions</h2>
        <div className="grid grid-cols-3 gap-3">
          {quickActions.map(({ label, icon: Icon, href }) => (
            <Link key={label} href={href} className="card tap-target flex min-h-24 flex-col items-center justify-center gap-2 p-3 text-center text-slate-700 transition-all active:scale-[0.98]">
              <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-brand-50 text-brand-600">
                <Icon aria-hidden="true" className="h-5 w-5" />
              </span>
              <span className="text-xs font-semibold">{label}</span>
            </Link>
          ))}
        </div>
      </section>
    </div>
  )
}
