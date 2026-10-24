import { NextRequest, NextResponse } from 'next/server'
import { verifyRequestAuth } from '@/lib/auth'
import { createAdminClient } from '@/lib/supabase-admin'
import { rateLimit, RATE_LIMITS } from '@/lib/rate-limit'
import { redis } from '@/lib/redis'
import { apiLogger } from '@/lib/logger'
import { validateAnnouncement } from '@/lib/announcement-validate'

export const dynamic = 'force-dynamic'

const LEGACY_COLUMNS = 'message, level, link_url, link_label, is_active, version, updated_at'
const COLUMNS = 'message, level, link_url, link_label, message_after, is_active, version, updated_at'
const DEFAULTS = { message: '', level: 'info', link_url: null, link_label: null, message_after: '', is_active: false, version: 0, updated_at: null }

// The message_after column ships in a separate migration that may not be applied yet; until it is,
// reads and writes fall back to the old column set so publishing never breaks.
function isMissingColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  return error.code === '42703' || error.code === 'PGRST204' || /column .*does not exist|message_after/i.test(error.message ?? '')
}

async function readAnnouncement(supabase: ReturnType<typeof createAdminClient>, log: ReturnType<typeof apiLogger>) {
  const first = await supabase.from('platform_announcement').select(COLUMNS).eq('id', 1).maybeSingle()
  if (!isMissingColumn(first.error)) return first
  log.warn('message_after column missing, reading without it (run the migration)')
  const legacy = await supabase.from('platform_announcement').select(LEGACY_COLUMNS).eq('id', 1).maybeSingle()
  return { ...legacy, data: legacy.data ? { ...legacy.data, message_after: '' } : legacy.data }
}

// GET /api/announcements: current site-wide announcement (inactive defaults if never set)
export async function GET(req: NextRequest) {
  const log = apiLogger('ADMIN_ANNOUNCEMENT_GET', req)

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = createAdminClient()
  const { data, error } = await readAnnouncement(supabase, log)
  if (error) {
    log.error('Failed to fetch announcement', error)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to fetch announcement' }, { status: 500 })
  }

  log.summary(200)
  return NextResponse.json({ ok: true, announcement: data ?? DEFAULTS })
}

// PUT /api/announcements: publish (is_active true, bumps version) or turn off
export async function PUT(req: NextRequest) {
  const log = apiLogger('ADMIN_ANNOUNCEMENT_SAVE', req)
  log.adminAction = 'save_announcement'

  if (!(await verifyRequestAuth(req))) {
    log.summary(401)
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const rateLimitResponse = await rateLimit(req, 'announcement_save', RATE_LIMITS.ANNOUNCEMENT_SAVE.limit, RATE_LIMITS.ANNOUNCEMENT_SAVE.window)
  if (rateLimitResponse) { log.summary(429); return rateLimitResponse }

  const rawBody = await req.json().catch(() => null)
  const input = validateAnnouncement(rawBody)
  if ('error' in input) {
    log.warn('Invalid announcement input', { error: input.error })
    log.summary(400)
    return NextResponse.json({ error: input.error }, { status: 400 })
  }

  const supabase = createAdminClient()
  const { data: current, error: readErr } = await readAnnouncement(supabase, log)
  if (readErr) {
    log.error('Failed to read announcement', readErr)
    log.summary(500)
    return NextResponse.json({ error: 'Failed to save announcement' }, { status: 500 })
  }

  const now = new Date().toISOString()
  let saved: NonNullable<typeof current>
  if (!current) {
    // First ever save: the singleton primary key makes a racing insert fail loudly instead of duplicating.
    const row = { id: 1, ...input, version: input.is_active ? 1 : 0, updated_at: now }
    let { data, error } = await supabase.from('platform_announcement').insert(row).select(COLUMNS).single()
    if (isMissingColumn(error)) {
      log.warn('message_after column missing, saving without it (run the migration)')
      const { message_after: _drop, ...legacyRow } = row
      const retry = await supabase.from('platform_announcement').insert(legacyRow).select(LEGACY_COLUMNS).single()
      data = retry.data ? { ...retry.data, message_after: '' } : retry.data
      error = retry.error
    }
    if (error) {
      log.error('Failed to create announcement', error)
      log.summary(500)
      return NextResponse.json({ error: 'Failed to save announcement' }, { status: 500 })
    }
    saved = data!
  } else {
    // Turning off with a blank message keeps the stored text so it can be re-published later.
    const message = input.message || current.message
    const version = input.is_active ? current.version + 1 : current.version
    // Guard on the version we read so two concurrent publishes cannot both write the same number.
    const patch = { ...input, message, version, updated_at: now }
    let { data, error } = await supabase.from('platform_announcement')
      .update(patch).eq('id', 1).eq('version', current.version).select(COLUMNS)
    if (isMissingColumn(error)) {
      log.warn('message_after column missing, saving without it (run the migration)')
      const { message_after: _drop, ...legacyPatch } = patch
      const retry = await supabase.from('platform_announcement')
        .update(legacyPatch).eq('id', 1).eq('version', current.version).select(LEGACY_COLUMNS)
      data = retry.data ? retry.data.map(r => ({ ...r, message_after: '' })) : retry.data
      error = retry.error
    }
    if (error) {
      log.error('Failed to update announcement', error)
      log.summary(500)
      return NextResponse.json({ error: 'Failed to save announcement' }, { status: 500 })
    }
    if (!data || data.length === 0) {
      log.summary(409)
      return NextResponse.json({ error: 'Announcement changed meanwhile. Reload and try again.' }, { status: 409 })
    }
    saved = data[0]
  }

  // Same Upstash instance as the owner app (same env var names), so clear its cache for an instant effect.
  try { await redis.del('platform:announcement') } catch { /* owners fall back to the cache TTL */ }

  log.info('Announcement saved', { active: input.is_active, level: input.level, messageLength: input.message.length, version: saved.version })
  log.summary(200)
  return NextResponse.json({ ok: true, announcement: saved })
}
