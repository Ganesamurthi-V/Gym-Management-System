import { format } from 'date-fns'

export const cacheKeys = {
  membersList:  (gymId: string)  => `gym:${gymId}:members_list`,
  memberApp:    (gymId: string)  => `gym:${gymId}:member_app`,
  dashboard:    (gymId: string, date: string) => `gym:${gymId}:dashboard:${date}`,
  payments12mo: (gymId: string)  => `gym:${gymId}:payments_page:12mo`,
  paymentsAll:  (gymId: string)  => `gym:${gymId}:payments_page:allTime`,
  gym:          (userId: string) => `user:${userId}:gym`,
  // Keyed by OWNER, not gym: the unread count is fetched in parallel with the
  // gym row (RLS scopes admin_messages to the owner's gym), so the gym id is
  // not known at lookup time.
  unreadCount:  (userId: string) => `unread_count:owner:${userId}`,
}
