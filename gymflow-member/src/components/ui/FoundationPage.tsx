import type { LucideIcon } from 'lucide-react'

type FoundationPageProps = {
  title: string
  description: string
  icon: LucideIcon
  accentClass: string
  children?: React.ReactNode
}

export function FoundationPage({ title, description, icon: Icon, accentClass, children }: FoundationPageProps) {
  return (
    <div className="page-container py-6">
      <header className="mb-6">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-1 text-2xl font-bold tracking-tight text-slate-900">{title}</h1>
      </header>

      <section className="card p-5">
        <div className={`mb-4 flex h-12 w-12 items-center justify-center rounded-xl ${accentClass}`}>
          <Icon aria-hidden="true" className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold text-slate-900">Foundation ready</h2>
        <p className="mt-2 text-sm leading-relaxed text-slate-600">{description}</p>
        {children}
      </section>
    </div>
  )
}
