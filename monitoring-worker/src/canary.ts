import { CANARY_BASE, TIMEOUT_MS } from './config'
import type { FetchFn, ProbeResult } from './probe'

/** Minimal cookie jar: name=value only, built from Set-Cookie headers. Never logged. */
function updateJar(jar: Map<string, string>, res: Response): void {
  const list = (res.headers as unknown as { getSetCookie?: () => string[] }).getSetCookie?.() ?? []
  for (const line of list) {
    const first = line.split(';')[0]
    const eq = first.indexOf('=')
    if (eq <= 0) continue
    const name = first.slice(0, eq).trim()
    const value = first.slice(eq + 1).trim()
    if (value === '' || /max-age=0/i.test(line)) jar.delete(name)
    else jar.set(name, value)
  }
}

const cookieHeader = (jar: Map<string, string>) => [...jar].map(([k, v]) => `${k}=${v}`).join('; ')

/**
 * Read-only journey: login -> GET /api/dashboard/expiring -> logout (scope local).
 * Run it only against a dedicated canary owner account.
 * Reasons are fixed strings (status codes only), so no cookie, password or token can leak.
 */
export async function runCanary(
  env: { CANARY_EMAIL?: string; CANARY_PASSWORD?: string },
  fetchFn: FetchFn,
): Promise<ProbeResult[]> {
  if (!env.CANARY_EMAIL || !env.CANARY_PASSWORD) {
    return [{ name: 'canary:login', critical: false, ok: false, reason: 'CANARY_EMAIL / CANARY_PASSWORD not set' }]
  }
  const jar = new Map<string, string>()
  const json = { 'content-type': 'application/json', 'x-requested-with': 'XMLHttpRequest' }
  const results: ProbeResult[] = []
  const call = (path: string, init: RequestInit) =>
    fetchFn(CANARY_BASE + path, { ...init, redirect: 'manual', signal: AbortSignal.timeout(TIMEOUT_MS) })

  // Step 1: login
  try {
    const res = await call('/api/auth/login', {
      method: 'POST',
      headers: json,
      body: JSON.stringify({ email: env.CANARY_EMAIL, password: env.CANARY_PASSWORD }),
    })
    updateJar(jar, res)
    const data = (await res.json().catch(() => null)) as { success?: boolean; role?: string } | null
    const ok = res.status === 200 && data?.success === true && data.role === 'owner' && jar.size > 0
    results.push({ name: 'canary:login', critical: true, ok, reason: ok ? '' : `login status ${res.status}` })
    if (!ok) return results
  } catch {
    return [{ name: 'canary:login', critical: true, ok: false, reason: 'network error or timeout' }]
  }

  // Step 2: cheap read of the canary gym's data
  try {
    const res = await call('/api/dashboard/expiring', {
      headers: { cookie: cookieHeader(jar), 'x-requested-with': 'XMLHttpRequest' },
    })
    const data = (await res.json().catch(() => null)) as { success?: boolean } | null
    const ok = res.status === 200 && data?.success === true
    results.push({ name: 'canary:read', critical: true, ok, reason: ok ? '' : `read status ${res.status}` })
  } catch {
    results.push({ name: 'canary:read', critical: true, ok: false, reason: 'network error or timeout' })
  }

  // EXTENSION POINT: write steps (check-in then undo) go here.
  // Do NOT add them until a dedicated canary gym exists with WhatsApp switched off
  // (gyms.whatsapp_enabled = false). See README "Canary gym safety setup".

  // Step 3: logout, local scope so other sessions of this account are not revoked
  try {
    const res = await call('/api/auth/signout', {
      method: 'POST',
      headers: { ...json, cookie: cookieHeader(jar) },
      body: JSON.stringify({ scope: 'local' }),
    })
    const ok = res.status === 200
    results.push({ name: 'canary:logout', critical: false, ok, reason: ok ? '' : `logout status ${res.status}` })
  } catch {
    results.push({ name: 'canary:logout', critical: false, ok: false, reason: 'network error or timeout' })
  }
  return results
}
