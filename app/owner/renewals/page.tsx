import { getAuthUser, getGym } from '@/lib/dal'
import { getOwnerRenewalRequests } from '@/lib/owner/renewal-data'
import { RenewalsClient } from './RenewalsClient'

export default async function RenewalsPage() {
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  const [pending, reviewedAll] = await Promise.all([
    getOwnerRenewalRequests(gym.id, 'pending'),
    getOwnerRenewalRequests(gym.id),
  ])

  // Recently reviewed: approved/rejected in the last 30 days, capped at 50 (list is newest first).
  const cutoff = Date.now() - 30 * 24 * 60 * 60 * 1000
  const reviewed = reviewedAll
    .filter(r => r.status !== 'pending' && new Date(r.reviewedAt ?? r.createdAt).getTime() >= cutoff)
    .slice(0, 50)

  return <RenewalsClient pending={pending} reviewed={reviewed} />
}
