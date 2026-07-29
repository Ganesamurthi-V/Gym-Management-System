import { format } from 'date-fns'

export const cacheKeys = {
  membersList:  (gymId: string)  => `gym:${gymId}:members_list`,
  memberApp:    (gymId: string)  => `gym:${gymId}:member_app`,
  dashboard:    (gymId: string, date: string) => `gym:${gymId}:dashboard:${date}`,
  payments12mo: (gymId: string)  => `gym:${gymId}:payments_page:12mo`,
  paymentsAll:  (gymId: string)  => `gym:${gymId}:payments_page:allTime`,
  gym:          (userId: string) => `user:${userId}:gym`,
}
