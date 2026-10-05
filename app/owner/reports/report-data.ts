import { z } from 'zod'

const money = z.number()
const count = z.number().int().nonnegative()
const person = { name: z.string(), phone: z.string() }

/**
 * The shape `get_gym_reports` returns (supabase/migrations/20261005120000_restore_reports_rpc.sql).
 *
 * Parsed on the server rather than cast: migrations are run by hand, so a deploy
 * can reach production before its SQL does. A payload from an older version of
 * the function — or none at all — then fails here and the page says so, instead
 * of rendering `undefined` into every card.
 */
export const reportSchema = z.object({
  /** Six calendar months, oldest first. The last one is the current, unfinished month. */
  months: z.array(z.object({
    label: z.string(),
    total: money,
    memberships: money,
    dues: money,
    inventory: money,
    cash: money,
    upi: money,
    card: money,
    transactions: count,
    newMembers: count,
    renewals: count,
  })).length(6),
  members: z.object({
    total: count,
    active: count,
    expired: count,
    expiring7: count,
    expiring30: count,
    renewal7: money,
    renewal30: money,
  }),
  plans: z.array(z.object({ plan: z.string(), count })),
  /** Plans ending in the next 30 days, soonest first (at most 20). */
  expiring: z.array(z.object({ ...person, endDate: z.string(), plan: z.string(), amount: money })),
  /** Plans that ended in the last 30 days and were not renewed (list capped at 20). */
  lapsed: z.object({ count, top: z.array(z.object({ ...person, endDate: z.string(), plan: z.string() })) }),
  dues: z.object({ total: money, count, top: z.array(z.object({ ...person, amount: money })) }),
  attendance: z.object({
    tracked: z.boolean(),
    today: count,
    total: count,
    morning: count,
    evening: count,
    byDay: z.array(z.object({ name: z.string(), count })).length(7),
  }),
  inactive: z.object({ count, top: z.array(z.object({ ...person, lastVisit: z.string().nullable() })) }),
  areas: z.array(z.object({ area: z.string(), count })),
})

export type ReportData = z.infer<typeof reportSchema>
