import 'server-only'
import { createAdminClient } from '@/lib/supabase/admin'
import { getRedisClient } from '@/lib/redis'
import { getCronLastOk } from './cronStatus'
import { getWhatsAppConfig } from '@/config/whatsapp'
import type { CheckDefinition } from './health'

type Fetcher = typeof fetch

const QUEUE_MAX_AGE_MS = 30 * 60 * 1000
const AUTOMATION_MAX_AGE_MS = 26 * 60 * 60 * 1000
const STATUS_CACHE_MS = 60_000

// Module-memory cache so a once-a-minute monitor does not hammer the status pages.
let providerCache: { at: number; detail: string } | null = null

async function providerIndicator(url: string, f: Fetcher): Promise<string> {
  const res = await f(url, { signal: AbortSignal.timeout(2000), cache: 'no-store' })
  if (!res.ok) return 'unavailable'
  const json = (await res.json()) as { status?: { indicator?: string } }
  const ind = json.status?.indicator
  return typeof ind === 'string' && /^[a-z]{1,16}$/.test(ind) ? ind : 'unavailable'
}

export function runtimeInfo() {
  return {
    region: process.env.VERCEL_REGION,
    env: process.env.VERCEL_ENV,
    commit: process.env.VERCEL_GIT_COMMIT_SHA?.slice(0, 7),
  }
}

/** Live Graph API probe, shared by the deep health check and the watchdog token check. */
export async function checkWhatsAppMeta(f: Fetcher = fetch): Promise<{ ok: boolean; detail?: string }> {
  let cfg
  try {
    cfg = getWhatsAppConfig()
  } catch {
    return { ok: true, detail: 'not configured' }
  }
  const base = cfg.WHATSAPP_BASE_URL.replace(/\/$/, '')
  const res = await f(
    `${base}/${cfg.WHATSAPP_API_VERSION}/${cfg.WHATSAPP_PHONE_NUMBER_ID}?fields=id`,
    { headers: { Authorization: `Bearer ${cfg.WHATSAPP_ACCESS_TOKEN}` }, cache: 'no-store' },
  )
  return res.ok ? { ok: true } : { ok: false, detail: `http_${res.status}` }
}

/**
 * Cron heartbeat, not log rows: on a quiet day (nothing due) the cron runs fine and writes no
 * whatsapp_automation_logs, which used to raise a false "stale". A missing key is unknown, not
 * stale, so a fresh deploy does not alarm before the first run.
 */
export async function checkDailyAutomation(
  getLastOk: typeof getCronLastOk = getCronLastOk,
  now: number = Date.now(),
): Promise<{ ok: boolean; detail?: string }> {
  const last = await getLastOk('whatsapp')
  if (!last) return { ok: true, detail: 'unknown (no cron success recorded yet)' }
  return now - last.getTime() <= AUTOMATION_MAX_AGE_MS ? { ok: true } : { ok: false, detail: 'stale' }
}

export function buildChecks(f: Fetcher = fetch): CheckDefinition[] {
  return [
    { name: 'runtime', critical: true, run: async () => ({ ok: true }) },
    {
      name: 'supabase_db',
      critical: true,
      run: async () => {
        const { error } = await createAdminClient()
          .from('gyms')
          .select('id', { count: 'exact', head: true })
          .limit(1)
        return { ok: !error }
      },
    },
    {
      name: 'supabase_auth',
      critical: true,
      run: async () => {
        const url = process.env.SUPABASE_URL
        const key = process.env.SUPABASE_ANON_KEY
        if (!url || !key) return { ok: false, detail: 'error' }
        const res = await f(`${url.replace(/\/$/, '')}/auth/v1/health`, {
          headers: { apikey: key },
          cache: 'no-store',
        })
        return res.ok ? { ok: true } : { ok: false, detail: `http_${res.status}` }
      },
    },
    {
      name: 'redis',
      critical: false,
      run: async () => {
        const client = getRedisClient()
        if (!client) return { ok: true, detail: 'not configured' }
        await client.ping()
        return { ok: true }
      },
    },
    {
      name: 'whatsapp_queue',
      critical: false,
      run: async () => {
        const { data, error } = await createAdminClient()
          .from('whatsapp_send_queue')
          .select('scheduled_at')
          .eq('status', 'pending')
          .order('scheduled_at', { ascending: true })
          .limit(1)
        if (error) return { ok: true, detail: 'unavailable' }
        if (!data || data.length === 0) return { ok: true }
        const age = Date.now() - new Date(data[0].scheduled_at as string).getTime()
        return age <= QUEUE_MAX_AGE_MS ? { ok: true } : { ok: false, detail: 'backlog' }
      },
    },
    {
      name: 'whatsapp_meta',
      critical: false,
      run: () => checkWhatsAppMeta(f),
    },
    {
      name: 'daily_automation',
      critical: false,
      run: () => checkDailyAutomation(),
    },
    {
      name: 'provider_status',
      critical: false,
      run: async () => {
        if (!providerCache || Date.now() - providerCache.at >= STATUS_CACHE_MS) {
          const [v, s] = await Promise.all([
            providerIndicator('https://www.vercel-status.com/api/v2/status.json', f).catch(() => 'unavailable'),
            providerIndicator('https://status.supabase.com/api/v2/status.json', f).catch(() => 'unavailable'),
          ])
          providerCache = { at: Date.now(), detail: `vercel=${v} supabase=${s}` }
        }
        // Informational: unavailable is ok; an upstream incident only ever degrades.
        const incident = /=(minor|major|critical)/.test(providerCache.detail)
        return { ok: !incident, detail: providerCache.detail }
      },
    },
  ]
}
