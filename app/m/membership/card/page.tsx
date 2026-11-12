import { getMembershipPageData } from '@/lib/member/member-data'
import { formatDate } from '@/lib/member/member-utils'
import { startPageTimer } from '@/lib/perf'
import { MemberTopBar } from '@/components/member/MemberTopBar'
import { FadeIn } from '@/components/ui/motion'
import MembershipCardClient from './MembershipCardClient'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function MembershipCardPage() {
  const done = startPageTimer('membership/card')

  // member + gym + memberships fetched in parallel (one round trip, not three)
  const data = await getMembershipPageData()
  if (!data) {
    done()
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }
  const { member, gym, state } = data
  const { status, latest } = state

  done()

  const memberCode = member.member_code ?? `GF${String(member.member_number).padStart(5, '0')}`

  return (
    <>
      <MemberTopBar variant="sub" title="My Card" backHref="/m/membership" />
      <div className="page-container pb-6 pt-2">
      <FadeIn>
      <MembershipCardClient
        memberName={member.name}
        memberCode={memberCode}
        gymName={gym.name}
        plan={latest?.plan ?? null}
        endDate={latest?.end_date ? formatDate(latest.end_date) : null}
        status={status}
      />
      </FadeIn>
      </div>
    </>
  )
}
