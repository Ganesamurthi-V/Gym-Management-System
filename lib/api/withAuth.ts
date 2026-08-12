import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { getGymForUser } from '@/lib/supabase/queries'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { apiLogger } from '@/lib/logger'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import type { SupabaseClient } from '@supabase/supabase-js'

export type AuthContext = {
  user: { id: string; email?: string }
  gym: { id: string; name: string }
  supabase: SupabaseClient
  log: ReturnType<typeof apiLogger>
}

type HandlerFn = (
  req: NextRequest,
  ctx: AuthContext
) => Promise<NextResponse>

/**
 * Wraps an API route handler with authentication, gym resolution, and rate limiting.
 *
 * Ensures:
 * 1. User is authenticated via server-side cookies
 * 2. User's gym is resolved server-side (never trusts client gym_id)
 * 3. Rate limiting is applied
 * 4. Errors are caught and returned as controlled JSON
 *
 * Usage:
 *   export const GET = withAuth('MY_ROUTE_GET', async (req, { user, gym, supabase, log }) => {
 *     // ... your handler logic
 *     return NextResponse.json({ success: true, data })
 *   })
 */
export function withAuth(
  routeName: string,
  handler: HandlerFn,
  options?: { rateLimit?: number }
) {
  return async (req: NextRequest) => {
    const log = apiLogger(routeName)
    try {
      log.start('AUTH')
      const supabase = await createClient()
      const { data: { user }, error: authError } = await supabase.auth.getUser()
      log.end('AUTH')

      if (authError || !user) {
        log.summary(401)
        return NextResponse.json(
          { success: false, error: { code: 'UNAUTHORIZED', message: 'Unauthorized' } },
          { status: 401, headers: { 'Cache-Control': 'private, no-store' } }
        )
      }

      const rpm = options?.rateLimit ?? ROUTE_LIMITS.DEFAULT
      const { allowed } = await checkRateLimit(user.id, routeName, rpm)
      if (!allowed) {
        log.summary(429)
        return NextResponse.json(
          { success: false, error: { code: 'RATE_LIMITED', message: 'Rate limit exceeded' } },
          { status: 429 }
        )
      }

      log.start('GET_GYM')
      const gym = await getGymForUser(supabase, user.id)
      log.end('GET_GYM')

      if (!gym) {
        log.summary(404)
        return NextResponse.json(
          { success: false, error: { code: 'NOT_FOUND', message: 'Gym not found' } },
          { status: 404 }
        )
      }

      const ctx: AuthContext = { user, gym, supabase, log }
      const response = await handler(req, ctx)
      log.summary(response.status)
      return response
    } catch (err: unknown) {
      log.error(`Unhandled exception in ${routeName}`, err)
      log.summary(500)
      return NextResponse.json(
        { success: false, error: { code: 'INTERNAL_ERROR', message: 'An unexpected error occurred' } },
        { status: 500, headers: { 'Cache-Control': 'private, no-store' } }
      )
    }
  }
}

/** Helper to return a consistent JSON error response */
export function apiError(status: number, code: string, message: string) {
  return NextResponse.json(
    { success: false, error: { code, message } },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

/** Helper to return a consistent JSON success response */
export function apiSuccess(data: unknown, status = 200, meta?: Record<string, unknown>) {
  return NextResponse.json(
    { success: true, data, ...(meta ? { meta } : {}) },
    { status, headers: { 'Cache-Control': 'private, no-store' } }
  )
}

/** Wrap a Supabase error into an API error response */
export function handleSupabaseError(error: { code: string; message: string }) {
  const mapped = mapSupabaseError(error)
  return apiError(mapped.status, mapped.code, mapped.message)
}

/** Validate UUID format */
export function isValidUUID(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
}
