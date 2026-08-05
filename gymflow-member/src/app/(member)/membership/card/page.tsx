import { getMemberWithGym, getMemberMemberships, computeMembershipState } from '@/lib/member-data'
import { formatDate } from '@/lib/member-utils'
import MembershipCardClient from './MembershipCardClient'

export const revalidate = 0

export default async function MembershipCardPage() {
  const { member, gym } = await getMemberWithGym()
  const memberships = await getMemberMemberships(member.id)
  const { status, latest } = computeMembershipState(memberships)

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
