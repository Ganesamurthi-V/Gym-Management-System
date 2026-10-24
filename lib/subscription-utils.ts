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

// ── Free plan and trial limits ───────────────────────────────────────────────
// Pure helpers shared by middleware, routes and UI. The database enforces the
// Free member cap with a trigger; these mirror it so the UI and import can
// explain the limit instead of surfacing a raw DB error.

/** A Free gym may hold at most this many members. */
export const FREE_PLAN_MEMBER_LIMIT = 50
/** During the trial only the first N members (by join date) get member-app access. */
export const TRIAL_APP_MEMBER_LIMIT = 50
/** A trial gym may import at most this many rows per import. */
export const TRIAL_IMPORT_ROW_LIMIT = 50
/** Monthly price of the WhatsApp add-on for Free gyms. */
export const WHATSAPP_ADDON_PRICE_INR = 299

export function isFreePlan(plan: string | null | undefined): boolean {
  return plan === 'free'
}

/** The member app is off for Free gyms. */
export function planAllowsMemberApp(plan: string | null | undefined): boolean {
  return plan !== 'free'
}

/** Free gyms send WhatsApp only while the paid add-on is running. */
export function planAllowsWhatsApp(
  plan: string | null | undefined,
  addonUntil: string | Date | null | undefined,
  now: Date,
): boolean {
  if (plan !== 'free') return true
  if (!addonUntil) return false
  const until = new Date(addonUntil).getTime()
  return Number.isFinite(until) && until > now.getTime()
}

/**
 * rank is the 0-based position of a member when the gym's members are ordered by
 * join date ascending. Only trial gyms cap app access by rank; Free has the app
 * off entirely (planAllowsMemberApp), so it is capped here too as a safe default.
 */
export function isAppEligibleRank(plan: string | null | undefined, rank: number): boolean {
  if (plan === 'trial' || plan === 'free') return rank < TRIAL_APP_MEMBER_LIMIT
  return true
}

/** How many import rows may be inserted for this plan and current member count. */
export function importRowsToTake(
  plan: string | null | undefined,
  existingCount: number,
  rowCount: number,
): number {
  if (plan === 'trial') return Math.min(rowCount, TRIAL_IMPORT_ROW_LIMIT)
  if (plan === 'free') return Math.min(rowCount, Math.max(0, FREE_PLAN_MEMBER_LIMIT - existingCount))
  return rowCount
}
