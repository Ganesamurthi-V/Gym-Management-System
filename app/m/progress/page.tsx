import { getBodyLogs, getBodyProfile } from '@/lib/member/progress-data'
import { getProgressPageData } from '@/lib/member/member-data'
import { startPageTimer } from '@/lib/perf'
import { todayIST } from '@/lib/utils'
import { BodyClient } from './body/BodyClient'

// Dynamic via the auth cookie; see the note in home/page.tsx on why a
// route-level `revalidate` cannot be used for per-user pages.

export default async function ProgressPage() {
  const done = startPageTimer('progress')

  // member + gym + memberships + attendance and the body data all in parallel (one round trip).
  // getBodyLogs/getBodyProfile throw on a failed query on purpose: an error must not render as "no entries".
  const [data, bodyLogs, profile] = await Promise.all([
    getProgressPageData(), getBodyLogs(), getBodyProfile(),
  ])
  done()
  if (!data) {
    // Null also means a plan-blocked member: render nothing; the layout shows the notice.
    return null
  }

  return <BodyClient logs={bodyLogs} profile={profile} today={todayIST()} memberName={data.member.name} />
}
