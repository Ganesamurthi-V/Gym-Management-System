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
// Free and Trial member cap (every insert) with a trigger; these mirror it so the
// UI, the add route and import can explain the limit instead of surfacing a raw DB error.

/**
 * The one member limit of the Free plan and of the trial (Member App, WhatsApp and import
 * coverage). Must equal public.plan_member_limit() in supabase-schema.sql; a test enforces it.
 */
export const PLAN_MEMBER_LIMIT = 50

/**
 * Whether the owner may write (add members, record payments, send, import...). A deactivated gym
 * or one whose subscription has lapsed is read-only on the server, not only behind the UI paywall.
 * Uses the same rule as the paywall (computeSubscriptionState), so the two never disagree.
 */
export function gymIsWritable(gym: (GymSubscriptionFields & { is_active?: boolean | null }) | null | undefined): boolean {
  if (!gym) return false
  return gym.is_active !== false && !computeSubscriptionState(gym).isExpired
}

/** Trial and Free gyms cannot hold more than this many members by any path. */
export const MEMBER_CAP = PLAN_MEMBER_LIMIT
export const MEMBER_CAP_MESSAGE = `Reached ${PLAN_MEMBER_LIMIT} members. Upgrade the plan to add more.`
/** Tooltip / aria text on a locked "Add member" control. */
export const MEMBER_CAP_TOOLTIP = `Reached ${PLAN_MEMBER_LIMIT} members, upgrade the plan`

/** True when this plan is capped and the gym already holds the cap (no more adds or imports). */
export function memberCapReached(plan: string | null | undefined, memberCount: number): boolean {
  return (plan === 'trial' || plan === 'free') && memberCount >= MEMBER_CAP
}

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
 * How many import rows may be inserted for this plan and current member count.
 * Trial and Free share one rule: the cap is 50 members for the whole gym, so each
 * upload only gets the room that is left (a per-upload cap let owners import 50
 * again and again). Manual adds are capped at the same number (see memberCapReached).
 */
export function importRowsToTake(
  plan: string | null | undefined,
  existingCount: number,
  rowCount: number,
): number {
  if (plan === 'trial') return Math.min(rowCount, Math.max(0, PLAN_MEMBER_LIMIT - existingCount))
  if (plan === 'free') return Math.min(rowCount, Math.max(0, PLAN_MEMBER_LIMIT - existingCount))
  return rowCount
}

/**
 * The row cap shown to the owner before they pick a file. Only trial and Free gyms
 * have one; null means "no cap" so the UI shows nothing. Informational: the import
 * confirm route re-applies importRowsToTake and stays the authority.
 */
export function importMaxRowsForDisplay(
  plan: string | null | undefined,
  existingCount: number,
): number | null {
  if (plan !== 'trial' && plan !== 'free') return null
  return importRowsToTake(plan, existingCount, Number.MAX_SAFE_INTEGER)
}
