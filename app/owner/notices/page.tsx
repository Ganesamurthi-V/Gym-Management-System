import { requireOwnerAccess } from '@/lib/owner/access'
import { getOwnerNotices } from '@/lib/owner/notice-data'
import { NoticesClient } from './NoticesClient'

export default async function NoticesPage() {
  const { gym } = await requireOwnerAccess()

  const notices = await getOwnerNotices(gym.id)
  return <NoticesClient notices={notices} />
}
