import { z } from 'zod'
import { todayIST } from '@/lib/utils'
import { NOTICE_KINDS, NOTICE_LIMITS, type GymNotice, type NoticeKind } from '@/types/notice'

/** Latest allowed expiry, in days after today (India date). */
const MAX_EXPIRY_DAYS = 365

/** YYYY-MM-DD plus n days, in pure calendar arithmetic (no timezone involved). */
function addDaysISO(iso: string, days: number): string {
  const [y, m, d] = iso.split('-').map(Number)
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10)
}

/** Trims line-end spaces and collapses 3+ consecutive newlines (blank lines) to one blank line. */
function cleanBody(value: string): string {
  return value.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n').trim()
}

const title = z
  .string()
  .transform(v => v.trim())
  .pipe(
    z
      .string()
      .min(NOTICE_LIMITS.titleMin, `Title must be at least ${NOTICE_LIMITS.titleMin} characters`)
      .max(NOTICE_LIMITS.titleMax, `Title must be at most ${NOTICE_LIMITS.titleMax} characters`),
  )

const body = z
  .string()
  .transform(v => cleanBody(v.replace(/\r\n?/g, '\n')))
  .pipe(
    z
      .string()
      .min(NOTICE_LIMITS.bodyMin, `Message must be at least ${NOTICE_LIMITS.bodyMin} characters`)
      .max(NOTICE_LIMITS.bodyMax, `Message must be at most ${NOTICE_LIMITS.bodyMax} characters`),
  )

const kind = z.enum(NOTICE_KINDS as [NoticeKind, ...NoticeKind[]])

const expiresOn = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Use a date like 2026-12-31')
  .refine(v => !Number.isNaN(Date.parse(`${v}T00:00:00Z`)) && addDaysISO(v, 0) === v, 'Not a real date')
  .refine(v => v >= todayIST(), 'End date cannot be in the past')
  .refine(v => v <= addDaysISO(todayIST(), MAX_EXPIRY_DAYS), 'End date must be within a year')
  .nullable()

export const createNoticeSchema = z.object({
  kind,
  title,
  body,
  expires_on: expiresOn.optional(),
})

export const updateNoticeSchema = z.object({
  kind: kind.optional(),
  title: title.optional(),
  body: body.optional(),
  expires_on: expiresOn.optional(),
  is_active: z.boolean().optional(),
})

export type CreateNoticeInput = z.infer<typeof createNoticeSchema>
export type UpdateNoticeInput = z.infer<typeof updateNoticeSchema>

/** Columns the loaders and routes select. */
export const NOTICE_COLUMNS = 'id, kind, title, body, expires_on, is_active, created_at'

export type NoticeRow = {
  id: string
  kind: string
  title: string
  body: string
  expires_on: string | null
  is_active: boolean
  created_at: string
}

export function mapNoticeRow(row: NoticeRow): GymNotice {
  return {
    id: row.id,
    kind: (NOTICE_KINDS as readonly string[]).includes(row.kind) ? (row.kind as NoticeKind) : 'info',
    title: row.title,
    body: row.body,
    expiresOn: row.expires_on ?? null,
    isActive: row.is_active,
    createdAt: row.created_at,
  }
}
