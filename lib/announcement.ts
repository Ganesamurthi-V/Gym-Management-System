import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { logger } from '@/lib/logger'
import type { Announcement } from '@/lib/announcement-shared'

// Logged once per process when the message_after migration has not been run yet.
let warnedMissingAfterColumn = false

async function fetchActiveAnnouncement(): Promise<Announcement | null> {
  const supabase = await createClient()
  const cols = 'message, level, link_url, link_label, is_active, version'
  const read = (c: string) => supabase.from('platform_announcement').select(c).eq('id', 1).maybeSingle()

  let { data, error } = await read(`${cols}, message_after`)
  if (error && /message_after/.test(error.message ?? '')) {
    // Older DB (migration not run yet): the banner must still show, without the after-text.
    if (!warnedMissingAfterColumn) {
      warnedMissingAfterColumn = true
      logger.warn('announcement message_after column missing; run 20261024180000 migration')
    }
    ;({ data, error } = await read(cols))
  }

  if (error) {
    logger.error('announcement read failed', { error: error.message })
    return null
  }
  const row = data as any
  if (!row || !row.is_active || !row.message?.trim()) return null

  return {
    message: row.message,
    level: row.level,
    link_url: row.link_url ?? null,
    link_label: row.link_label ?? null,
    message_after: row.message_after ?? '',
    version: row.version,
  }
}

/**
 * Active site-wide announcement, or null. Never throws: a banner must not be
 * able to break the status poll. Cached 30 s (a banner is not access-control
 * state, so a short delay after the admin publishes is fine).
 */
export async function getActiveAnnouncement(): Promise<Announcement | null> {
  try {
    return await cacheWrapper(cacheKeys.platformAnnouncement(), 30, fetchActiveAnnouncement)
  } catch (err) {
    logger.error('announcement lookup failed', { error: err instanceof Error ? err.message : String(err) })
    return null
  }
}
