import { describe, it, expect, vi, afterEach } from 'vitest'
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  runChecks,
  httpStatusFor,
  timingSafeSecretEqual,
  type CheckDefinition,
} from '@/lib/monitoring/health'
import { pingHeartbeat } from '@/lib/monitoring/heartbeat'
import { checkDailyAutomation } from '@/lib/monitoring/checks'

vi.mock('server-only', () => ({}))

const ok = (name: string, critical: boolean): CheckDefinition => ({
  name, critical, run: async () => ({ ok: true }),
})
const bad = (name: string, critical: boolean): CheckDefinition => ({
  name, critical, run: async () => ({ ok: false, detail: 'backlog' }),
})

describe('rollup', () => {
  it('healthy when everything passes', async () => {
    const r = await runChecks([ok('a', true), ok('b', false)])
    expect(r.status).toBe('healthy')
    expect(httpStatusFor(r.status)).toBe(200)
  })
  it('degraded when only a non-critical check fails', async () => {
    const r = await runChecks([ok('a', true), bad('b', false)])
    expect(r.status).toBe('degraded')
    expect(httpStatusFor(r.status)).toBe(200)
  })
  it('unhealthy when a critical check fails', async () => {
    const r = await runChecks([bad('a', true), bad('b', false)])
    expect(r.status).toBe('unhealthy')
    expect(httpStatusFor(r.status)).toBe(503)
  })
})

describe('timeouts and errors', () => {
  it('times out a hanging check without hanging', async () => {
    const hang: CheckDefinition = { name: 'h', critical: false, run: () => new Promise(() => {}) }
    const r = await runChecks([hang], { timeoutMs: 50 })
    expect(r.checks.h).toMatchObject({ ok: false, detail: 'timeout' })
  })
  it('never leaks the raw error message', async () => {
    const boom: CheckDefinition = {
      name: 'x', critical: true,
      run: async () => { throw new Error('secret-conn-string postgres://u:p@h') },
    }
    const r = await runChecks([boom])
    expect(r.checks.x.detail).toBe('error')
    expect(JSON.stringify(r)).not.toContain('secret-conn-string')
  })
})

describe('timingSafeSecretEqual', () => {
  it('matches equal and rejects different or different-length values', () => {
    expect(timingSafeSecretEqual('abc', 'abc')).toBe(true)
    expect(timingSafeSecretEqual('abc', 'abd')).toBe(false)
    expect(timingSafeSecretEqual('abc', 'abcd')).toBe(false)
    expect(timingSafeSecretEqual('', 'abc')).toBe(false)
  })
})

describe('pingHeartbeat', () => {
  afterEach(() => vi.unstubAllGlobals())
  it('is a no-op when unset', async () => {
    const f = vi.fn()
    vi.stubGlobal('fetch', f)
    await pingHeartbeat(undefined)
    expect(f).not.toHaveBeenCalled()
  })
  it('swallows fetch failures', async () => {
    vi.stubGlobal('fetch', vi.fn().mockRejectedValue(new Error('net down')))
    await expect(pingHeartbeat('https://example.test/token')).resolves.toBeUndefined()
  })
})

describe('daily_automation (cron heartbeat, not log rows)', () => {
  const now = Date.parse('2026-10-24T12:00:00Z')
  it('ok when the cron succeeded recently', async () => {
    expect(await checkDailyAutomation(async () => new Date(now - 3600_000), now)).toEqual({ ok: true })
  })
  it('stale after 26 h', async () => {
    expect(await checkDailyAutomation(async () => new Date(now - 27 * 3600_000), now)).toEqual({ ok: false, detail: 'stale' })
  })
  it('unknown (not an alarm) when no success is recorded', async () => {
    expect(await checkDailyAutomation(async () => null, now)).toEqual({
      ok: true, detail: 'unknown (no cron success recorded yet)',
    })
  })
})

describe('deep route source', () => {
  const src = readFileSync(join(process.cwd(), 'app/api/health/deep/route.ts'), 'utf8')
  it('uses the timing-safe compare and answers 401 before running checks', () => {
    expect(src).toContain('timingSafeSecretEqual(')
    expect(src).not.toMatch(/===\s*secret|secret\s*===/)
    expect(src.indexOf('status: 401')).toBeGreaterThan(-1)
    expect(src.indexOf('status: 401')).toBeLessThan(src.indexOf('runChecks('))
  })
  it('returns 503 when the secret is unset', () => {
    expect(src).toContain("'unconfigured'")
  })
})
