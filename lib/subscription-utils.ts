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
  | 'expiring'   // paid subscription with ≤ EXPIRING_SOON_DAYS remaining
  | 'expired'
  | 'cancelled'
  | 'suspended'
  | 'unknown'

export type SubscriptionState = {
  status: SubscriptionStatus
  daysLeft: number | null
  isExpired: boolean
  isExpiringSoon: boolean  // true when within warning window (trial or paid)
}

/** Days before expiry at which we switch to "expiring" warning state. */
export const EXPIRING_SOON_DAYS = 7

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
 *  - `active` + ≤ EXPIRING_SOON_DAYS remaining → 'expiring' (isExpiringSoon: true)
 *  - `trial` + lapsed date     → expired
 *  - `trial` + ≤ EXPIRING_SOON_DAYS remaining → trial with isExpiringSoon: true
 *  - `trial` + future date     → trial with daysLeft
 *  - null / undefined status   → legacy gym, treated as active
 */
export function computeSubscriptionState(
  gym: GymSubscriptionFields | null | undefined
): SubscriptionState {
  if (!gym) {
    return { status: 'unknown', daysLeft: 0, isExpired: true, isExpiringSoon: false }
  }

  const status = (gym.subscription_status ?? null) as string | null

  // Cancelled or suspended → expired semantics
  if (status === 'cancelled' || status === 'suspended') {
    return { status: status as SubscriptionStatus, daysLeft: 0, isExpired: true, isExpiringSoon: false }
  }

  // Already marked expired
  if (status === 'expired') {
    return { status: 'expired', daysLeft: 0, isExpired: true, isExpiringSoon: false }
  }

  // Active subscription
  if (!status || status === 'active') {
    const subEndsAt = gym.subscription_ends_at ?? null

    // Lifetime plans: subscription_ends_at IS NULL → never expires
    if (status === 'active' && !subEndsAt) {
      return { status: 'active', daysLeft: null, isExpired: false, isExpiringSoon: false }
    }

    if (status === 'active' && subEndsAt) {
      const msLeft = new Date(subEndsAt).getTime() - Date.now()
      const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))

      if (daysLeft <= 0) {
        // Lapsed paid subscription — cron hasn't flipped it yet
        return { status: 'expired', daysLeft: 0, isExpired: true, isExpiringSoon: false }
      }

      if (daysLeft <= EXPIRING_SOON_DAYS) {
        // Within warning window — show renewal banner
        return { status: 'expiring', daysLeft, isExpired: false, isExpiringSoon: true }
      }

      return { status: 'active', daysLeft, isExpired: false, isExpiringSoon: false }
    }

    // Legacy (no status) — treat as perpetual active
    return { status: 'active', daysLeft: null, isExpired: false, isExpiringSoon: false }
  }

  // Trial
  if (status === 'trial') {
    const trialEndsAt = gym.trial_ends_at ?? null
    const endsAt = trialEndsAt ? new Date(trialEndsAt).getTime() : 0
    const msLeft = endsAt - Date.now()
    const daysLeft = Math.ceil(msLeft / (1000 * 60 * 60 * 24))

    if (daysLeft <= 0) {
      return { status: 'expired', daysLeft: 0, isExpired: true, isExpiringSoon: false }
    }

    return {
      status: 'trial',
      daysLeft: Math.max(0, daysLeft),
      isExpired: false,
      isExpiringSoon: daysLeft <= EXPIRING_SOON_DAYS,
    }
  }

  // Unknown status value — treat conservatively as expired
  return { status: 'expired', daysLeft: 0, isExpired: true, isExpiringSoon: false }
}
