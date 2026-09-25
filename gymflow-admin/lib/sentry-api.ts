const SENTRY_BASE = 'https://sentry.io/api/0'

function sentryHeaders() {
  const token = process.env.SENTRY_AUTH_TOKEN
  if (!token) throw new Error('Missing SENTRY_AUTH_TOKEN')
  return {
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  }
}

function projectBase() {
  const org = process.env.SENTRY_ORG
  const project = process.env.SENTRY_PROJECT
  if (!org || !project) throw new Error('Missing SENTRY_ORG or SENTRY_PROJECT')
  return `${SENTRY_BASE}/projects/${org}/${project}`
}

export interface SentryIssue {
  id: string
  title: string
  culprit: string
  level: 'error' | 'warning' | 'info' | 'debug' | 'fatal'
  status: 'resolved' | 'unresolved' | 'ignored'
  count: string
  userCount: number
  firstSeen: string
  lastSeen: string
  permalink: string
  metadata: { value?: string; type?: string }
}

export interface SentryEvent {
  id: string
  title: string
  level: string
  platform: string
  dateCreated: string
  message: string
  culprit: string
  tags: { key: string; value: string }[]
}

export async function getSentryIssues(query = '', limit = 50): Promise<SentryIssue[]> {
  const url = `${projectBase()}/issues/?limit=${limit}&query=${encodeURIComponent(query)}&sort=date`
  const res = await fetch(url, { headers: sentryHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Sentry API error: ${res.status}`)
  return res.json()
}

/**
 * Sentry issues with a hard latency ceiling and a short shared cache.
 *
 * `getSentryIssues` above has no timeout, and the dashboard route awaits two of
 * them inside a `Promise.allSettled`. `allSettled` resolves only when every entry
 * settles, so a single slow Sentry response held the whole dashboard payload —
 * the admin API's own transport measures ~85ms warm, so Sentry was essentially
 * all of the multi-second dashboard latency.
 *
 * Two changes make that impossible:
 *
 *   timeout  an AbortController caps the wait. Sentry data on this screen is a
 *            count and five recent titles; it is not worth blocking the gym and
 *            member figures for. On timeout the caller gets [] and the rest of
 *            the dashboard still renders.
 *
 *   cache    issues are cached per query for a few seconds. The mobile app can
 *            focus the dashboard tab repeatedly in quick succession, and without
 *            this each focus re-queried Sentry. Module scope, so it is per warm
 *            lambda — good enough for smoothing a burst, and it self-evicts.
 */
const issuesCache = new Map<string, { at: number; data: SentryIssue[] }>()
const ISSUES_TTL_MS = 15_000

export async function getSentryIssuesFast(
  query = '',
  limit = 50,
  timeoutMs = 2_500,
): Promise<SentryIssue[]> {
  const cacheKey = `${query}|${limit}`
  const hit = issuesCache.get(cacheKey)
  if (hit && Date.now() - hit.at < ISSUES_TTL_MS) return hit.data

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const url = `${projectBase()}/issues/?limit=${limit}&query=${encodeURIComponent(query)}&sort=date`
    const res = await fetch(url, {
      headers: sentryHeaders(),
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) throw new Error(`Sentry API error: ${res.status}`)
    const data = (await res.json()) as SentryIssue[]
    issuesCache.set(cacheKey, { at: Date.now(), data })
    return data
  } catch {
    // Serve a stale value over failing the panel, whatever the cause (abort,
    // network, missing token). Only give up if there is nothing to fall back on.
    if (hit) return hit.data
    return []
  } finally {
    clearTimeout(timer)
  }
}

export async function getSentryIssue(issueId: string): Promise<SentryIssue> {
  const org = process.env.SENTRY_ORG
  const url = `${SENTRY_BASE}/organizations/${org}/issues/${issueId}/`
  const res = await fetch(url, { headers: sentryHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Sentry API error: ${res.status}`)
  return res.json()
}

export async function getSentryEvents(limit = 100): Promise<SentryEvent[]> {
  const url = `${projectBase()}/events/?limit=${limit}&full=true`
  const res = await fetch(url, { headers: sentryHeaders(), cache: 'no-store' })
  if (!res.ok) throw new Error(`Sentry API error: ${res.status}`)
  return res.json()
}

export async function getSentryStats(): Promise<{ errors: number; warnings: number; events: number }> {
  try {
    const [errors, warnings] = await Promise.all([
      getSentryIssues('level:error is:unresolved', 1),
      getSentryIssues('level:warning is:unresolved', 1),
    ])
    return {
      errors: parseInt(errors?.[0]?.count ?? '0', 10),
      warnings: parseInt(warnings?.[0]?.count ?? '0', 10),
      events: 0,
    }
  } catch {
    return { errors: 0, warnings: 0, events: 0 }
  }
}

export async function resolveSentryIssue(issueId: string): Promise<void> {
  const org = process.env.SENTRY_ORG
  const url = `${SENTRY_BASE}/organizations/${org}/issues/${issueId}/`
  await fetch(url, {
    method: 'PUT',
    headers: sentryHeaders(),
    body: JSON.stringify({ status: 'resolved' }),
  })
}
