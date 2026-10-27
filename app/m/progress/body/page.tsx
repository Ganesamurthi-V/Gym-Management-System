import Link from 'next/link'
import { ChevronLeft } from 'lucide-react'
import { getBodyLogs, getBodyProfile } from '@/lib/member/progress-data'
import { todayIST } from '@/lib/utils'
import { BodyClient } from './BodyClient'

export default async function BodyProgressPage() {
  // Throws on a failed query on purpose: an error must not render as "no entries".
  const [logs, profile] = await Promise.all([getBodyLogs(), getBodyProfile()])

  return (
    <div className="page-container py-6">
      <Link href="/m/progress" className="mb-3 inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-brand-600">
        <ChevronLeft className="h-4 w-4" aria-hidden="true" /> My Progress
      </Link>
      <h1 className="mb-4 text-2xl font-bold tracking-tight text-slate-900">Body progress</h1>
      <BodyClient logs={logs} profile={profile} today={todayIST()} />
    </div>
  )
}
