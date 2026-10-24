import { redis } from '@/lib/redis'

export type CronName = 'whatsapp' | 'subscription'

/** Minimal slice of the Upstash client, so tests can inject a fake. */
export interface CronRedis {
  set(key: string, value: string, opts: { ex: number }): Promise<unknown>
  get(key: string): Promise<unknown>
}

const TTL_SECONDS = 7 * 24 * 60 * 60

const key = (name: CronName) => `cron:${name}:last_ok`

// getRedisClient() console.warns on every call when unconfigured; this runs on every cron and
// every 5-minute watchdog pass, so check the env ourselves and stay silent.
function defaultClient(): CronRedis | null {
  if (!process.env.UPSTASH_REDIS_REST_URL || !process.env.UPSTASH_REDIS_REST_TOKEN) return null
  return redis as unknown as CronRedis
}

/** Record that a cron finished successfully. Never throws; no-op without Redis. */
export async function markCronOk(name: CronName, client: CronRedis | null = defaultClient()): Promise<void> {
  if (!client) return
  try {
    await client.set(key(name), new Date().toISOString(), { ex: TTL_SECONDS })
  } catch {
    // Monitoring must never break the cron it observes.
  }
}

/** Last recorded success; null when missing, unparsable or Redis unavailable. Never throws. */
export async function getCronLastOk(name: CronName, client: CronRedis | null = defaultClient()): Promise<Date | null> {
  if (!client) return null
  try {
    const raw = await client.get(key(name))
    if (typeof raw !== 'string') return null
    const d = new Date(raw)
    return Number.isNaN(d.getTime()) ? null : d
  } catch {
    return null
  }
}
