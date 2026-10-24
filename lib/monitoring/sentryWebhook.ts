import { createHmac, timingSafeEqual } from 'node:crypto'
import { z } from 'zod'
import { scrubPii, type AlertInput } from '@/lib/monitoring/alert'

/** Sentry signs the raw body with the integration Client Secret: hex HMAC-SHA256 in `sentry-hook-signature`. */
export function verifySentrySignature(rawBody: string, signature: string | null, secret: string): boolean {
  if (!signature) return false
  const expected = createHmac('sha256', secret).update(rawBody, 'utf8').digest()
  const given = Buffer.from(signature.trim(), 'hex')
  // timingSafeEqual throws on a length mismatch, so compare lengths first.
  return given.length === expected.length && timingSafeEqual(given, expected)
}

// Every field optional: Sentry payloads differ per resource and change over time, and a shape
// mismatch must degrade to a thinner alert, never a dropped one.
const str = z.string().optional().nullable()
const payloadSchema = z.object({
  action: str,
  data: z
    .object({
      triggered_rule: str,
      description_title: str,
      web_url: str,
      event: z.object({ title: str, web_url: str, level: str, project: z.union([z.string(), z.number()]).optional().nullable() }).partial().optional(),
      issue: z.object({ title: str, shortId: str, level: str, project: z.object({ slug: str }).partial().optional().nullable(), web_url: str, permalink: str }).partial().optional(),
      metric_alert: z.object({ alert_rule: z.object({ name: str }).partial().optional() }).partial().optional(),
    })
    .partial()
    .optional(),
})

/** Returns null for events we deliberately ignore (resolved metric alerts, non-created issues, unknown resources). */
export function sentryEventToAlert(resource: string | null, json: unknown): AlertInput | null {
  const parsed = payloadSchema.safeParse(json)
  if (!parsed.success) return null
  const { action, data } = parsed.data
  const clip = (s: string | null | undefined, n: number) => scrubPii(s ?? '').slice(0, n)

  if (resource === 'event_alert') {
    const ev = data?.event
    const level = ev?.level ?? 'error'
    const rule = data?.triggered_rule ?? 'event_alert'
    return build('event_alert', rule, level === 'fatal' || level === 'error', clip(ev?.title, 150) || 'Sentry event',
      [`rule: ${clip(rule, 80)}`, typeof ev?.project === 'string' ? `project: ${ev.project}` : '', `level: ${level}`, ev?.web_url ? `url: ${ev.web_url}` : ''])
  }
  if (resource === 'metric_alert') {
    if (action !== 'critical' && action !== 'warning') return null // resolved or unknown
    const name = data?.metric_alert?.alert_rule?.name ?? data?.description_title ?? 'metric_alert'
    return build('metric_alert', name, action === 'critical', clip(data?.description_title ?? name, 150),
      [`status: ${action}`, data?.web_url ? `url: ${data.web_url}` : ''])
  }
  if (resource === 'issue') {
    if (action !== 'created') return null
    const issue = data?.issue
    const level = issue?.level ?? 'error'
    return build('issue', issue?.shortId ?? 'issue', level === 'fatal' || level === 'error', clip(issue?.title, 150) || 'New Sentry issue',
      [issue?.project?.slug ? `project: ${issue.project.slug}` : '', `level: ${level}`, issue?.permalink || issue?.web_url ? `url: ${issue?.permalink ?? issue?.web_url}` : ''])
  }
  return null
}

function build(resource: string, fingerprint: string, critical: boolean, title: string, lines: string[]): AlertInput {
  return {
    key: `sentry:${resource}`,
    fingerprint,
    severity: critical ? 'critical' : 'warning',
    title,
    body: lines.filter(Boolean).join('\n'),
  }
}
