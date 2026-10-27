import { z } from 'zod'

/** Optional free text from a multipart form: empty or missing becomes undefined. */
const optionalText = (max: number) =>
  z.preprocess(
    (v) => (typeof v === 'string' ? (v.trim() === '' ? undefined : v.trim()) : v),
    z.string().max(max).optional(),
  )

/** What a member submits with a renewal (the file is checked separately). Price and plan details are never accepted. */
export const memberRenewalSchema = z.object({
  /** Index into the gym's saved plans, as returned by get_member_renewal_options. */
  plan_key: z.string().regex(/^\d{1,3}$/, 'Choose a plan'),
  transaction_id: optionalText(100),
  notes: optionalText(500),
})

export type MemberRenewalInput = z.infer<typeof memberRenewalSchema>

/** Whole rupees from a multipart field. The database re-checks it against the member's real pending amount. */
export const memberDueSchema = z.object({
  amount: z.preprocess(
    (v) => (typeof v === 'string' && /^\d{1,9}$/.test(v.trim()) ? Number(v.trim()) : v),
    z.number().int().min(1).max(10_000_000),
  ),
  transaction_id: optionalText(100),
  notes: optionalText(500),
})

export const paymentKindSchema = z.enum(['renewal', 'due']).default('renewal')

export type MemberDueInput = z.infer<typeof memberDueSchema>

export const approveRenewalSchema = z.object({
  start_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
})

/** An override start date must fall within 30 days before and 365 days after today (IST), both inclusive. */
export function isStartDateInWindow(startDate: string, today: string): boolean {
  const day = (iso: string) => Date.UTC(+iso.slice(0, 4), +iso.slice(5, 7) - 1, +iso.slice(8, 10)) / 86_400_000
  const diff = day(startDate) - day(today)
  return diff >= -30 && diff <= 365
}

export const rejectRenewalSchema = z.object({
  reason: z.string().trim().min(3).max(300),
})
