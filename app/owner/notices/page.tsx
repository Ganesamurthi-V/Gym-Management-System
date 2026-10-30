import { getAuthUser, getGym } from '@/lib/dal'
import { getOwnerNotices } from '@/lib/owner/notice-data'
import { NoticesClient } from './NoticesClient'

export default async function NoticesPage() {
  const { user } = await getAuthUser()
  if (!user) return null

  const { gym } = await getGym(user.id)
  if (!gym) return null

  const notices = await getOwnerNotices(gym.id)
  return <NoticesClient notices={notices} />
}
