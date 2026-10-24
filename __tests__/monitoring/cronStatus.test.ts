import { describe, it, expect, vi, afterEach } from 'vitest'
import { markCronOk, getCronLastOk, type CronRedis } from '@/lib/monitoring/cronStatus'

function fakeRedis() {
  const store = new Map<string, string>()
  const client: CronRedis = {
    set: vi.fn(async (k: string, v: string) => { store.set(k, v) }),
    get: vi.fn(async (k: string) => store.get(k) ?? null),
  }
  return { store, client }
}

afterEach(() => vi.unstubAllEnvs())

describe('cronStatus', () => {
  it('round trips with a 7-day TTL', async () => {
    const { client, store } = fakeRedis()
    await markCronOk('whatsapp', client)
    expect(client.set).toHaveBeenCalledWith('cron:whatsapp:last_ok', expect.any(String), { ex: 7 * 86400 })
    const d = await getCronLastOk('whatsapp', client)
    expect(d).toBeInstanceOf(Date)
    expect(d!.toISOString()).toBe(store.get('cron:whatsapp:last_ok'))
  })
  it('returns null for missing or unparsable values', async () => {
    const { client, store } = fakeRedis()
    expect(await getCronLastOk('subscription', client)).toBeNull()
    store.set('cron:subscription:last_ok', 'garbage')
    expect(await getCronLastOk('subscription', client)).toBeNull()
  })
  it('is graceful without Redis', async () => {
    await expect(markCronOk('whatsapp', null)).resolves.toBeUndefined()
    expect(await getCronLastOk('whatsapp', null)).toBeNull()
  })
  it('never throws when Redis errors', async () => {
    const client: CronRedis = { set: async () => { throw new Error('x') }, get: async () => { throw new Error('x') } }
    await expect(markCronOk('whatsapp', client)).resolves.toBeUndefined()
    expect(await getCronLastOk('whatsapp', client)).toBeNull()
  })
  it('default client is null when env is unset', async () => {
    vi.stubEnv('UPSTASH_REDIS_REST_URL', '')
    vi.stubEnv('UPSTASH_REDIS_REST_TOKEN', '')
    expect(await getCronLastOk('whatsapp')).toBeNull()
  })
})
