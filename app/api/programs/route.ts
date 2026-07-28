import { createClient } from '@/lib/supabase/server'
import { NextRequest, NextResponse } from 'next/server'
import { checkRateLimit, ROUTE_LIMITS } from '@/lib/rateLimit'
import { getGymForUser } from '@/lib/supabase/queries'
import { mapSupabaseError } from '@/lib/utils/errorMapper'
import { apiLogger, RequestLogger } from '@/lib/logger'

export const dynamic = 'force-dynamic'

const ROUTE = '/api/programs'

// Programs are user-authored templates. Reference values are whitelisted so a
// crafted request cannot persist arbitrary strings that the UI later renders as
// filter/label values.
const DIFFICULTIES = ['Beginner', 'Intermediate', 'Advanced']
const GOALS = ['Build Muscle', 'Lose Fat', 'Improve Strength', 'Endurance', 'Athletic Performance']
const CATEGORIES = ['Strength', 'Hypertrophy', 'Fat Loss', 'Powerlifting', 'Mobility', 'CrossFit', 'Functional Fitness']
const EQUIPMENT = ['Full Gym', 'Dumbbells Only', 'Home Workout', 'Resistance Bands', 'Machines Only']
const AUDIENCES = ['Everyone', 'Men', 'Women', 'Athletes', 'Seniors', 'Beginners']
const EXPERIENCE = ['Newbie', 'Recreational', 'Serious Trainee', 'Competitive Athlete']

const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

const MAX_NAME = 120
const MAX_SUMMARY = 300
const MAX_NOTES = 5_000
// Guards against a single oversized JSONB row exhausting memory/storage.
const MAX_SCHEDULE_BYTES = 256_000
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

function fail(log: RequestLogger, status: number, code: string, message: string) {
  log.summary(status)
  return NextResponse.json({ success: false, error: { code, message } }, { status })
}

type Authorized = { supabase: Awaited<ReturnType<typeof createClient>>; gymId: string }

/** Shared auth + rate limit + gym resolution. Returns a NextResponse on failure. */
async function authorize(log: RequestLogger): Promise<Authorized | NextResponse> {
  log.start('AUTH')
  const supabase = await createClient()
  const { data: { user }, error: authError } = await supabase.auth.getUser()
  log.end('AUTH')

  if (authError || !user) return fail(log, 401, 'UNAUTHORIZED', 'Unauthorized')

  const { allowed } = await checkRateLimit(user.id, ROUTE, ROUTE_LIMITS.DEFAULT)
  if (!allowed) return fail(log, 429, 'RATE_LIMITED', 'Rate limit exceeded')

  log.start('GET_GYM')
  const gym = await getGymForUser(supabase, user.id)
  log.end('GET_GYM')

  if (!gym) return fail(log, 404, 'NOT_FOUND', 'Gym not found')

  log.info('Scope resolved', { userId: user.id, gymId: gym.id })
  return { supabase, gymId: gym.id }
}

function optionalText(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  return trimmed.slice(0, max)
}

function pickEnum(value: unknown, allowed: string[]): string | null {
  return typeof value === 'string' && allowed.includes(value) ? value : null
}

/**
 * The schedule is a day-keyed map of exercise arrays. Only known day keys and
 * the expected exercise shape are persisted so client-supplied JSON cannot
 * smuggle unbounded structures into the JSONB column.
 */
function normalizeSchedule(raw: unknown): Record<string, unknown[]> | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null

  const source = raw as Record<string, unknown>
  const schedule: Record<string, unknown[]> = {}

  for (const day of DAYS) {
    const entries = source[day]
    if (entries === undefined) {
      schedule[day] = []
      continue
    }
    if (!Array.isArray(entries)) return null
    schedule[day] = entries
  }

  return schedule
}

