/**
 * lib/subscription-utils.ts
 *
 * Pure, Edge-compatible subscription state computation.
 * Contains NO Node.js-only imports, NO DB calls, NO Redis.
 *
 * Importable from:
 *   - middleware.ts  (Edge runtime)
 *   - lib/dal.ts     (Node.js runtime)
 *   - lib/subscriptionGuard.ts (Node.js runtime)
 *
 * SubscriptionStatus is the authoritative union type. The DB CHECK constraint
 * and TypeScript types are kept in sync via the migration
 * 20260718_subscription_status_expand.sql.
 */

export type SubscriptionStatus =
  | 'trial'
  | 'active'
  | 'expired'
  | 'cancelled'
  | 'suspended'
  | 'unknown'

export type SubscriptionState = {
  status: SubscriptionStatus
  daysLeft: number | null
  isExpired: boolean
}

/**
 * Minimal shape required from a gyms row to compute subscription state.
 * All fields are optional to handle legacy rows that predate the migration.
 */
export type GymSubscriptionFields = {
  subscription_status?: string | null
  plan_type?: string | null
  trial_ends_at?: string | null
  subscription_ends_at?: string | null
}

/**
 * computeSubscriptionState
 *
 * The single authoritative function for determining a gym's effective
 * subscription state from a raw DB row. No network calls. Pure function.
 *
 * Rules:
 *  - `cancelled` / `suspended` → treated as expired (isExpired: true)
 *  - `expired`                 → expired
 *  - `active` + lapsed date    → expired (cron may not have flipped it yet)
 *  - `active` + null date      → lifetime, never expires
 *  - `trial` + lapsed date     → expired
 *  - `trial` + future date     → trial with daysLeft
 *  - null / undefined status   → legacy gym, treated as active
 */
export function computeSubscriptionState(
  gym: GymSubscriptionFields | null | undefined
): SubscriptionState {
  if (!gym) {
    return { status: 'unknown', daysLeft: 0, isExpired: true }
  }

  const status = (gym.subscription_status ?? null) as string | null

  // Cancelled or suspended → expired semantics
  if (status === 'cancelled' || status === 'suspended') {
    return { status: status as SubscriptionStatus, daysLeft: 0, isExpired: true }
  }

  // Already marked expired
  if (status === 'expired') {
    return { status: 'expired', daysLeft: 0, isExpired: true }
  }

  // Active subscription
  if (!status || status === 'active') {
    // Lifetime plans: subscription_ends_at IS NULL → never expires
    const subEndsAt = gym.subscription_ends_at ?? null
    if (status === 'active' && subEndsAt && new Date(subEndsAt).getTime() < Date.now()) {
      // Lapsed paid subscription — cron hasn't flipped it yet
      return { status: 'expired', daysLeft: 0, isExpired: true }
    }
    // Legacy (no status) or active within window
    return { status: 'active', daysLeft: null, isExpired: false }
  }

  // Trial
  if (status === 'trial') {
    const trialEndsAt = gym.trial_ends_at ?? null
    const endsAt = trialEndsAt ? new Date(trialEndsAt).getTime() : 0
    const msLeft = endsAt - Date.now()
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))
    return {
      status: daysLeft <= 0 ? 'expired' : 'trial',
      daysLeft: Math.max(0, daysLeft),
      isExpired: daysLeft <= 0,
    }
  }

  // Unknown status value — treat conservatively as expired
  return { status: 'expired', daysLeft: 0, isExpired: true }
}
