import { getMembershipPageData } from '@/lib/member/member-data'
import { formatDate } from '@/lib/member/member-utils'
import { startPageTimer } from '@/lib/perf'
import MembershipCardClient from './MembershipCardClient'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function MembershipCardPage() {
  const done = startPageTimer('membership/card')

  // member + gym + memberships fetched in parallel (one round trip, not three)
  const data = await getMembershipPageData()
  if (!data) {
    done()
    return <div className="page-container py-6"><p className="text-sm text-slate-500">Unable to load card.</p></div>
  }
  const { member, gym, state } = data
  const { status, latest } = state

  done()

  const memberCode = member.member_code ?? `GF${String(member.member_number).padStart(5, '0')}`

  return (
    <div className="page-container py-6">
      <header className="mb-5">
        <p className="text-xs font-bold uppercase tracking-widest text-brand-600">GymFlow Member</p>
        <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-slate-900">My Card</h1>
      </header>

      <MembershipCardClient
        memberName={member.name}
        memberCode={memberCode}
        gymName={gym.name}
        plan={latest?.plan ?? null}
        endDate={latest?.end_date ? formatDate(latest.end_date) : null}
        status={status}
      />
    </div>
  )
}
