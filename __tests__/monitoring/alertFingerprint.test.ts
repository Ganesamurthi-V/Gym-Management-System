import { describe, it, expect, vi } from 'vitest'
import {
  createAlerter,
  effectiveKey,
  sanitizeFingerprint,
  buildTelegramText,
  buildNotificationBody,
  ESCALATION_THRESHOLDS,
  type AlertDeps,
  type AlertInput,
} from '@/lib/monitoring/alert'
import { getAlertGuide, GENERIC_GUIDE } from '@/lib/monitoring/alertGuides'

const T0 = Date.UTC(2026, 9, 24, 16, 42, 0) // 10:12 PM IST

function fakeRedis(clock: () => number) {
  const store = new Map<string, number>()
  const exp = new Map<string, number>()
  const live = (k: string) => {
    const e = exp.get(k)
    if (e !== undefined && e <= clock()) { store.delete(k); exp.delete(k) }
    return store.has(k)
  }
  return {
    set: vi.fn(async (k: string, v: string, o: { nx?: true; ex: number }) => {
      if (o.nx && live(k)) return null
      store.set(k, Number(v) || 1)
      exp.set(k, clock() + o.ex * 1000)
      return 'OK'
    }),
    get: vi.fn(async (k: string) => (live(k) ? store.get(k)! : null)),
    incr: vi.fn(async (k: string) => { const n = (live(k) ? store.get(k)! : 0) + 1; store.set(k, n); return n }),
    decr: vi.fn(async (k: string) => { const n = (store.get(k) ?? 0) - 1; store.set(k, n); return n }),
    expire: vi.fn(async (k: string, s: number) => { exp.set(k, clock() + s * 1000); return 1 }),
    del: vi.fn(async (k: string) => { store.delete(k); exp.delete(k); return 1 }),
    store,
  }
}

function setup(useRedis: boolean, env: Record<string, string> = {}) {
  const clock = { t: T0 }
  const texts: string[] = []
  const rows: Record<string, unknown>[] = []
  const deps: AlertDeps = {
    redis: useRedis ? fakeRedis(() => clock.t) : null,
    fetch: (async (_u: string, init: { body: string }) => {
      texts.push(JSON.parse(init.body).text)
      return { ok: true, status: 200 }
    }) as unknown as typeof fetch,
    supabase: () => ({ from: () => ({ insert: async (r: Record<string, unknown>) => { rows.push(r); return { error: null } } }) }),
    now: () => clock.t,
    env: { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_CHAT_ID: '1', NODE_ENV: 'production', ...env },
  }
  return { alerter: createAlerter(deps), clock, texts, rows }
}

const a = (key: string, over: Partial<AlertInput> = {}): AlertInput => ({
  key, severity: 'critical', title: `T ${key}`, body: 'b', cooldownSeconds: 600, ...over,
})

