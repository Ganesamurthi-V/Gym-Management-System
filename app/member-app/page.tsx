import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { getAuthUser, getGym } from '@/lib/dal'
import { apiLogger } from '@/lib/logger'
import { getMemberAppData } from '@/features/member-app/services/memberAppService'
import MemberAppClient from './MemberAppClient'
import MemberAppSkeleton from './loading'

/**
 * Member App Management — operational dashboard for the separate
 * `gymflow-member/` application.
 *
 * Data currently comes from the typed mock service layer. When real queries
 * land, wrap `getMemberAppData` in `cacheWrapper(cacheKeys.memberApp(gym.id),
 * 60, ...)` — the component contract does not change.
 */
export default async function MemberAppPage() {
  const logger = apiLogger('MEMBER_APP')

  logger.start('AUTH')
  const { user } = await getAuthUser()
  logger.end('AUTH')
  if (!user) redirect('/auth/login')

  logger.start('QUERY gyms')
  const { gym } = await getGym(user.id)
  logger.end('QUERY gyms')
  if (!gym) redirect('/onboarding')

  logger.start('LOAD_MEMBER_APP_DATA')
  const data = await getMemberAppData(gym.id, gym.name)
  logger.end('LOAD_MEMBER_APP_DATA')

  // Counts only — never log member names, phone numbers or other PII.
  logger.info('Payload ready', {
    portalRows: data.portalRows.length,
    invitations: data.invitations.length,
    activity: data.activity.length,
  })
  logger.summary(200)

  return (
    <Suspense fallback={<MemberAppSkeleton />}>
      <MemberAppClient gymId={gym.id} gymName={gym.name} initialData={data} />
    </Suspense>
  )
}
