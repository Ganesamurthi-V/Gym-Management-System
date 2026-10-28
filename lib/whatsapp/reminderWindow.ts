/**
 * lib/whatsapp/reminderWindow.ts
 *
 * Pure rule: no automatic expiry/lapse reminder once the membership ended more than
 * REMINDER_CUTOFF_MONTHS calendar months ago. Long-lapsed and bulk-imported members are not
 * messaged, which also keeps the shared 250-recipients/24 h Meta limit free for active members.
 */

import { format, parseISO, subMonths } from 'date-fns'
import type { TemplateId } from '@/types/whatsapp'

export const REMINDER_CUTOFF_MONTHS = 3

/** Only these templates are tied to a membership's expiry/lapse; everything else is unaffected. */
export const EXPIRY_LAPSE_TEMPLATES: readonly TemplateId[] = ['membership_expiry_reminder', 'membership_expired']

/**
 * True when `endDate` is before (today minus `months` calendar months). Day-of-month is clamped
 * by date-fns (31 May minus 3 months is 28/29 Feb... e.g. 31 Aug - 3 months = 31 May, 31 May
 * - 3 months = 28 Feb). Boundary: an end date exactly `months` months before today is still
 * inside the window (reminders allowed); one day earlier is outside it. A null/empty end date
 * (no membership) or a future end date is never "beyond" the window.
 */
export function isExpiredBeyondReminderWindow(
  endDate: string | null | undefined,
  today: string,
  months: number = REMINDER_CUTOFF_MONTHS,
): boolean {
  if (!endDate) return false
  const cutoff = format(subMonths(parseISO(today.slice(0, 10)), months), 'yyyy-MM-dd')
  return endDate.slice(0, 10) < cutoff
}
