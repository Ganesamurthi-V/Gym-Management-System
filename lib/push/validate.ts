import { z } from 'zod'
import { PUSH_LIMITS } from '@/types/push'

const EXACT_HOSTS = new Set(['fcm.googleapis.com', 'updates.push.services.mozilla.com', 'web.push.apple.com'])

function hostAllowed(host: string): boolean {
  if (EXACT_HOSTS.has(host)) return true
  return host.endsWith('.push.apple.com') || host.endsWith('.notify.windows.com')
}

/**
 * SSRF defence: the server POSTs to a member-supplied URL, so only well-known push services are allowed.
 * Pure; called by the route (via the schema) and again by the sender before every send.
 * URL parsing lowercases the host, so `FCM.googleapis.com` is the same host; a trailing dot is NOT
 * normalised away, so `fcm.googleapis.com.` fails the exact match and is refused.
 */
export function isAllowedPushEndpoint(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length === 0 || raw.length > PUSH_LIMITS.endpointMax) return false
  let u: URL
  try { u = new URL(raw) } catch { return false }
  if (u.protocol !== 'https:') return false
  if (u.username || u.password) return false
  if (u.port && u.port !== '443') return false
  if (u.hostname.startsWith('[') || /^[0-9.]+$/.test(u.hostname)) return false // IP literals
  if (u.hostname.startsWith('.') || u.hostname.endsWith('.')) return false
  return hostAllowed(u.hostname)
}

const keyString = (max: number) => z.string().min(1).max(max).regex(/^[A-Za-z0-9_\-+/=]+$/)

export const pushSubscriptionSchema = z.object({
  endpoint: z.string().max(PUSH_LIMITS.endpointMax).refine(isAllowedPushEndpoint, 'Unsupported push service'),
  keys: z.object({
    p256dh: keyString(200),
    auth: keyString(100),
  }),
  userAgent: z.string().trim().max(300).optional(),
})
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionSchema>

export const unsubscribeSchema = z.object({
  endpoint: z.string().min(1).max(PUSH_LIMITS.endpointMax),
})
