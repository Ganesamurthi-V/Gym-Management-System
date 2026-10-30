import type { PushKind, PushPayload } from '@/types/push'
import { PUSH_LIMITS } from '@/types/push'

function trimTo(s: string, max: number): string {
  const t = s.replace(/\s+/g, ' ').trim()
  return t.length <= max ? t : t.slice(0, Math.max(0, max - 1)).trimEnd() + '…'
}

/** Same-origin member path only. Anything else (absolute URL, protocol-relative, other area) becomes /m/home. */
export function sanitizePushUrl(url: string): string {
  if (typeof url !== 'string' || !url.startsWith('/m/') || /[\\\r\n]/.test(url)) return '/m/home'
  return url
}

export function buildPushPayload(
  kind: PushKind,
  input: { gymName: string; body: string; url: string; tag?: string },
): PushPayload {
  return {
    title: trimTo(input.gymName || 'Your gym', PUSH_LIMITS.titleMax),
    body: trimTo(input.body, PUSH_LIMITS.bodyMax),
    url: sanitizePushUrl(input.url),
    tag: input.tag || kind,
  }
}

const pick = (variants: readonly string[], seed: number) => variants[Math.abs(seed) % variants.length]

/**
 * Ready-made bodies. Lock screens are public: no amounts, no weights, no guilt, no emojis.
 * Variant pickers take a seed (e.g. the day number) so copy rotates without randomness in tests.
 */
export const PUSH_COPY = {
  renewalApproved: 'Your renewal payment was approved. Your membership is updated.',
  renewalRejected: 'Your renewal payment could not be approved. Open the app to see why.',
  dueApproved: 'Your due payment was approved. Thank you.',
  dueRejected: 'Your due payment could not be approved. Open the app to see why.',
  /** The notice title is the owner's own text; the builder trims it to the body limit. */
  notice: (title: string) => title,
  expiring: (daysLeft: 1 | 3) =>
    daysLeft === 1 ? 'Your membership ends tomorrow. Renew to keep training.' : 'Your membership ends in 3 days. Renew to keep training.',
  weighIn: 'Time for your weekly weigh-in.',
  measurements: 'Update your measurements for this month.',
  goalDateNear: 'Your goal date is in 7 days. You are close.',
  goalReached: 'You reached your target weight. Well done.',
  missYou: (seed = 0) => pick([
    'Your next workout is waiting. 20 minutes is enough.',
    'Ready when you are. A short session counts.',
    'Your gym is open whenever you are ready.',
  ], seed),
  weeklyQuote: (quote: string) => quote,
  streakRisk: (seed = 0) => pick([
    'Check in today to keep your streak going.',
    'A quick session today keeps your streak alive.',
  ], seed),
} as const