for (const useRedis of [true, false]) {
  const label = useRedis ? 'redis' : 'memory'

  describe(`fingerprints and independence (${label})`, () => {
    it('different fingerprints under one key both alert; the same one is muted', async () => {
      const { alerter, texts } = setup(useRedis)
      await alerter.report(a('wa:delivery_failed', { fingerprint: '131047' }))
      await alerter.report(a('wa:delivery_failed', { fingerprint: '131051' }))
      await alerter.report(a('wa:delivery_failed', { fingerprint: '131047' }))
      expect(texts).toHaveLength(2)
      expect(texts[0]).toContain('wa:delivery_failed#131047')
      expect(texts[1]).toContain('wa:delivery_failed#131051')
    })

    it('an open redis:down does not delay wa:token_invalid', async () => {
      const { alerter, texts } = setup(useRedis)
      await alerter.report(a('redis:down'))
      await alerter.report(a('redis:down')) // muted, issue still open
      await alerter.report(a('wa:token_invalid'))
      expect(texts).toHaveLength(2)
      expect(texts[1]).toContain('wa:token_invalid')
    })
  })

  describe(`repeat counter and escalation (${label})`, () => {
    it('adds the "N more times" line after the cooldown, with the right count', async () => {
      const { alerter, clock, texts, rows } = setup(useRedis)
      await alerter.report(a('k'))
      for (let i = 0; i < 4; i++) await alerter.report(a('k'))
      clock.t += 601_000
      await alerter.report(a('k'))
      expect(texts).toHaveLength(2)
      expect(texts[1]).toContain('This happened 4 more times since the last alert (first alert 10:12 PM IST).')
      expect(String(rows[1].body)).toContain('This happened 4 more times since the last alert')
      expect(String(rows[1].body).length).toBeLessThanOrEqual(400)
    })

    it('omits the line when nothing repeated, and resets after being shown', async () => {
      const { alerter, clock, texts } = setup(useRedis)
      await alerter.report(a('k'))
      clock.t += 601_000
      await alerter.report(a('k'))
      expect(texts[1]).not.toContain('more times')
      await alerter.report(a('k'))
      await alerter.report(a('k'))
      clock.t += 601_000
      await alerter.report(a('k'))
      expect(texts[2]).toContain('This happened 2 more times')
    })

    it('sends exactly one STILL FAILING update at 25 and at 100', async () => {
      const { alerter, texts } = setup(useRedis, { ALERT_MAX_PER_HOUR: '100' })
      await alerter.report(a('k', { cooldownSeconds: 3600 }))
      for (let i = 0; i < 130; i++) await alerter.report(a('k', { cooldownSeconds: 3600 }))
      const updates = texts.filter(t => t.includes('STILL FAILING'))
      expect(ESCALATION_THRESHOLDS).toEqual([25, 100])
      expect(updates).toHaveLength(2)
      expect(updates[0]).toContain('(25 occurrences since 10:12 PM IST)')
      expect(updates[1]).toContain('(100 occurrences since 10:12 PM IST)')
      expect(updates[0]).toContain('First check:')
      expect(texts).toHaveLength(3) // original + 2 updates
    })
  })
}

describe('cap interaction', () => {
  it('muted repeats never consume the hourly cap', async () => {
    const { alerter, texts } = setup(true, { ALERT_MAX_PER_HOUR: '3' })
    await alerter.report(a('one'))
    for (let i = 0; i < 20; i++) await alerter.report(a('one'))
    await alerter.report(a('two'))
    await alerter.report(a('three'))
    expect(texts.filter(t => !t.includes('STILL FAILING'))).toHaveLength(3)
    expect(texts.some(t => t.includes('cap reached'))).toBe(false)
  })
})

describe('fingerprint sanitising', () => {
  it('lowercases, replaces odd characters and caps at 40', () => {
    expect(sanitizeFingerprint('Err Code#131047/x')).toBe('err_code_131047_x')
    expect(sanitizeFingerprint('a@b.co +91 98765')).toBe('a_b_co__91_98765')
    expect(sanitizeFingerprint('x'.repeat(100))).toHaveLength(40)
    expect(sanitizeFingerprint(undefined)).toBe('')
  })

  it('builds the effective key', () => {
    expect(effectiveKey({ key: 'k' })).toBe('k')
    expect(effectiveKey({ key: 'k', fingerprint: '' })).toBe('k')
    expect(effectiveKey({ key: 'k', fingerprint: 'A b' })).toBe('k#a_b')
  })

  it('high-cardinality input is bounded in length', () => {
    const keys = new Set<string>()
    for (let i = 0; i < 50; i++) keys.add(effectiveKey({ key: 'k', fingerprint: `${'long'.repeat(30)}${i}` }))
    for (const k of keys) expect(k.length).toBeLessThanOrEqual('k#'.length + 40)
  })

  it('guides resolve by the base key', () => {
    expect(getAlertGuide('wa:delivery_failed#131047')).toBe(getAlertGuide('wa:delivery_failed'))
    expect(getAlertGuide('wa:delivery_failed#131047')).not.toBe(GENERIC_GUIDE)
    expect(getAlertGuide('5xx:/api/x#y')).toBe(getAlertGuide('5xx:/api/x'))
  })

  it('notification and telegram text use the base guide and show the effective key', () => {
    const input = a('wa:delivery_failed', { fingerprint: '131047' })
    expect(buildTelegramText(input, 'p', T0)).toContain('<code>wa:delivery_failed#131047</code>')
    expect(buildNotificationBody(input, { repeats: 3, lastAt: T0 })).toContain('first alert 10:12 PM IST')
  })
})
