import { addDays, addMonths, format, parseISO } from 'date-fns'

/**
 * Start date of a renewal. A member who renews while still covered keeps every paid day: the new plan
 * starts the day after the current end date. A lapsed member (end date before today) starts today.
 * `currentEndDate` is the latest end date across the member's memberships (null for none). Pass today's
 * IST date, never the server's UTC day.
 */
export function renewalStartDate(currentEndDate: string | null, today: string): string {
  if (currentEndDate && currentEndDate >= today) {
    return format(addDays(parseISO(currentEndDate), 1), 'yyyy-MM-dd')
  }
  return today
}

/**
 * End date for a plan of `months` months. Mirrors `calcEndDate` in lib/utils.ts, which handleRenew
 * calls (L55): date-fns `addMonths` of the start date, so 31 Jan + 1 month is 28/29 Feb (month-end clamp).
 */
export function renewalEndDate(start: string, months: number): string {
  return format(addMonths(parseISO(start), months), 'yyyy-MM-dd')
}
