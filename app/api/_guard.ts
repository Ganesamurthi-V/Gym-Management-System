import { NextRequest } from 'next/server'
import { mapSupabaseError as rawMapSupabaseError } from '@/lib/utils/errorMapper'
import { apiError } from '@/lib/api/withAuth'

/**
 * Shared guards for owner routes that cannot use `withAuth` (they need route
 * params or return a bespoke error shape). Not a route file: Next only serves
 * `route.ts`.
 */

/**
 * Same CSRF rule as `withAuth` (lib/api/withAuth.ts): a state-changing request
 * must carry `X-Requested-With: XMLHttpRequest` or a same-deployment `Origin`.
 * Browsers always send Origin on same-site POST/PATCH/DELETE, so existing
 * callers pass without changes while a cross-site form post does not.
 */
export function passesCsrf(req: NextRequest): boolean {
  if (req.headers.get('x-requested-with') === 'XMLHttpRequest') return true
  const origin = req.headers.get('origin')
  if (!origin && !req.headers.get('referer')) return true
  if (!origin || origin === 'null') return false
  const allowed = new Set([
    process.env.NEXT_PUBLIC_APP_URL,
    process.env.NEXT_PUBLIC_API_URL,
    'http://localhost:3000',
    'http://localhost:3004',
    'http://localhost:3011',
    `${req.nextUrl.protocol}//${req.nextUrl.host}`,
  ].filter(Boolean))
  return allowed.has(origin)
}

/**
 * `mapSupabaseError` falls back to the raw database message for unknown codes,
 * which can name tables, columns and constraints. Keep the mapped status and
 * code, but never send the raw text of a 500 to the browser.
 */
export function mapSupabaseError(error: { code: string; message: string }) {
  const mapped = rawMapSupabaseError(error)
  if (mapped.status >= 500) return { ...mapped, message: 'A database error occurred. Please try again.' }
  return mapped
}

/** Drop-in for `handleSupabaseError` from withAuth with the same no-leak rule. */
export function handleSupabaseError(error: { code: string; message: string }) {
  const mapped = mapSupabaseError(error)
  return apiError(mapped.status, mapped.code, mapped.message)
}

export const csrfRejected = () => apiError(403, 'CSRF_REJECTED', 'Forbidden')

/** Upper bounds so a typo or a hostile client cannot write absurd money or stock values. */
export const MAX_MONEY = 10_000_000
export const MAX_STOCK = 1_000_000

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

/** A real calendar date (rejects 2026-02-31, which the regex alone accepts). */
export function isIsoDate(value: unknown): value is string {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false
  const d = new Date(`${value}T00:00:00Z`)
  return !isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value
}

/** Integer within [min, max] from a number or numeric string, else null. */
export function boundedInt(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isInteger(n) && n >= min && n <= max ? n : null
}

/** Finite number within [min, max] from a number or numeric string, else null. */
export function boundedNumber(value: unknown, min: number, max: number): number | null {
  const n = typeof value === 'number' ? value : typeof value === 'string' && value.trim() !== '' ? Number(value) : NaN
  return Number.isFinite(n) && n >= min && n <= max ? n : null
}

/** Trimmed non-empty string no longer than `max`, else null. */
export function boundedText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const t = value.trim()
  return t.length > 0 && t.length <= max ? t : null
}
