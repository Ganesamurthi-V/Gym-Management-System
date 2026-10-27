import type { NoticeKind } from '@/types/notice'

/**
 * Premade notices the owner starts from. Every owner-specific detail is a [bracketed placeholder];
 * the composer refuses to post while any remain (see findPlaceholders).
 */
export interface NoticeTemplate {
  id: string
  label: string
  kind: NoticeKind
  title: string
  body: string
  /** 'end-of-day' = relevant for one day only, so the composer pre-fills "Show until" with the event date hint. */
  suggestExpiry?: 'none' | 'end-of-day'
}

export const NOTICE_TEMPLATES: readonly NoticeTemplate[] = [
  {
    id: 'holiday-timings', label: 'Holiday timings', kind: 'holiday', suggestExpiry: 'end-of-day',
    title: 'Holiday timings',
    body: 'On [date] the gym will follow special holiday timings. Regular timings resume from [resume date]. Happy holidays to all our members!',
  },
  {
    id: 'closed-today', label: 'Closed for the day', kind: 'closure', suggestExpiry: 'end-of-day',
    title: 'Gym closed on [date]',
    body: 'The gym will remain closed on [date] for the day. We reopen on [resume date]. Sorry for the inconvenience.',
  },
  {
    id: 'closed-maintenance', label: 'Closed for maintenance', kind: 'closure',
    title: 'Gym closed for maintenance',
    body: 'The gym will be closed from [from date] to [to date] for maintenance. We reopen on [resume date]. Your membership will be extended for the days we are closed.',
  },
  {
    id: 'new-batch', label: 'New batch starting', kind: 'batch',
    title: 'New batch starting [date]',
    body: 'A new batch starts on [date]. Seats are limited. Please speak to the front desk to book your seat.',
  },
  {
    id: 'timing-change', label: 'Timing change', kind: 'info',
    title: 'New gym timings from [date]',
    body: 'From [date], the gym timings are changing. Please check with the front desk for the new schedule.',
  },
  {
    id: 'new-trainer', label: 'New trainer joined', kind: 'info',
    title: 'A new trainer has joined our team',
    body: 'Please welcome our new trainer, who joined on [date]. Ask at the front desk to book a session.',
  },
  {
    id: 'equipment-maintenance', label: 'Equipment maintenance', kind: 'info', suggestExpiry: 'end-of-day',
    title: 'Equipment under maintenance',
    body: 'Some equipment will be out of use from [from date] to [to date] for servicing. Please use other equipment in the meantime. Thank you for your patience.',
  },
  {
    id: 'membership-offer', label: 'Membership offer', kind: 'offer',
    title: 'Special offer on memberships',
    body: 'Join or renew before [date] and get a special offer. Ask at the front desk for details. This offer cannot be combined with other offers.',
  },
  {
    id: 'fee-reminder', label: 'Fee / renewal reminder', kind: 'info',
    title: 'Reminder: renew your membership',
    body: 'If your membership is ending soon, please renew by [date] so your workouts are not interrupted. You can pay by UPI or at the front desk. Contact the front desk if you need help.',
  },
  {
    id: 'event-challenge', label: 'Event / challenge', kind: 'offer',
    title: 'Gym event on [date]',
    body: 'Join us for our gym event on [date]. Last date to register is [last date to register]. Register at the front desk.',
  },
  {
    id: 'important-notice', label: 'Important notice', kind: 'info',
    title: 'Important notice for all members',
    body: 'Dear members, please read this notice carefully. For any questions please contact the front desk. Thank you.',
  },
]

/** Distinct [bracketed] placeholders still present in the text, in order of first appearance. */
export function findPlaceholders(text: string): string[] {
  const found = text.match(/\[[^\]\n]*\]/g) ?? []
  return Array.from(new Set(found))
}

export type PlaceholderInput = 'time' | 'date' | 'text'

/** Input type for a placeholder name: "...time" -> time picker, contains "date" -> date picker, else text. */
export function placeholderInput(name: string): PlaceholderInput {
  const n = name.trim().toLowerCase()
  if (n.endsWith('time')) return 'time'
  if (n.includes('date')) return 'date'
  return 'text'
}

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec']

/** "2026-02-21" -> "21 Feb 2026". Pure string parsing (no Date parsing, so no timezone shift). '' when invalid. */
export function formatNoticeDate(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim())
  if (!m) return ''
  const y = Number(m[1]), mo = Number(m[2]), d = Number(m[3])
  if (mo < 1 || mo > 12 || d < 1) return ''
  const dim = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
  if (d > dim[mo - 1]) return ''
  return `${d} ${MONTHS[mo - 1]} ${y}`
}

/** "18:30" -> "6:30 PM" (12-hour). '' when invalid. */
export function formatNoticeTime(hhmm: string): string {
  const m = /^(\d{2}):(\d{2})$/.exec(hhmm.trim())
  if (!m) return ''
  const h = Number(m[1]), min = Number(m[2])
  if (h > 23 || min > 59) return ''
  return `${h % 12 === 0 ? 12 : h % 12}:${m[2]} ${h < 12 ? 'AM' : 'PM'}`
}

/**
 * Replaces every [name] with its value (dates and times are formatted for Indian readers by placeholder name).
 * Empty, missing or invalid values leave the [name] text in place.
 */
export function fillPlaceholders(text: string, values: Record<string, string>): string {
  return text.replace(/\[([^\]\n]*)\]/g, (whole, name: string) => {
    const v = values[name]?.trim()
    if (!v) return whole
    const kind = placeholderInput(name)
    const out = kind === 'date' ? formatNoticeDate(v) : kind === 'time' ? formatNoticeTime(v) : v
    return out || whole
  })
}
