export const cacheKeys = {
  dashboard:    (gymId: string, date: string) => `gym:${gymId}:dashboard:${date}`,
  paymentsAll:  (gymId: string)  => `gym:${gymId}:payments_page:allTime`,
  // Platform-wide (not per gym): the admin-controlled announcement banner.
  platformAnnouncement: () => 'platform:announcement',
}
