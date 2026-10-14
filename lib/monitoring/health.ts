/**
 * Pure health-check engine: no env access, no framework imports, so it is unit tested.
 * `detail` is always a short fixed code, never a raw error message (the deep endpoint is
 * called by an external monitor and its output must never leak internals).
 */
import { createHash, timingSafeEqual } from 'crypto'

export interface CheckResult { ok: boolean; latencyMs: number; detail?: string }
export interface CheckDefinition {
  name: string
  critical: boolean
  run: () => Promise<{ ok: boolean; detail?: string }>
}
export type HealthStatus = 'healthy' | 'degraded' | 'unhealthy'
export interface HealthReport {
  status: HealthStatus
  checks: Record<string, CheckResult>
  timestamp: string
}

async function runOne(def: CheckDefinition, timeoutMs: number): Promise<CheckResult> {
  const start = Date.now()
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    const timeout = new Promise<'timeout'>((resolve) => {
      timer = setTimeout(() => resolve('timeout'), timeoutMs)
    })
    const res = await Promise.race([def.run(), timeout])
    const latencyMs = Date.now() - start
    if (res === 'timeout') return { ok: false, latencyMs, detail: 'timeout' }
    return { ok: res.ok, latencyMs, ...(res.detail ? { detail: res.detail } : {}) }
  } catch {
    return { ok: false, latencyMs: Date.now() - start, detail: 'error' }
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function runChecks(
  definitions: CheckDefinition[],
  { timeoutMs = 3000 }: { timeoutMs?: number } = {},
): Promise<HealthReport> {
  const results = await Promise.all(definitions.map((d) => runOne(d, timeoutMs)))
  const checks: Record<string, CheckResult> = {}
  let status: HealthStatus = 'healthy'
  definitions.forEach((d, i) => {
    checks[d.name] = results[i]
    if (!results[i].ok) {
      if (d.critical) status = 'unhealthy'
      else if (status === 'healthy') status = 'degraded'
    }
  })
  return { status, checks, timestamp: new Date().toISOString() }
}

export function httpStatusFor(status: HealthStatus): number {
  return status === 'unhealthy' ? 503 : 200
}

/** Hash both sides first so the buffers always have equal length (no length leak). */
export function timingSafeSecretEqual(a: string, b: string): boolean {
  const ha = createHash('sha256').update(a).digest()
  const hb = createHash('sha256').update(b).digest()
  return timingSafeEqual(ha, hb)
}
