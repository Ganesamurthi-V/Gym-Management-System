import { format } from 'date-fns'

export const cacheKeys = {
  membersList:  (gymId: string)  => `gym:${gymId}:members_list`,
  dashboard:    (gymId: string, date: string) => `gym:${gymId}:dashboard:${date}`,
  payments12mo: (gymId: string)  => `gym:${gymId}:payments_page:12mo`,
  paymentsAll:  (gymId: string)  => `gym:${gymId}:payments_page:allTime`,
  gym:          (userId: string) => `user:${userId}:gym`,
  // NOTE: activeStatus key removed — getGymActiveStatus() no longer exists.
  // is_active is fetched fresh from Postgres on every render via getGymIsActive().
}