export async function GET(req: NextRequest) {
  const log = apiLogger('PROGRAMS_API_GET')
  try {
    const auth = await authorize(log)
    if (auth instanceof NextResponse) return auth
    const { supabase, gymId } = auth

    const { searchParams } = req.nextUrl
    const id = searchParams.get('id')

    log.start('DB_QUERY')
    if (id) {
      if (!UUID_RE.test(id)) return fail(log, 400, 'BAD_REQUEST', 'Invalid program ID')

      const { data, error } = await supabase
        .from('workout_programs')
        .select('*')
        .eq('id', id)
        .eq('gym_id', gymId)
        .single()
      log.end('DB_QUERY')

      if (error) {
        const mapped = mapSupabaseError(error)
        log.error('DB select failed', error)
        return fail(log, mapped.status, mapped.code, mapped.message)
      }

      log.summary(200)
      return NextResponse.json({ success: true, data, meta: { request_id: log.requestId } })
    }

    const limit = Math.min(parseInt(searchParams.get('limit') ?? '100'), 200)
    const { data, error, count } = await supabase
      .from('workout_programs')
      .select('id, name, summary, duration, frequency, difficulty, goal, category, is_draft, created_at', { count: 'exact' })
      .eq('gym_id', gymId)
      .order('created_at', { ascending: false })
      .limit(limit)
    log.end('DB_QUERY')

    if (error) {
      const mapped = mapSupabaseError(error)
      log.error('DB select failed', error)
      return fail(log, mapped.status, mapped.code, mapped.message)
    }

    log.info('Payload ready', { returned: data?.length ?? 0, count })
    log.summary(200)
    return NextResponse.json({
      success: true,
      data,
      meta: { request_id: log.requestId, total_count: count },
    })
  } catch (err: unknown) {
    log.error('Unhandled exception in GET /api/programs', err)
    return fail(log, 500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

export async function POST(req: NextRequest) {
  const log = apiLogger('PROGRAMS_API_POST')
  try {
    const auth = await authorize(log)
    if (auth instanceof NextResponse) return auth
    const { supabase, gymId } = auth

    let body: any
    try { body = await req.json() } catch {
      return fail(log, 400, 'BAD_REQUEST', 'Invalid JSON')
    }

    const id = body?.id
    if (id !== undefined && id !== null && id !== '' && !UUID_RE.test(String(id))) {
      return fail(log, 400, 'BAD_REQUEST', 'Invalid program ID')
    }

    const name = typeof body?.name === 'string' ? body.name.trim() : ''
    if (!name) return fail(log, 400, 'BAD_REQUEST', 'Program name is required')
    if (name.length > MAX_NAME) {
      return fail(log, 400, 'BAD_REQUEST', `Program name must be ${MAX_NAME} characters or fewer`)
    }

    const duration = parseInt(body?.duration)
    if (isNaN(duration) || duration < 1 || duration > 52) {
      return fail(log, 400, 'BAD_REQUEST', 'Duration must be between 1 and 52 weeks')
    }

    let frequency: number | null = null
    if (body?.frequency !== undefined && body?.frequency !== null && body?.frequency !== '') {
      const parsed = parseInt(body.frequency)
      if (isNaN(parsed) || parsed < 1 || parsed > 7) {
        return fail(log, 400, 'BAD_REQUEST', 'Frequency must be between 1 and 7 days')
      }
      frequency = parsed
    }

    const schedule = normalizeSchedule(body?.schedule)
    if (!schedule) {
      return fail(log, 400, 'BAD_REQUEST', 'Schedule must be a day-keyed object of exercise arrays')
    }

    const scheduleBytes = Buffer.byteLength(JSON.stringify(schedule), 'utf8')
    if (scheduleBytes > MAX_SCHEDULE_BYTES) {
      return fail(log, 413, 'PAYLOAD_TOO_LARGE', 'Program schedule is too large to save')
    }

    const isDraft = body?.isDraft === true
    // A published program that contains no exercises is not usable by staff.
    if (!isDraft && !DAYS.some(day => schedule[day].length > 0)) {
      return fail(log, 400, 'BAD_REQUEST', 'Add at least one exercise before publishing')
    }

    const payload = {
      gym_id: gymId,
      name,
      summary: optionalText(body?.summary, MAX_SUMMARY),
      notes: optionalText(body?.notes, MAX_NOTES),
      duration,
      frequency,
      difficulty: pickEnum(body?.difficulty, DIFFICULTIES),
      goal: pickEnum(body?.goal, GOALS),
      category: pickEnum(body?.category, CATEGORIES),
      equipment: pickEnum(body?.equipment, EQUIPMENT),
      target_audience: pickEnum(body?.targetAudience, AUDIENCES),
      experience_level: pickEnum(body?.experienceLevel, EXPERIENCE),
      schedule,
      is_draft: isDraft,
      updated_at: new Date().toISOString(),
    }

    log.start('DB_WRITE')
    const result = id
      ? await supabase
          .from('workout_programs')
          .update(payload)
          .eq('id', id)
          .eq('gym_id', gymId)
          .select('id, name, is_draft, updated_at')
          .single()
      : await supabase
          .from('workout_programs')
          .insert(payload)
          .select('id, name, is_draft, updated_at')
          .single()
    log.end('DB_WRITE')

    if (result.error) {
      const mapped = mapSupabaseError(result.error)
      log.error('DB write failed', result.error)
      return fail(log, mapped.status, mapped.code, mapped.message)
    }

    log.info('Program saved', { programId: result.data?.id, mode: id ? 'update' : 'insert', isDraft })
    log.summary(id ? 200 : 201)
    return NextResponse.json(
      { success: true, data: result.data, meta: { request_id: log.requestId } },
      { status: id ? 200 : 201 },
    )
  } catch (err: unknown) {
    log.error('Unhandled exception in POST /api/programs', err)
    return fail(log, 500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}

export async function DELETE(req: NextRequest) {
  const log = apiLogger('PROGRAMS_API_DELETE')
  try {
    const auth = await authorize(log)
    if (auth instanceof NextResponse) return auth
    const { supabase, gymId } = auth

    const id = req.nextUrl.searchParams.get('id')
    if (!id) return fail(log, 400, 'BAD_REQUEST', 'Missing program ID')
    if (!UUID_RE.test(id)) return fail(log, 400, 'BAD_REQUEST', 'Invalid program ID')

    log.start('DB_DELETE')
    // Gym scoping stays on the statement so a valid ID from another tenant
    // deletes nothing even if RLS were relaxed.
    const { data, error } = await supabase
      .from('workout_programs')
      .delete()
      .eq('id', id)
      .eq('gym_id', gymId)
      .select('id')
    log.end('DB_DELETE')

    if (error) {
      const mapped = mapSupabaseError(error)
      log.error('DB delete failed', error)
      return fail(log, mapped.status, mapped.code, mapped.message)
    }

    if (!data || data.length === 0) {
      return fail(log, 404, 'NOT_FOUND', 'Program not found')
    }

    log.info('Program deleted', { programId: id })
    log.summary(200)
    return NextResponse.json({ success: true, meta: { request_id: log.requestId } })
  } catch (err: unknown) {
    log.error('Unhandled exception in DELETE /api/programs', err)
    return fail(log, 500, 'INTERNAL_ERROR', 'An unexpected error occurred')
  }
}
