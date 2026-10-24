import 'server-only'
import { createClient } from '@/lib/supabase/server'
import { cacheWrapper } from '@/lib/cache'
import { cacheKeys } from '@/lib/cache-keys'
import { logger } from '@/lib/logger'
import type { Announcement } from '@/lib/announcement-shared'

async function fetchActiveAnnouncement(): Promise<Announcement | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('platform_announcement')
    .select('message, level, link_url, link_label, is_active, version')
    .eq('id', 1)
    .maybeSingle()

  if (error) {
    logger.error('announcement read failed', { error: error.message })
    return null
  }
  if (!data || !data.is_active || !data.message?.trim()) return null

  return {
    message: data.message,
    level: data.level,
    link_url: data.link_url ?? null,
    link_label: data.link_label ?? null,
    version: data.version,
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
