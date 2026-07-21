import { Redis } from '@upstash/redis'

const configured = !!(process.env.UPSTASH_REDIS_REST_URL && process.env.UPSTASH_REDIS_REST_TOKEN)

// When Upstash credentials are absent, calling the real client makes doomed
// HTTP requests (with retries) that add seconds of latency to every login.
// This stub fails open instantly instead: rate limiting is skipped, requests proceed.
const disabledStub = {
  incr: async () => 0,
  expire: async () => 0,
  del: async () => 0,
  scan: async () => ['0', []] as [string, string[]],
} as unknown as Redis

export const redis: Redis = configured
  ? new Redis({
      url: process.env.UPSTASH_REDIS_REST_URL!,
      token: process.env.UPSTASH_REDIS_REST_TOKEN!,
      retry: { retries: 1, backoff: () => 200 },
    })
  : disabledStub

export function getRedisClient() {
  if (!configured) {
    console.warn('⚠️  Redis credentials missing. Caching disabled.')
    return null
  }
  return redis
}
