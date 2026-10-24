import { ProbeConfig, Expect, TIMEOUT_MS, RETRY_DELAY_MS } from './config'

export interface ProbeResult {
  name: string
  critical: boolean
  ok: boolean
  /** Short human reason when !ok. Never contains secrets. */
  reason: string
}

export type FetchFn = (input: string, init?: RequestInit) => Promise<Response>
export type SleepFn = (ms: number) => Promise<void>

export const realSleep: SleepFn = (ms) => new Promise((r) => setTimeout(r, ms))

/** Returns a failure reason, or null when the response meets the expectation. */
export function classify(expect: Expect, status: number, body: string | null): string | null {
  if (expect.status !== undefined && status !== expect.status) return `status ${status}, expected ${expect.status}`
  if (expect.statusMin !== undefined && status < expect.statusMin) return `status ${status}`
  if (expect.statusMax !== undefined && status > expect.statusMax) return `status ${status}`
  if (expect.bodyIncludes !== undefined && !(body ?? '').includes(expect.bodyIncludes)) {
    return `keyword "${expect.bodyIncludes}" missing`
  }
  if (expect.json) {
    try {
      JSON.parse(body ?? '')
    } catch {
      return 'response is not JSON'
    }
  }
  return null
}

function describeError(e: unknown): string {
  const name = (e as { name?: string })?.name
  return name === 'TimeoutError' || name === 'AbortError' ? 'timeout' : 'network error'
}

export async function runProbe(
  probe: ProbeConfig,
  env: { HEALTH_CHECK_SECRET?: string },
  fetchFn: FetchFn,
  sleep: SleepFn = realSleep,
  canRetry: () => boolean = () => true,
): Promise<ProbeResult> {
  const base = { name: probe.name, critical: probe.critical }
  const headers: Record<string, string> = { 'user-agent': 'gymflow-monitoring/1' }
  if (probe.healthSecret) {
    if (!env.HEALTH_CHECK_SECRET) return { ...base, ok: false, reason: 'HEALTH_CHECK_SECRET not set on the Worker' }
    headers['x-health-secret'] = env.HEALTH_CHECK_SECRET
  }

  let reason = 'unknown'
  for (let attempt = 1; attempt <= 2; attempt++) {
    let retryable = false
    try {
      // redirect: manual so a 3xx is judged as-is (status page) and guards are not followed to a login page.
      const res = await fetchFn(probe.url, { headers, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })
      const needBody = probe.expect.bodyIncludes !== undefined || probe.expect.json
      const body = needBody ? await res.text() : null
      const fail = classify(probe.expect, res.status, body)
      if (fail === null) return { ...base, ok: true, reason: '' }
      reason = fail
      retryable = res.status >= 500
    } catch (e) {
      reason = describeError(e)
      retryable = true
    }
    if (!retryable || attempt === 2 || !canRetry()) break
    await sleep(RETRY_DELAY_MS)
  }
  return { ...base, ok: false, reason }
}
