/**
 * Web Push for the member PWA. Table: member_push_subscriptions. Owner-side FCM (gymflow-admin) is a separate system.
 */

export type PushKind =
  | 'notice'
  | 'payment_decision'
  | 'expiring'
  | 'weigh_in'
  | 'measurements'
  | 'goal'
  | 'miss_you'
  | 'weekly_quote'
  | 'streak_risk'

/** Always sent. Everything else shares the daily/weekly cap in lib/push/cap.ts. */
export const ESSENTIAL_PUSH_KINDS: readonly PushKind[] = ['notice', 'payment_decision']

/** Lower number = sent first when the cap leaves room for only some. Essential kinds are not capped. */
export const PUSH_PRIORITY: Record<PushKind, number> = {
  notice: 0,
  payment_decision: 0,
  expiring: 1,
  streak_risk: 2,
  goal: 3,
  measurements: 3,
  weigh_in: 3,
  miss_you: 4,
  weekly_quote: 5,
}

/** How long the push service may hold an undelivered message for an offline phone. */
export const PUSH_TTL_SECONDS: Record<PushKind, number> = {
  notice: 24 * 3600,
  payment_decision: 24 * 3600,
  expiring: 24 * 3600,
  weigh_in: 12 * 3600,
  measurements: 12 * 3600,
  goal: 12 * 3600,
  miss_you: 6 * 3600,
  weekly_quote: 6 * 3600,
  streak_risk: 3 * 3600,
}

export const PUSH_LIMITS = {
  perDay: 1,
  perWeek: 4,
  /** IST hours (inclusive start, exclusive end) in which non-essential pushes may go out. */
  quietStartHour: 21,
  quietEndHour: 7,
  titleMax: 60,
  bodyMax: 140,
  endpointMax: 600,
  failuresBeforeDelete: 5,
} as const

/** What the browser's PushManager.subscribe() gives back (subscription.toJSON()). */
export interface PushSubscriptionJSON {
  endpoint: string
  keys: { p256dh: string; auth: string }
}

/** What the service worker receives in the push event (JSON). No amounts or personal data: lock screens are public. */
export interface PushPayload {
  title: string
  body: string
  /** Same-origin path starting with /m/ . The worker refuses anything else. */
  url: string
  /** Same tag replaces an earlier notification instead of stacking. */
  tag: string
}

/** Job published to the QStash worker POST /api/push/send. The worker fills `title` with the gym name. */
export interface PushJob {
  gymId: string
  kind: PushKind
  /** Dedupe reference, e.g. notice id, request id, end date, ISO week. Key: push:{kind}:{ref}:{memberId}. */
  ref: string
  /** Undefined = every subscribed member of the gym. */
  memberIds?: string[]
  body: string
  url: string
  tag?: string
  /** Resume point for large gyms when the 40 s budget runs out (a member id). */
  cursor?: string
}

export type PushDeviceState = 'unsupported' | 'ios-needs-install' | 'denied' | 'off' | 'on'
