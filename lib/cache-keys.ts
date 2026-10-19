export const cacheKeys = {
  dashboard:    (gymId: string, date: string) => `gym:${gymId}:dashboard:${date}`,
  paymentsAll:  (gymId: string)  => `gym:${gymId}:payments_page:allTime`,
}
