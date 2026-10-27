import { addMonths, format, parseISO } from 'date-fns'

/**
 * Start date of an approved member renewal.
 *
 * Mirrors the owner's Renew form (app/owner/members/[id]/MemberDetailClient.tsx): its start date
 * defaults to today (the `start_date: format(new Date(), 'yyyy-MM-dd')` initial state, L32) and is never
 * moved to the old end date, so neither is this one. `currentEndDate` is accepted so the rule can change in
 * one place. Pass today's IST date, never the server's UTC day.
 */
export function renewalStartDate(currentEndDate: string | null, today: string): string {
  void currentEndDate
  return today
}

/**
 * End date for a plan of `months` months. Mirrors `calcEndDate` in lib/utils.ts, which handleRenew
 * calls (L55): date-fns `addMonths` of the start date, so 31 Jan + 1 month is 28/29 Feb (month-end clamp).
 */
export function renewalEndDate(start: string, months: number): string {
  return format(addMonths(parseISO(start), months), 'yyyy-MM-dd')
}
