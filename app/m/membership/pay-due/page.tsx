import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getRenewalPageData } from '@/lib/member/renewal-data'
import PayDueClient from './PayDueClient'

export default async function PayDuePage() {
  const data = await getRenewalPageData()
  // Null also means a plan-blocked member: render nothing; the layout shows the notice.
  if (!data) return null

  return (
    <div className="page-container py-6">
      <Link
        href="/m/membership"
        className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-slate-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-500"
      >
        <ChevronLeft aria-hidden="true" className="h-4 w-4" />
        Membership
      </Link>
      <header className="mb-5">
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">Pay dues</h1>
        <p className="mt-0.5 text-xs text-slate-400">{data.options.gymName}</p>
      </header>
      <PayDueClient data={data} />
    </div>
  )
}
